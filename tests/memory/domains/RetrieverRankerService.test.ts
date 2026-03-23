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

import { describe, it, expect } from 'vitest';
import { RetrieverRankerService } from '../../../src/scripts/memory/domains/retrieverRanker/RetrieverRankerService';
import { MemoryEpisodeRecord } from '../../../src/scripts/memory/types/entities';
import { MemoryRetrievalQuery } from '../../../src/scripts/memory/types/domain';

function makeEpisode(
  id: string,
  summary: string,
  keywords: string[],
  createdAt: number,
  overrides?: Partial<MemoryEpisodeRecord>,
): MemoryEpisodeRecord {
  return {
    id,
    kind: 'turn',
    scope: 'agent',
    ownerAgentId: 'a1',
    ownerTeamId: 't1',
    summary,
    keywords,
    createdAt,
    accessCount: 0,
    lastAccessedAt: createdAt,
    accessPolicy: {
      tier: 'private',
      readers: ['a1'],
      writers: ['a1'],
    },
    provenance: {
      sourceAgentId: 'a1',
      sourceTeamId: 't1',
      createdAt,
      revision: 1,
    },
    ...overrides,
  };
}

describe('RetrieverRankerService', () => {
  const service = new RetrieverRankerService();

  it('should rank relevant episodes ahead of irrelevant ones', () => {
    const now = Date.now();
    const episodes: MemoryEpisodeRecord[] = [
      makeEpisode(
        'e1',
        'Redis cache stampede mitigation strategy',
        ['redis', 'cache', 'stampede', 'mitigation'],
        now - 1000,
      ),
      makeEpisode(
        'e2',
        'UI palette discussion',
        ['ui', 'palette', 'colors'],
        now - 1000,
      ),
    ];

    const query: MemoryRetrievalQuery = {
      requester: { agentId: 'a1', teamId: 't1' },
      queryText: 'cache stampede mitigation',
      recentUserTurns: [],
      maxResults: 6,
    };

    const ranked = service.retrieveAndRank(query, episodes);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].episodeId).toBe('e1');
    expect(ranked.some((entry) => entry.episodeId === 'e2')).toBe(false);
  });

  it('should limit ranking results to maxResults', () => {
    const now = Date.now();
    const episodes: MemoryEpisodeRecord[] = [
      makeEpisode('e1', 'A', ['redis', 'cache'], now - 1_000),
      makeEpisode('e2', 'B', ['redis', 'cache'], now - 2_000),
      makeEpisode('e3', 'C', ['redis', 'cache'], now - 3_000),
    ];

    const query: MemoryRetrievalQuery = {
      requester: { agentId: 'a1', teamId: 't1' },
      queryText: 'redis cache',
      recentUserTurns: [],
      maxResults: 2,
    };

    const ranked = service.retrieveAndRank(query, episodes);
    expect(ranked).toHaveLength(2);
  });

  it('should return diagnostics with retrieveAndRankWithDiagnostics', () => {
    const now = Date.now();
    const episodes = [
      makeEpisode('e1', 'Redis caching', ['redis', 'cache'], now - 1000),
    ];

    const query: MemoryRetrievalQuery = {
      requester: { agentId: 'a1', teamId: 't1' },
      queryText: 'redis cache',
      recentUserTurns: [],
      maxResults: 6,
    };

    const { candidates, diagnostics } = service.retrieveAndRankWithDiagnostics(
      query,
      episodes,
    );

    expect(candidates.length).toBeGreaterThan(0);
    expect(diagnostics.queryKeywords).toContain('redis');
    expect(diagnostics.queryKeywords).toContain('cache');
    expect(diagnostics.candidateCount).toBe(1);
    expect(diagnostics.aboveThresholdCount).toBeGreaterThan(0);
    expect(diagnostics.scores.length).toBeGreaterThan(0);
  });

  it('should match substring keywords with partial weight', () => {
    const now = Date.now();
    const episodes = [
      makeEpisode(
        'e1',
        'Discussed caching strategies',
        ['caching', 'strategies'],
        now - 1000,
      ),
    ];

    const query: MemoryRetrievalQuery = {
      requester: { agentId: 'a1', teamId: 't1' },
      queryText: 'cache strategy',
      recentUserTurns: [],
      maxResults: 6,
    };

    const ranked = service.retrieveAndRank(query, episodes);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].episodeId).toBe('e1');
  });

  it('should use IDF weighting to prioritize rare keywords', () => {
    const now = Date.now();
    const episodes = [
      makeEpisode(
        'e1',
        'Common topic A',
        ['common', 'rare_specific'],
        now - 1000,
      ),
      makeEpisode('e2', 'Common topic B', ['common', 'other'], now - 1000),
      makeEpisode('e3', 'Common topic C', ['common', 'another'], now - 1000),
    ];

    const query: MemoryRetrievalQuery = {
      requester: { agentId: 'a1', teamId: 't1' },
      queryText: 'common rare_specific',
      recentUserTurns: [],
      maxResults: 6,
    };

    const ranked = service.retrieveAndRank(query, episodes);
    expect(ranked[0].episodeId).toBe('e1');
  });

  it('should respect custom config thresholds', () => {
    const now = Date.now();
    const episodes = [makeEpisode('e1', 'A', ['redis', 'cache'], now - 1000)];

    const query: MemoryRetrievalQuery = {
      requester: { agentId: 'a1', teamId: 't1' },
      queryText: 'redis cache',
      recentUserTurns: [],
      maxResults: 6,
    };

    const highThreshold = service.retrieveAndRank(query, episodes, {
      minScoreThreshold: 10,
    });
    expect(highThreshold).toHaveLength(0);

    const lowThreshold = service.retrieveAndRank(query, episodes, {
      minScoreThreshold: 0.1,
    });
    expect(lowThreshold.length).toBeGreaterThan(0);
  });

  it('should return empty results for empty episodes', () => {
    const query: MemoryRetrievalQuery = {
      requester: { agentId: 'a1', teamId: 't1' },
      queryText: 'anything',
      recentUserTurns: [],
      maxResults: 6,
    };

    const { candidates, diagnostics } = service.retrieveAndRankWithDiagnostics(
      query,
      [],
    );
    expect(candidates).toHaveLength(0);
    expect(diagnostics.candidateCount).toBe(0);
  });
});
