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
import { ConsolidatorService } from '../../../src/scripts/memory/domains/consolidator/ConsolidatorService';
import { MemoryEpisodeRecord } from '../../../src/scripts/memory/types/entities';

function episode(id: string, kind: 'turn' | 'summary'): MemoryEpisodeRecord {
  return {
    id,
    kind,
    scope: 'agent',
    ownerAgentId: 'a1',
    ownerTeamId: 't1',
    summary: `${id} summary`,
    keywords: ['topic'],
    createdAt: Date.now(),
    accessCount: 0,
    lastAccessedAt: Date.now(),
    accessPolicy: { tier: 'private', readers: ['a1'], writers: ['a1'] },
    provenance: {
      sourceAgentId: 'a1',
      sourceTeamId: 't1',
      createdAt: Date.now(),
      revision: 1,
    },
  };
}

describe('ConsolidatorService', () => {
  it('compacts older turn episodes when limits exceeded', () => {
    const service = new ConsolidatorService();
    const episodes = [
      episode('t1', 'turn'),
      episode('t2', 'turn'),
      episode('t3', 'turn'),
      episode('t4', 'turn'),
    ];

    const result = service.compact(episodes, {
      maxEpisodes: 3,
      batchSize: 2,
      keepRecentRaw: 1,
    });

    expect(result.compacted).toBe(true);
    expect(result.removedEpisodeIds.length).toBe(2);
    expect(episodes.some((ep) => ep.kind === 'summary')).toBe(true);
  });

  it('returns no-op when no compaction needed', () => {
    const service = new ConsolidatorService();
    const episodes = [episode('t1', 'turn')];

    const result = service.compact(episodes, {
      maxEpisodes: 10,
      batchSize: 3,
      keepRecentRaw: 1,
    });

    expect(result.compacted).toBe(false);
    expect(result.removedEpisodeIds).toEqual([]);
  });
});
