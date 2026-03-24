/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ChatMessage, ContentPart } from '../types';
import { ILocalStorageService } from '../services/storageService';
import {
  DEFAULT_MEMORY_REQUESTER,
  MEMORY_COMPACTION_BATCH_SIZE,
  MEMORY_MAX_EPISODES,
  MEMORY_PROMPT_CHAR_BUDGET,
  MEMORY_RECENT_EPISODES_TO_KEEP_RAW,
  MEMORY_RETRIEVAL_TOP_K,
} from './config';
import { MemoryScope } from './types/domain';
import { MemoryEpisodeRecord } from './types/entities';
import { WorkingContextService } from './domains/workingContext/WorkingContextService';
import { LongTermMemoryService } from './domains/longTermMemory/LongTermMemoryService';
import { RetrieverRankerService } from './domains/retrieverRanker/RetrieverRankerService';
import { ConsolidatorService } from './domains/consolidator/ConsolidatorService';
import { ForgettingPolicyService } from './domains/forgettingPolicy/ForgettingPolicyService';
import { PromptAssemblerService } from './domains/promptAssembler/PromptAssemblerService';

const DEFAULT_SCOPES: MemoryScope[] = ['agent', 'team', 'global'];

export class MemoryPipelineOrchestrator {
  private workingContextService = new WorkingContextService();
  private longTermMemoryService: LongTermMemoryService;
  private retrieverRankerService = new RetrieverRankerService();
  private consolidatorService = new ConsolidatorService();
  private forgettingPolicyService = new ForgettingPolicyService();
  private promptAssemblerService = new PromptAssemblerService();

  constructor(private localStorageService: ILocalStorageService) {
    this.longTermMemoryService = new LongTermMemoryService(localStorageService);
  }

  async load(): Promise<void> {
    await this.longTermMemoryService.load();
  }

  async clear(scope?: MemoryScope): Promise<void> {
    await this.longTermMemoryService.clear(scope);
  }

  getEpisodeCount(): number {
    return this.collectScopedEpisodes(DEFAULT_SCOPES).length;
  }

  async recordTurn(userText: string, modelText: string): Promise<void> {
    const timestamp = Date.now();
    const keywords = this.extractKeywords(`${userText}\n${modelText}`, 16);

    const episode: MemoryEpisodeRecord = {
      id: `mem_${timestamp}_${Math.random().toString(36).slice(2, 10)}`,
      kind: 'turn',
      scope: 'agent',
      ownerAgentId: DEFAULT_MEMORY_REQUESTER.agentId,
      ownerTeamId: DEFAULT_MEMORY_REQUESTER.teamId,
      summary: this.buildTurnSummary(userText, modelText),
      keywords,
      createdAt: timestamp,
      accessCount: 0,
      lastAccessedAt: timestamp,
      accessPolicy: {
        tier: 'private',
        readers: [DEFAULT_MEMORY_REQUESTER.agentId],
        writers: [DEFAULT_MEMORY_REQUESTER.agentId],
      },
      provenance: {
        sourceAgentId: DEFAULT_MEMORY_REQUESTER.agentId,
        sourceTeamId: DEFAULT_MEMORY_REQUESTER.teamId,
        createdAt: timestamp,
        revision: 1,
      },
    };

    await this.longTermMemoryService.appendEpisode(episode);
    await this.applyCompactionAndForgetting('agent');
  }

