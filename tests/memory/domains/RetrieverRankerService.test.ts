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
});
