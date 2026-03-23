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
import { AgentMemory } from '../../src/scripts/models/AgentMemory';
import { ILocalStorageService } from '../../src/scripts/services/storageService';
import {
  MEMORY_MAX_EPISODES,
  MEMORY_PROMPT_CHAR_BUDGET,
  StorageKeys,
} from '../../src/scripts/constants';
import { MemoryState } from '../../src/scripts/types';

describe('AgentMemory', () => {
  let agentMemory: AgentMemory;
  let mockLocalStorageService: ILocalStorageService;

  beforeEach(() => {
    mockLocalStorageService = {
      get: vi.fn(),
      set: vi.fn(),
    };
    agentMemory = new AgentMemory(mockLocalStorageService);
  });

  it('should load valid persisted memory state', async () => {
    const state: MemoryState = {
      episodes: [
        {
          id: 'mem_a',
          kind: 'turn',
          summary: 'User asked about architecture.',
          keywords: ['architecture'],
          createdAt: 1000,
          accessCount: 0,
          lastAccessedAt: 1000,
        },
      ],
      updatedAt: 1000,
    };
    vi.mocked(mockLocalStorageService.get).mockResolvedValue(state);

    await agentMemory.load();
    const part = await agentMemory.buildContextPart('architecture', []);

    expect(mockLocalStorageService.get).toHaveBeenCalledWith(
      StorageKeys.AGENT_MEMORY,
    );
    expect(part?.type).toBe('text');
    if (part?.type === 'text') {
      expect(part.text).toContain('architecture');
    }
  });

  it('should ignore invalid persisted memory records', async () => {
    vi.mocked(mockLocalStorageService.get).mockResolvedValue({
      episodes: [
        {
          id: 'invalid',
          kind: 'turn',
          summary: '', // invalid empty summary
          keywords: ['foo'],
          createdAt: 1,
          accessCount: 0,
          lastAccessedAt: 1,
        },
      ],
      updatedAt: 1,
    } as unknown as MemoryState);

    await agentMemory.load();
    const part = await agentMemory.buildContextPart('foo', []);

    expect(part).toBeNull();
  });

  it('should record a turn and persist state', async () => {
    await agentMemory.recordTurn(
      'How do we design memory retrieval?',
      'Use bounded context and retrieval.',
    );

    expect(mockLocalStorageService.set).toHaveBeenCalled();
    const latestCall = vi.mocked(mockLocalStorageService.set).mock.calls.at(-1);
    expect(latestCall?.[0]).toBe(StorageKeys.AGENT_MEMORY);

    const savedState = latestCall?.[1] as MemoryState;
    expect(savedState.episodes).toHaveLength(1);
    expect(savedState.episodes[0].kind).toBe('turn');
    expect(savedState.episodes[0].summary).toContain('User:');
    expect(savedState.episodes[0].summary).toContain('Assistant:');
  });

  it('should include relevant memory for matching query keywords', async () => {
    await agentMemory.recordTurn(
      'Need strategy for websocket reconnect jitter',
      'Implement exponential backoff and jitter.',
    );
    await agentMemory.recordTurn(
      'Discuss css spacing',
      'Use design tokens for spacing.',
    );

    const part = await agentMemory.buildContextPart('reconnect jitter', []);

    expect(part?.type).toBe('text');
    if (part?.type === 'text') {
      expect(part.text).toContain('reconnect');
      expect(part.text).not.toContain('design tokens for spacing');
    }
  });

  it('should apply prompt char budget while rendering memory context', async () => {
    for (let i = 0; i < 20; i++) {
      await agentMemory.recordTurn(
        `Question ${i} about distributed tracing and observability`,
        `Answer ${i} with detailed discussion on traces and metrics.`,
      );
    }

    const part = await agentMemory.buildContextPart(
      'distributed tracing observability',
      [],
    );

    expect(part?.type).toBe('text');
    if (part?.type === 'text') {
      expect(part.text.length).toBeLessThanOrEqual(MEMORY_PROMPT_CHAR_BUDGET);
    }
  });

  it('should compact older turn episodes into summary episodes', async () => {
    for (let i = 0; i < MEMORY_MAX_EPISODES + 10; i++) {
      await agentMemory.recordTurn(
        `Legacy turn ${i} about migration strategy`,
        `Migration response ${i} with rollout details`,
      );
    }

    const latestCall = vi.mocked(mockLocalStorageService.set).mock.calls.at(-1);
    const savedState = latestCall?.[1] as MemoryState;
    expect(savedState.episodes.length).toBeLessThanOrEqual(MEMORY_MAX_EPISODES);
    expect(
      savedState.episodes.some((episode) => episode.kind === 'summary'),
    ).toBe(true);
  });

  it('should clear all memory and persist empty state', async () => {
    await agentMemory.recordTurn('First turn', 'First response');
    await agentMemory.clear();

    const latestCall = vi.mocked(mockLocalStorageService.set).mock.calls.at(-1);
    const savedState = latestCall?.[1] as MemoryState;
    expect(savedState.episodes).toEqual([]);
  });

  it('should use neighboring episodes through keyword connectivity', async () => {
    await agentMemory.recordTurn(
      'Investigate redis cache stampede mitigation',
      'Add request coalescing and stale-while-revalidate.',
    );
    await agentMemory.recordTurn(
      'Cache invalidation patterns with redis pubsub',
      'Use key tagging and pubsub fanout.',
    );
    await agentMemory.recordTurn(
      'Unrelated ui color palette choice',
      'Use neutral palette.',
    );

    const part = await agentMemory.buildContextPart(
      'cache stampede mitigation',
      [],
    );

    expect(part?.type).toBe('text');
    if (part?.type === 'text') {
      expect(part.text).toContain('cache');
      expect(part.text).toContain('redis');
      expect(part.text).not.toContain('ui color palette');
    }
  });
});