  async buildContextPart(
    query: string,
    history: ChatMessage[],
  ): Promise<ContentPart | null> {
    const actor = {
      ...DEFAULT_MEMORY_REQUESTER,
      scope: 'agent' as const,
    };
    const workingContext = this.workingContextService.buildWorkingContext(
      history,
      actor,
      6,
    );

    const episodes = this.collectScopedEpisodes(DEFAULT_SCOPES);
    if (episodes.length === 0) {
      return null;
    }

    const ranked = this.retrieverRankerService.retrieveAndRank(
      {
        requester: DEFAULT_MEMORY_REQUESTER,
        queryText: query,
        recentUserTurns: workingContext.turns,
        maxResults: MEMORY_RETRIEVAL_TOP_K,
      },
      episodes,
    );

    if (ranked.length === 0) {
      return null;
    }

    const lines = ranked.map((candidate) => {
      const episode = episodes.find((item) => item.id === candidate.episodeId);
      if (!episode) {
        return null;
      }
      return `[${episode.kind}] ${episode.summary}`;
    });
    const filteredLines = lines.filter((line): line is string => Boolean(line));
    const assembled = this.promptAssemblerService.assemblePromptContext({
      memoryLines: filteredLines,
      maxChars: MEMORY_PROMPT_CHAR_BUDGET,
    });

    if (!assembled) {
      return null;
    }

    const touchedByScope = new Map<MemoryScope, Set<string>>();
    for (const candidate of ranked) {
      const episode = episodes.find((item) => item.id === candidate.episodeId);
      if (!episode) {
        continue;
      }
      const scopeSet = touchedByScope.get(episode.scope) ?? new Set();
      scopeSet.add(episode.id);
      touchedByScope.set(episode.scope, scopeSet);
    }

    for (const [scope, ids] of touchedByScope.entries()) {
      const scopeEpisodes = this.longTermMemoryService.getEpisodes(scope);
      const now = Date.now();
      const updated = scopeEpisodes.map((episode) => {
        if (!ids.has(episode.id)) {
          return episode;
        }
        return {
          ...episode,
          accessCount: episode.accessCount + 1,
          lastAccessedAt: now,
        };
      });
      await this.longTermMemoryService.updateEpisodes(scope, updated);
    }

    return assembled;
  }

  private collectScopedEpisodes(scopes: MemoryScope[]): MemoryEpisodeRecord[] {
    const deduped = new Map<string, MemoryEpisodeRecord>();
    for (const scope of scopes) {
      for (const episode of this.longTermMemoryService.getEpisodes(scope)) {
        if (!deduped.has(episode.id)) {
          deduped.set(episode.id, episode);
        }
      }
    }
    return [...deduped.values()];
  }

  private async applyCompactionAndForgetting(
    scope: MemoryScope,
  ): Promise<void> {
    const episodes = this.longTermMemoryService.getEpisodes(scope);
    this.consolidatorService.compact(episodes, {
      maxEpisodes: MEMORY_MAX_EPISODES,
      batchSize: MEMORY_COMPACTION_BATCH_SIZE,
      keepRecentRaw: MEMORY_RECENT_EPISODES_TO_KEEP_RAW,
    });

    let nextEpisodes = episodes;
    const forgetting = this.forgettingPolicyService.applyPolicy({
      scope,
      episodes: nextEpisodes,
    });
    nextEpisodes = forgetting.retainedEpisodes;

    await this.longTermMemoryService.updateEpisodes(scope, nextEpisodes);
  }

  private buildTurnSummary(userText: string, modelText: string): string {
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
    const truncate = (value: string, max: number) =>
      value.length <= max
        ? value
        : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;

    const userSnippet = truncate(normalize(userText), 360);
    const modelSnippet = truncate(normalize(modelText), 520);
    return truncate(`User: ${userSnippet}\nAssistant: ${modelSnippet}`, 900);
  }

  private extractKeywords(text: string, maxKeywords: number): string[] {
    const stopwords = new Set([
      'about',
      'after',
      'again',
      'against',
      'all',
      'also',
      'and',
      'any',
      'are',
      'around',
      'because',
      'been',
      'before',
      'being',
      'between',
      'both',
      'but',
      'can',
      'could',
      'does',
      'done',
      'each',
      'else',
      'every',
      'from',
      'have',
      'into',
      'just',
      'many',
      'more',
      'most',
      'need',
      'only',
      'other',
      'over',
      'same',
      'should',
      'some',
      'such',
      'than',
      'that',
      'the',
      'their',
      'them',
      'then',
      'there',
      'these',
      'they',
      'this',
      'those',
      'through',
      'under',
      'using',
      'very',
      'when',
      'where',
      'which',
      'while',
      'with',
      'would',
      'your',
      'user',
      'assistant',
      'question',
      'answer',
    ]);

    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !stopwords.has(token));

    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }

    return [...frequencies.entries()]
      .sort((a, b) => {
        if (b[1] !== a[1]) {
          return b[1] - a[1];
        }
        return a[0].localeCompare(b[0]);
      })
      .slice(0, maxKeywords)
      .map(([keyword]) => keyword);
  }
}
