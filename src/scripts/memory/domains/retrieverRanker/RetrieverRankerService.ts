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
import {
  IRetrieverRankerService,
  RetrievalResult,
} from '../../contracts/IRetrieverRankerService';
import {
  MemoryRetrievalQuery,
  RankedMemoryCandidate,
  RetrieverConfig,
  RetrievalDiagnostics,
} from '../../types/domain';
import { MemoryEpisodeRecord } from '../../types/entities';

type InternalRanked = RankedMemoryCandidate & {
  episode: MemoryEpisodeRecord;
  matchedKeywordSet: Set<string>;
};

const DEFAULT_DIVERSITY_THRESHOLD = 0.9;
const PARTIAL_MATCH_WEIGHT = 0.5;

export class RetrieverRankerService implements IRetrieverRankerService {
  retrieveAndRank(
    query: MemoryRetrievalQuery,
    episodes: MemoryEpisodeRecord[],
    config?: Partial<RetrieverConfig>,
  ): RankedMemoryCandidate[] {
    return this.retrieveAndRankWithDiagnostics(query, episodes, config)
      .candidates;
  }

  retrieveAndRankWithDiagnostics(
    query: MemoryRetrievalQuery,
    episodes: MemoryEpisodeRecord[],
    config?: Partial<RetrieverConfig>,
  ): RetrievalResult {
    const threshold = config?.minScoreThreshold ?? MEMORY_MIN_SCORE_THRESHOLD;
    const topK = config?.topK ?? MEMORY_RETRIEVAL_TOP_K;
    const diversityThreshold =
      config?.diversitySimilarityThreshold ?? DEFAULT_DIVERSITY_THRESHOLD;

    if (episodes.length === 0) {
      return {
        candidates: [],
        diagnostics: {
          queryKeywords: [],
          candidateCount: 0,
          aboveThresholdCount: 0,
          scores: [],
          avgKeywordOverlap: 0,
        },
      };
    }

    const keywords = this.extractQueryKeywords(query);
    const now = Date.now();
    const idfMap = this.computeIdf(keywords, episodes);

    const allScored: (InternalRanked | null)[] = episodes.map((episode) => {
      const { exactSet, partialSet } = this.getOverlapSets(
        episode.keywords,
        keywords,
      );
      if (keywords.length > 0 && exactSet.size === 0 && partialSet.size === 0) {
        return null;
      }

      const relevanceScore = this.computeRelevanceScore(
        keywords,
        exactSet,
        partialSet,
        idfMap,
      );

      const ageHours = Math.max(
        1,
        (now - episode.createdAt) / (1000 * 60 * 60),
      );
      const recencyScore = 1 / (1 + Math.log10(ageHours + 1));
      const utilityScore = Math.min(episode.accessCount, 20) / 25;
      const summaryBoost = episode.kind === 'summary' ? 0.2 : 0;
      const score = relevanceScore + recencyScore + utilityScore + summaryBoost;

      const allMatched = new Set([...exactSet, ...partialSet]);

      return {
        episode,
        episodeId: episode.id,
        score,
        matchedKeywords: [...allMatched],
        matchedKeywordSet: allMatched,
      };
    });

    const aboveThreshold = allScored
      .filter((c): c is InternalRanked => c !== null && c.score >= threshold)
      .sort((a, b) => b.score - a.score);

    const selected = this.selectDiverseCandidates(
      aboveThreshold,
      Math.min(topK, query.maxResults || topK),
      diversityThreshold,
    );

    const overlapValues = aboveThreshold.map((c) =>
      keywords.length > 0 ? c.matchedKeywords.length / keywords.length : 0,
    );
    const avgKeywordOverlap =
      overlapValues.length > 0
        ? overlapValues.reduce((a, b) => a + b, 0) / overlapValues.length
        : 0;

    const diagnostics: RetrievalDiagnostics = {
      queryKeywords: keywords,
      candidateCount: episodes.length,
      aboveThresholdCount: aboveThreshold.length,
      scores: aboveThreshold.map((c) => c.score),
      avgKeywordOverlap,
    };

    const candidates = selected.map(
      ({ episodeId, score, matchedKeywords }) => ({
        episodeId,
        score,
        matchedKeywords,
      }),
    );

    return { candidates, diagnostics };
  }

  private computeIdf(
    queryKeywords: string[],
    episodes: MemoryEpisodeRecord[],
  ): Map<string, number> {
    const idfMap = new Map<string, number>();
    const totalDocs = episodes.length;
    for (const keyword of queryKeywords) {
      let docCount = 0;
      for (const episode of episodes) {
        if (episode.keywords.includes(keyword)) {
          docCount += 1;
        }
      }
      const idf = Math.log((totalDocs + 1) / (docCount + 1)) + 1;
      idfMap.set(keyword, idf);
    }
    return idfMap;
  }

  private computeRelevanceScore(
    queryKeywords: string[],
    exactSet: Set<string>,
    partialSet: Set<string>,
    idfMap: Map<string, number>,
  ): number {
    if (queryKeywords.length === 0) {
      return 0;
    }

    let matchedWeight = 0;
    let totalWeight = 0;
    for (const keyword of queryKeywords) {
      const idf = idfMap.get(keyword) ?? 1;
      totalWeight += idf;
      if (exactSet.has(keyword)) {
        matchedWeight += idf;
      } else if (partialSet.has(keyword)) {
        matchedWeight += idf * PARTIAL_MATCH_WEIGHT;
      }
    }

    return totalWeight > 0 ? (matchedWeight / totalWeight) * 2 : 0;
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

  private getOverlapSets(
    episodeKeywords: string[],
    queryKeywords: string[],
  ): { exactSet: Set<string>; partialSet: Set<string> } {
    const querySet = new Set(queryKeywords);
    const exactSet = new Set<string>();
    const partialSet = new Set<string>();

    for (const keyword of episodeKeywords) {
      if (querySet.has(keyword)) {
        exactSet.add(keyword);
      }
    }

    for (const qk of queryKeywords) {
      if (exactSet.has(qk)) {
        continue;
      }
      for (const ek of episodeKeywords) {
        if (
          ek.includes(qk) ||
          qk.includes(ek) ||
          this.sharesStemPrefix(qk, ek)
        ) {
          partialSet.add(qk);
          break;
        }
      }
    }

    return { exactSet, partialSet };
  }

  private sharesStemPrefix(a: string, b: string): boolean {
    const minLen = Math.min(a.length, b.length);
    const prefixLen = Math.max(4, Math.floor(minLen * 0.75));
    if (minLen < 4) {
      return false;
    }
    return a.slice(0, prefixLen) === b.slice(0, prefixLen);
  }

  private selectDiverseCandidates(
    ranked: InternalRanked[],
    limit: number,
    similarityThreshold: number,
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
          ) >= similarityThreshold,
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
