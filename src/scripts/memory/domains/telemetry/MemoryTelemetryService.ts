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

import { IMemoryTelemetryService } from '../../contracts/IMemoryTelemetryService';
import {
  MemoryTelemetryEvent,
  MemoryTelemetryEventKind,
  TelemetrySnapshot,
  RetrievalTelemetry,
  AssemblyTelemetry,
  CompactionTelemetry,
} from '../../types/telemetry';

const DEFAULT_CAPACITY = 200;

export class MemoryTelemetryService implements IMemoryTelemetryService {
  private buffer: MemoryTelemetryEvent[] = [];
  private readonly capacity: number;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    this.capacity = capacity;
  }

  record(event: MemoryTelemetryEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > this.capacity) {
      this.buffer.shift();
    }
  }

  getEvents(kind?: MemoryTelemetryEventKind): MemoryTelemetryEvent[] {
    if (!kind) {
      return [...this.buffer];
    }
    return this.buffer.filter((event) => event.kind === kind);
  }

  getLastEvent(
    kind: MemoryTelemetryEventKind,
  ): MemoryTelemetryEvent | undefined {
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i].kind === kind) {
        return this.buffer[i];
      }
    }
    return undefined;
  }

  clear(): void {
    this.buffer = [];
  }

  snapshot(): TelemetrySnapshot {
    const retrievals = this.buffer.filter(
      (e): e is RetrievalTelemetry => e.kind === 'retrieval',
    );
    const assemblies = this.buffer.filter(
      (e): e is AssemblyTelemetry => e.kind === 'assembly',
    );
    const compactions = this.buffer.filter(
      (e): e is CompactionTelemetry => e.kind === 'compaction',
    );

    const avgRetrievalScore =
      retrievals.length > 0
        ? retrievals.reduce((sum, r) => sum + r.avgScore, 0) / retrievals.length
        : 0;

    const totalEpisodesCompacted = compactions.reduce(
      (sum, c) => sum + c.episodesCompacted,
      0,
    );

    const totalDropped = this.buffer
      .filter((e) => e.kind === 'forgetting')
      .reduce(
        (sum, e) => sum + (e as { episodesDropped: number }).episodesDropped,
        0,
      );

    const avgAssemblyBudgetUsed =
      assemblies.length > 0
        ? assemblies.reduce((sum, a) => sum + a.budgetUsedRatio, 0) /
          assemblies.length
        : 0;

    return {
      retrievalCount: retrievals.length,
      avgRetrievalScore,
      totalCompactions: compactions.filter((c) => c.triggered).length,
      totalEpisodesCompacted,
      totalDropped,
      avgAssemblyBudgetUsed,
    };
  }
}
