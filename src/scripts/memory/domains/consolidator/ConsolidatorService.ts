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

import { IConsolidatorService } from '../../contracts/IConsolidatorService';
import { ConsolidatorInput, ConsolidatorResult } from '../../types/domain';
import { MemoryEpisodeRecord } from '../../types/entities';
import { MEMORY_EPISODE_SUMMARY_MAX_CHARS } from '../../config';

export class ConsolidatorService implements IConsolidatorService {
  compact(
    episodes: MemoryEpisodeRecord[],
    input: ConsolidatorInput,
  ): ConsolidatorResult {
    const turnEpisodes = episodes.filter((episode) => episode.kind === 'turn');
    const compactableCount = turnEpisodes.length - input.keepRecentRaw;
    if (compactableCount <= 0 || episodes.length <= input.maxEpisodes) {
      return { compacted: false, removedEpisodeIds: [] };
    }

    const batchCount = Math.min(input.batchSize, compactableCount);
    const batch = turnEpisodes.slice(0, batchCount);
    if (batch.length === 0) {
      return { compacted: false, removedEpisodeIds: [] };
    }

    const summaryText = this.truncate(
      [
        `Consolidated memory from ${batch.length} earlier interactions:`,
        ...batch.map((episode, index) => `${index + 1}. ${episode.summary}`),
      ].join('\n'),
      MEMORY_EPISODE_SUMMARY_MAX_CHARS,
    );

    const summary: MemoryEpisodeRecord = {
      ...batch[0],
      id: `sum_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'summary',
      summary: summaryText,
      keywords: this.mergeKeywords(batch),
      createdAt: Date.now(),
      accessCount: 0,
      lastAccessedAt: Date.now(),
    };

    const batchIds = new Set(batch.map((episode) => episode.id));
    const insertionIndex = episodes.findIndex((episode) =>
      batchIds.has(episode.id),
    );
    const nextEpisodes = episodes.filter(
      (episode) => !batchIds.has(episode.id),
    );
    const insertAt =
      insertionIndex >= 0 && insertionIndex <= nextEpisodes.length
        ? insertionIndex
        : nextEpisodes.length;
    nextEpisodes.splice(insertAt, 0, summary);

    episodes.length = 0;
    episodes.push(...nextEpisodes);

    return {
      compacted: true,
      removedEpisodeIds: [...batchIds],
    };
  }

  private mergeKeywords(episodes: MemoryEpisodeRecord[]): string[] {
    const merged = new Set<string>();
    for (const episode of episodes) {
      for (const keyword of episode.keywords) {
        merged.add(keyword);
      }
    }
    return [...merged].slice(0, 16);
  }

  private truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
      return text;
    }
    return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  }
}
