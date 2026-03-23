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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LongTermMemoryService } from '../../../src/scripts/memory/domains/longTermMemory/LongTermMemoryService';
import { ILocalStorageService } from '../../../src/scripts/services/storageService';
import { MemoryEpisodeRecord } from '../../../src/scripts/memory/types/entities';
import { StorageKeys } from '../../../src/scripts/constants';

describe('LongTermMemoryService', () => {
  let service: LongTermMemoryService;
  let storage: ILocalStorageService;

  const baseEpisode: MemoryEpisodeRecord = {
    id: 'ep-1',
    kind: 'turn',
    scope: 'agent',
    ownerAgentId: 'a1',
    ownerTeamId: 't1',
    summary: 'Summary',
    keywords: ['summary'],
    createdAt: 1,
    accessCount: 0,
    lastAccessedAt: 1,
    accessPolicy: { tier: 'private', readers: ['a1'], writers: ['a1'] },
    provenance: {
      sourceAgentId: 'a1',
      sourceTeamId: 't1',
      createdAt: 1,
      revision: 1,
    },
  };

  beforeEach(() => {
    storage = {
      get: vi.fn(),
      set: vi.fn(),
    };
    service = new LongTermMemoryService(storage);
  });

  it('loads empty state when storage missing', async () => {
    vi.mocked(storage.get).mockResolvedValue(undefined);
    await service.load();
    expect(service.getEpisodes('agent')).toEqual([]);
    expect(service.getEpisodes('team')).toEqual([]);
    expect(service.getEpisodes('global')).toEqual([]);
  });

  it('appends and persists episodes', async () => {
    await service.appendEpisode(baseEpisode);
    expect(service.getEpisodes('agent')).toHaveLength(1);
    expect(storage.set).toHaveBeenCalledWith(
      StorageKeys.AGENT_MEMORY,
      expect.any(Object),
    );
  });

  it('supports clearing a single scope', async () => {
    await service.appendEpisode(baseEpisode);
    await service.updateEpisodes('team', [
      { ...baseEpisode, id: 'ep-2', scope: 'team' },
    ]);
    await service.clear('agent');
    expect(service.getEpisodes('agent')).toEqual([]);
    expect(service.getEpisodes('team')).toHaveLength(1);
  });

  it('supports backward-compat v1 flat episodes schema', async () => {
    vi.mocked(storage.get).mockResolvedValue({
      episodes: [{ ...baseEpisode, scope: undefined }],
      updatedAt: 123,
    });

    await service.load();
    expect(service.getEpisodes('agent')).toHaveLength(1);
    expect(service.getEpisodes('agent')[0].scope).toBe('agent');
  });
});
