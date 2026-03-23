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

import {
  MEMORY_COMPACTION_BATCH_SIZE,
  MEMORY_EPISODE_SUMMARY_MAX_CHARS,
  MEMORY_MAX_EPISODES,
  MEMORY_MAX_KEYWORDS_PER_EPISODE,
  MEMORY_MAX_QUERY_KEYWORDS,
  MEMORY_MIN_KEYWORD_LENGTH,
  MEMORY_MIN_SCORE_THRESHOLD,
  MEMORY_NEIGHBOR_EXPANSION_LIMIT,
  MEMORY_PROMPT_CHAR_BUDGET,
  MEMORY_RECENT_EPISODES_TO_KEEP_RAW,
  MEMORY_RETRIEVAL_TOP_K,
  MEMORY_STOPWORDS,
  StorageKeys,
} from '../constants';
import { ILocalStorageService } from '../services/storageService';
import { ChatMessage, ContentPart, MemoryEpisode, MemoryState } from '../types';

type ScoredEpisode = {
  episode: MemoryEpisode;
  score: number;
};

export class AgentMemory {
  private episodes: MemoryEpisode[] = [];
  private keywordIndex: Map<string, Set<string>> = new Map();

  constructor(private localStorageService: ILocalStorageService) {}

  async load(): Promise<void> {
    const stored = await this.localStorageService.get<MemoryState>(
      StorageKeys.AGENT_MEMORY,
    );

    if (!stored || !Array.isArray(stored.episodes)) {
      this.episodes = [];
      this.rebuildKeywordIndex();
      return;
    }

    this.episodes = stored.episodes
      .filter((episode): episode is MemoryEpisode =>
        this.isValidEpisode(episode),
      )
      .sort((a, b) => a.createdAt - b.createdAt);

    this.rebuildKeywordIndex();
  }

  async clear(): Promise<void> {
    this.episodes = [];
    this.keywordIndex.clear();
    await this.save();
  }

  async recordTurn(userText: string, modelText: string): Promise<void> {
    const now = Date.now();
    const summary = this.buildTurnSummary(userText, modelText);
    const keywords = this.extractKeywords(
      `${userText}\n${modelText}`,
      MEMORY_MAX_KEYWORDS_PER_EPISODE,
    );

    const episode: MemoryEpisode = {
      id: this.buildEpisodeId(now),
      kind: 'turn',
      summary,
      keywords,
      createdAt: now,
      accessCount: 0,
      lastAccessedAt: now,
    };

    this.episodes.push(episode);
    this.indexEpisode(episode);
    this.compactIfNeeded();
    await this.save();
  }

  async buildContextPart(
    query: string,
    recentHistory: ChatMessage[],
  ): Promise<ContentPart | null> {
    if (this.episodes.length === 0) {
      return null;
    }

    const queryKeywords = this.extractQueryKeywords(query, recentHistory);
    const scoredCandidates = this.scoreCandidates(queryKeywords);
    if (scoredCandidates.length === 0) {
      return null;
    }

    const selected = this.selectDiverseEpisodes(
      scoredCandidates,
      MEMORY_RETRIEVAL_TOP_K,
    );
    this.expandWithNeighbors(selected, queryKeywords);

    const rendered = this.renderMemoryContext(selected);
    if (!rendered) {
      return null;
    }

    const now = Date.now();
    for (const { episode } of selected) {
      episode.accessCount += 1;
      episode.lastAccessedAt = now;
    }
    await this.save();

    return { type: 'text', text: rendered };
  }

  private isValidEpisode(value: unknown): value is MemoryEpisode {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as MemoryEpisode;
    const validKind = candidate.kind === 'turn' || candidate.kind === 'summary';
    const validSummary =
      typeof candidate.summary === 'string' && candidate.summary.length > 0;
    const validKeywords =
      Array.isArray(candidate.keywords) &&
      candidate.keywords.every((k) => typeof k === 'string');

    return (
      typeof candidate.id === 'string' &&
      validKind &&
      validSummary &&
      validKeywords &&
      typeof candidate.createdAt === 'number' &&
      typeof candidate.accessCount === 'number' &&
      typeof candidate.lastAccessedAt === 'number'
    );
  }

  private buildEpisodeId(now: number): string {
    const suffix = Math.random().toString(36).slice(2, 10);
    return `mem_${now}_${suffix}`;
  }

