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

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryTelemetryService } from '../../../src/scripts/memory/domains/telemetry/MemoryTelemetryService';
import {
  RetrievalTelemetry,
  CompactionTelemetry,
  ForgettingTelemetry,
  AssemblyTelemetry,
} from '../../../src/scripts/memory/types/telemetry';

function makeRetrieval(
  overrides?: Partial<RetrievalTelemetry>,
): RetrievalTelemetry {
  return {
    kind: 'retrieval',
    timestamp: Date.now(),
    queryKeywordCount: 4,
    candidateCount: 20,
    aboveThresholdCount: 5,
    selectedCount: 3,
    scores: [1.8, 1.5, 1.2],
    avgScore: 1.5,
    maxScore: 1.8,
    avgKeywordOverlap: 0.6,
    ...overrides,
  };
}

function makeCompaction(
  overrides?: Partial<CompactionTelemetry>,
): CompactionTelemetry {
  return {
    kind: 'compaction',
    timestamp: Date.now(),
    triggered: true,
    episodesCompacted: 24,
    episodesBefore: 165,
    episodesAfter: 142,
    ...overrides,
  };
}

function makeForgetting(
  overrides?: Partial<ForgettingTelemetry>,
): ForgettingTelemetry {
  return {
    kind: 'forgetting',
    timestamp: Date.now(),
    episodesDropped: 5,
    episodesRetained: 160,
    lowestRetainedScore: 0.3,
    ...overrides,
  };
}

function makeAssembly(
  overrides?: Partial<AssemblyTelemetry>,
): AssemblyTelemetry {
  return {
    kind: 'assembly',
    timestamp: Date.now(),
    entriesIncluded: 4,
    totalChars: 8000,
    budgetUsedRatio: 0.67,
    ...overrides,
  };
}

describe('MemoryTelemetryService', () => {
  let service: MemoryTelemetryService;

  beforeEach(() => {
    service = new MemoryTelemetryService();
  });

  it('should record and retrieve events', () => {
    service.record(makeRetrieval());
    service.record(makeCompaction());

    expect(service.getEvents()).toHaveLength(2);
  });

  it('should filter events by kind', () => {
    service.record(makeRetrieval());
    service.record(makeCompaction());
    service.record(makeRetrieval());

    expect(service.getEvents('retrieval')).toHaveLength(2);
    expect(service.getEvents('compaction')).toHaveLength(1);
    expect(service.getEvents('forgetting')).toHaveLength(0);
  });

  it('should return last event of a given kind', () => {
    service.record(makeRetrieval({ avgScore: 1.0 }));
    service.record(makeRetrieval({ avgScore: 2.0 }));

    const last = service.getLastEvent('retrieval') as RetrievalTelemetry;
    expect(last.avgScore).toBe(2.0);
  });

  it('should return undefined for missing event kind', () => {
    expect(service.getLastEvent('forgetting')).toBeUndefined();
  });

  it('should evict oldest events when capacity exceeded', () => {
    const small = new MemoryTelemetryService(3);
    small.record(makeRetrieval({ avgScore: 1.0 }));
    small.record(makeRetrieval({ avgScore: 2.0 }));
    small.record(makeRetrieval({ avgScore: 3.0 }));
    small.record(makeRetrieval({ avgScore: 4.0 }));

    const events = small.getEvents();
    expect(events).toHaveLength(3);
    expect((events[0] as RetrievalTelemetry).avgScore).toBe(2.0);
  });

  it('should clear all events', () => {
    service.record(makeRetrieval());
    service.record(makeCompaction());
    service.clear();

    expect(service.getEvents()).toHaveLength(0);
  });

  it('should compute correct snapshot', () => {
    service.record(makeRetrieval({ avgScore: 1.0 }));
    service.record(makeRetrieval({ avgScore: 2.0 }));
    service.record(makeCompaction({ triggered: true, episodesCompacted: 10 }));
    service.record(makeCompaction({ triggered: false, episodesCompacted: 0 }));
    service.record(makeForgetting({ episodesDropped: 3 }));
    service.record(makeForgetting({ episodesDropped: 7 }));
    service.record(makeAssembly({ budgetUsedRatio: 0.5 }));
    service.record(makeAssembly({ budgetUsedRatio: 0.8 }));

    const snap = service.snapshot();
    expect(snap.retrievalCount).toBe(2);
    expect(snap.avgRetrievalScore).toBe(1.5);
    expect(snap.totalCompactions).toBe(1);
    expect(snap.totalEpisodesCompacted).toBe(10);
    expect(snap.totalDropped).toBe(10);
    expect(snap.avgAssemblyBudgetUsed).toBeCloseTo(0.65);
  });

  it('should return zero snapshot when empty', () => {
    const snap = service.snapshot();
    expect(snap.retrievalCount).toBe(0);
    expect(snap.avgRetrievalScore).toBe(0);
    expect(snap.totalCompactions).toBe(0);
    expect(snap.totalDropped).toBe(0);
    expect(snap.avgAssemblyBudgetUsed).toBe(0);
  });
});
