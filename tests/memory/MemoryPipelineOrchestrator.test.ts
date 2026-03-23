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
import { MemoryPipelineOrchestrator } from '../../src/scripts/memory/MemoryPipelineOrchestrator';
import { ILocalStorageService } from '../../src/scripts/services/storageService';
import { StorageKeys } from '../../src/scripts/constants';
import { TeamMemoryState } from '../../src/scripts/memory/types/entities';

describe('MemoryPipelineOrchestrator', () => {
  let orchestrator: MemoryPipelineOrchestrator;
  let mockLocalStorageService: ILocalStorageService;

  beforeEach(() => {
    mockLocalStorageService = {
      get: vi.fn(),
      set: vi.fn(),
    };
    orchestrator = new MemoryPipelineOrchestrator(mockLocalStorageService);
  });

  it('should record turn and persist memory state', async () => {
    await orchestrator.load();
    await orchestrator.recordTurn(
      'How should teams share memory?',
      'By typed scopes and policies.',
    );

    const latestCall = vi.mocked(mockLocalStorageService.set).mock.calls.at(-1);
    expect(latestCall?.[0]).toBe(StorageKeys.AGENT_MEMORY);

    const state = latestCall?.[1] as TeamMemoryState;
    expect(state.byScope.agent.episodes.length).toBeGreaterThan(0);
    expect(state.byScope.agent.episodes[0].ownerTeamId).toBe('default-team');
  });

  it('should build prompt context after memory exists', async () => {
    await orchestrator.load();
    await orchestrator.recordTurn(
      'Need consistency protocol for multi-agent memory',
      'Use monotonic reads and provenance metadata.',
    );

    const part = await orchestrator.buildContextPart('consistency protocol', [
      { role: 'user', text: 'what consistency should we use?' },
    ]);

    expect(part?.type).toBe('text');
    if (part?.type === 'text') {
      expect(part.text).toContain('Retrieved Long-Term Memory');
      expect(part.text.toLowerCase()).toContain('consistency');
    }
  });

  it('should clear scoped memory', async () => {
    await orchestrator.load();
    await orchestrator.recordTurn('Question one', 'Answer one');
    await orchestrator.clear('agent');

    const latestCall = vi.mocked(mockLocalStorageService.set).mock.calls.at(-1);
    const state = latestCall?.[1] as TeamMemoryState;
    expect(state.byScope.agent.episodes).toEqual([]);
  });
});