  private buildTurnSummary(userText: string, modelText: string): string {
    const normalizedUser = this.normalizeWhitespace(userText);
    const normalizedModel = this.normalizeWhitespace(modelText);

    const userSnippet = this.truncate(normalizedUser, 360);
    const modelSnippet = this.truncate(normalizedModel, 520);
    const summary = `User: ${userSnippet}\nAssistant: ${modelSnippet}`;
    return this.truncate(summary, MEMORY_EPISODE_SUMMARY_MAX_CHARS);
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
      return text;
    }
    return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  }

  private extractQueryKeywords(
    query: string,
    recentHistory: ChatMessage[],
  ): string[] {
    const recentUserText = recentHistory
      .filter((msg) => msg.role === 'user')
      .slice(-3)
      .map((msg) => msg.text)
      .join(' ');
    return this.extractKeywords(
      `${query}\n${recentUserText}`,
      MEMORY_MAX_QUERY_KEYWORDS,
    );
  }

  private extractKeywords(text: string, maxKeywords: number): string[] {
    const normalized = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(
        (token) =>
          token.length >= MEMORY_MIN_KEYWORD_LENGTH &&
          !MEMORY_STOPWORDS.includes(token),
      );

    const frequencies = new Map<string, number>();
    for (const token of normalized) {
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

  private scoreCandidates(queryKeywords: string[]): ScoredEpisode[] {
    const ids = new Set<string>();
    for (const keyword of queryKeywords) {
      const hits = this.keywordIndex.get(keyword);
      if (!hits) continue;
      for (const id of hits) {
        ids.add(id);
      }
    }

    const candidates =
      ids.size > 0
        ? this.episodes.filter((episode) => ids.has(episode.id))
        : this.episodes.slice(-MEMORY_RETRIEVAL_TOP_K * 2);

    const now = Date.now();
    return candidates
      .map((episode) => {
        const overlap = this.keywordOverlap(episode.keywords, queryKeywords);
        if (queryKeywords.length > 0 && overlap === 0) {
          return { episode, score: -1 };
        }
        const ageHours = Math.max(
          1,
          (now - episode.createdAt) / (1000 * 60 * 60),
        );
        const recencyScore = 1 / (1 + Math.log10(ageHours + 1));
        const utilityScore = Math.min(episode.accessCount, 20) / 25;
        const kindBoost = episode.kind === 'summary' ? 0.25 : 0;
        const overlapBoost = overlap > 0 ? overlap * 2 : 0.1;
        const score = overlapBoost + recencyScore + utilityScore + kindBoost;
        return { episode, score };
      })
      .filter(({ score }) => score >= MEMORY_MIN_SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score);
  }

  private keywordOverlap(
    episodeKeywords: string[],
    queryKeywords: string[],
  ): number {
    if (queryKeywords.length === 0 || episodeKeywords.length === 0) {
      return 0;
    }

    const querySet = new Set(queryKeywords);
    let matches = 0;
    for (const keyword of episodeKeywords) {
      if (querySet.has(keyword)) {
        matches += 1;
      }
    }
    return matches / querySet.size;
  }

  private selectDiverseEpisodes(
    ranked: ScoredEpisode[],
    targetCount: number,
  ): ScoredEpisode[] {
    const selected: ScoredEpisode[] = [];
    for (const candidate of ranked) {
      if (selected.length >= targetCount) {
        break;
      }
      const tooSimilar = selected.some(({ episode }) =>
        this.isTooSimilar(episode, candidate.episode),
      );
      if (!tooSimilar) {
        selected.push(candidate);
      }
    }

    if (selected.length < targetCount) {
      for (const candidate of ranked) {
        if (selected.length >= targetCount) {
          break;
        }
        if (
          selected.some(({ episode }) => episode.id === candidate.episode.id)
        ) {
          continue;
        }
        selected.push(candidate);
      }
    }

    return selected;
  }

  private isTooSimilar(a: MemoryEpisode, b: MemoryEpisode): boolean {
    const aKeywords = new Set(a.keywords);
    const bKeywords = new Set(b.keywords);
    if (aKeywords.size === 0 || bKeywords.size === 0) {
      return false;
    }

    let intersection = 0;
    for (const keyword of aKeywords) {
      if (bKeywords.has(keyword)) {
        intersection += 1;
      }
    }
    const union = aKeywords.size + bKeywords.size - intersection;
    const jaccard = union === 0 ? 0 : intersection / union;
    return jaccard >= 0.8;
  }

  private expandWithNeighbors(
    selected: ScoredEpisode[],
    queryKeywords: string[],
  ): void {
    if (selected.length === 0) {
      return;
    }

    const selectedIds = new Set(selected.map(({ episode }) => episode.id));
    const neighborScores = new Map<string, number>();

    for (const { episode } of selected) {
      for (const keyword of episode.keywords) {
        const neighbors = this.keywordIndex.get(keyword);
        if (!neighbors) continue;

        for (const neighborId of neighbors) {
          if (selectedIds.has(neighborId)) {
            continue;
          }
          const neighbor = this.episodes.find((e) => e.id === neighborId);
          if (!neighbor) {
            continue;
          }

          const overlap = this.keywordOverlap(neighbor.keywords, queryKeywords);
          const increment = 0.4 + overlap;
          neighborScores.set(
            neighborId,
            (neighborScores.get(neighborId) ?? 0) + increment,
          );
        }
      }
    }

    const rankedNeighbors = [...neighborScores.entries()]
      .map(([id, score]) => ({
        episode: this.episodes.find((episode) => episode.id === id),
        score,
      }))
      .filter((entry): entry is { episode: MemoryEpisode; score: number } =>
        Boolean(entry.episode),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, MEMORY_NEIGHBOR_EXPANSION_LIMIT);

    for (const candidate of rankedNeighbors) {
      if (
        selected.some(({ episode }) =>
          this.isTooSimilar(episode, candidate.episode),
        )
      ) {
        continue;
      }
      selected.push(candidate);
      selectedIds.add(candidate.episode.id);
    }
  }

  private renderMemoryContext(selected: ScoredEpisode[]): string | null {
    const ranked = [...selected].sort((a, b) => b.score - a.score);
    let text =
      '--- Retrieved Long-Term Memory ---\nUse these recalled notes as background context:\n';
    let added = 0;

    for (const { episode } of ranked) {
      const entry = `- [${episode.kind}] ${episode.summary}\n`;
      if (text.length + entry.length > MEMORY_PROMPT_CHAR_BUDGET) {
        break;
      }
      text += entry;
      added += 1;
    }

    if (added === 0) {
      return null;
    }

    return text.trimEnd();
  }

  private compactIfNeeded(): void {
    while (this.episodes.length > MEMORY_MAX_EPISODES) {
      const compacted = this.compactOldestTurns();
      if (!compacted) {
        this.dropOldestSummary();
      }
    }
  }

  private compactOldestTurns(): boolean {
    const turnEpisodes = this.episodes.filter(
      (episode) => episode.kind === 'turn',
    );
    const compactableCount =
      turnEpisodes.length - MEMORY_RECENT_EPISODES_TO_KEEP_RAW;

    if (compactableCount <= 0) {
      return false;
    }

    const batchCount = Math.min(MEMORY_COMPACTION_BATCH_SIZE, compactableCount);
    const batch = turnEpisodes.slice(0, batchCount);
    if (batch.length === 0) {
      return false;
    }

    const summaryText = this.buildCompactionSummary(batch);
    const keywords = this.extractKeywords(
      batch.map((episode) => episode.summary).join('\n'),
      MEMORY_MAX_KEYWORDS_PER_EPISODE,
    );
    const createdAt = Date.now();
    const summaryEpisode: MemoryEpisode = {
      id: this.buildEpisodeId(createdAt),
      kind: 'summary',
      summary: summaryText,
      keywords,
      createdAt,
      accessCount: 0,
      lastAccessedAt: createdAt,
    };

    const batchIds = new Set(batch.map((episode) => episode.id));
    const insertionIndex = this.episodes.findIndex((episode) =>
      batchIds.has(episode.id),
    );
    this.episodes = this.episodes.filter(
      (episode) => !batchIds.has(episode.id),
    );

    if (insertionIndex >= 0 && insertionIndex <= this.episodes.length) {
      this.episodes.splice(insertionIndex, 0, summaryEpisode);
    } else {
      this.episodes.push(summaryEpisode);
    }

    this.rebuildKeywordIndex();
    return true;
  }

  private buildCompactionSummary(batch: MemoryEpisode[]): string {
    const prelude = `Consolidated memory from ${batch.length} earlier interactions:\n`;
    const lines = batch
      .map((episode, index) => `${index + 1}. ${episode.summary}`)
      .join('\n');
    return this.truncate(
      `${prelude}${lines}`,
      MEMORY_EPISODE_SUMMARY_MAX_CHARS,
    );
  }

  private dropOldestSummary(): void {
    const summaryIndex = this.episodes.findIndex(
      (episode) => episode.kind === 'summary',
    );
    if (summaryIndex >= 0) {
      this.episodes.splice(summaryIndex, 1);
      this.rebuildKeywordIndex();
      return;
    }

    if (this.episodes.length > 0) {
      this.episodes.shift();
      this.rebuildKeywordIndex();
    }
  }

  private rebuildKeywordIndex(): void {
    this.keywordIndex.clear();
    for (const episode of this.episodes) {
      this.indexEpisode(episode);
    }
  }

  private indexEpisode(episode: MemoryEpisode): void {
    for (const keyword of episode.keywords) {
      const bucket = this.keywordIndex.get(keyword) ?? new Set<string>();
      bucket.add(episode.id);
      this.keywordIndex.set(keyword, bucket);
    }
  }

  private async save(): Promise<void> {
    const state: MemoryState = {
      episodes: this.episodes,
      updatedAt: Date.now(),
    };
    await this.localStorageService.set(StorageKeys.AGENT_MEMORY, state);
  }
}
