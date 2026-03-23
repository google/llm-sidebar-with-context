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
  MEMORY_MAX_QUERY_KEYWORDS,
  MEMORY_MIN_KEYWORD_LENGTH,
  MEMORY_MIN_SCORE_THRESHOLD,
  MEMORY_RETRIEVAL_TOP_K,
  MEMORY_STOPWORDS,
} from '../../config';
import { IRetrieverRankerService } from '../../contracts/IRetrieverRankerService';
import {
  MemoryRetrievalQuery,
  RankedMemoryCandidate,
} from '../../types/domain';
import { MemoryEpisodeRecord } from '../../types/entities';

type InternalRanked = RankedMemoryCandidate & {
  episode: MemoryEpisodeRecord;
  matchedKeywordSet: Set<string>;
};

export class RetrieverRankerService implements IRetrieverRankerService {
  retrieveAndRank(
    query: MemoryRetrievalQuery,
    episodes: MemoryEpisodeRecord[],
  ): RankedMemoryCandidate[] {
    if (episodes.length === 0) {
      return [];
    }

    const keywords = this.extractQueryKeywords(query);
    const now = Date.now();

    const ranked: InternalRanked[] = episodes
      .map((episode) => {
        const overlapSet = this.getOverlapSet(episode.keywords, keywords);
        if (keywords.length > 0 && overlapSet.size === 0) {
          return null;
        }

        const overlapRatio =
          keywords.length === 0 ? 0 : overlapSet.size / keywords.length;
        const ageHours = Math.max(
          1,
          (now - episode.createdAt) / (1000 * 60 * 60),
        );
        const recencyScore = 1 / (1 + Math.log10(ageHours + 1));
        const utilityScore = Math.min(episode.accessCount, 20) / 25;
        const summaryBoost = episode.kind === 'summary' ? 0.2 : 0;
        const relevanceScore = overlapRatio * 2;
        const score =
          relevanceScore + recencyScore + utilityScore + summaryBoost;

        if (score < MEMORY_MIN_SCORE_THRESHOLD) {
          return null;
        }

        return {
          episode,
          episodeId: episode.id,
          score,
          matchedKeywords: [...overlapSet],
          matchedKeywordSet: overlapSet,
        };
      })
      .filter((candidate): candidate is InternalRanked => Boolean(candidate))
      .sort((a, b) => b.score - a.score);

    const selected = this.selectDiverseCandidates(
      ranked,
      Math.min(
        MEMORY_RETRIEVAL_TOP_K,
        query.maxResults || MEMORY_RETRIEVAL_TOP_K,
      ),
    );

    return selected.map(({ episodeId, score, matchedKeywords }) => ({
      episodeId,
      score,
      matchedKeywords,
    }));
  }

  private extractQueryKeywords(query: MemoryRetrievalQuery): string[] {
    const haystack = [query.queryText, ...query.recentUserTurns].join(' ');
    const tokens = haystack
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(
        (token) =>
          token.length >= MEMORY_MIN_KEYWORD_LENGTH &&
          !MEMORY_STOPWORDS.includes(token),
      );

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
      .slice(0, MEMORY_MAX_QUERY_KEYWORDS)
      .map(([keyword]) => keyword);
  }

  private getOverlapSet(
    episodeKeywords: string[],
    queryKeywords: string[],
  ): Set<string> {
    const querySet = new Set(queryKeywords);
    const overlap = new Set<string>();
    for (const keyword of episodeKeywords) {
      if (querySet.has(keyword)) {
        overlap.add(keyword);
      }
    }
    return overlap;
  }

  private selectDiverseCandidates(
    ranked: InternalRanked[],
    limit: number,
  ): InternalRanked[] {
    const selected: InternalRanked[] = [];
    for (const candidate of ranked) {
      if (selected.length >= limit) {
        break;
      }

      const tooSimilar = selected.some(
        (existing) =>
          this.jaccard(
            existing.matchedKeywordSet,
            candidate.matchedKeywordSet,
          ) >= 0.9,
      );
      if (tooSimilar) {
        continue;
      }
      selected.push(candidate);
    }

    if (selected.length < limit) {
      for (const candidate of ranked) {
        if (selected.length >= limit) {
          break;
        }
        if (
          selected.some(
            (existing) => existing.episodeId === candidate.episodeId,
          )
        ) {
          continue;
        }
        selected.push(candidate);
      }
    }

    return selected;
  }

  private jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) {
      return 0;
    }
    let intersection = 0;
    for (const key of a) {
      if (b.has(key)) {
        intersection += 1;
      }
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
