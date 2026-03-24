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

export type MemoryTelemetryEventKind =
  | 'retrieval'
  | 'compaction'
  | 'forgetting'
  | 'assembly';

export interface RetrievalTelemetry {
  kind: 'retrieval';
  timestamp: number;
  queryKeywordCount: number;
  candidateCount: number;
  aboveThresholdCount: number;
  selectedCount: number;
  scores: number[];
  avgScore: number;
  maxScore: number;
  avgKeywordOverlap: number;
}

export interface CompactionTelemetry {
  kind: 'compaction';
  timestamp: number;
  triggered: boolean;
  episodesCompacted: number;
  episodesBefore: number;
  episodesAfter: number;
}

export interface ForgettingTelemetry {
  kind: 'forgetting';
  timestamp: number;
  episodesDropped: number;
  episodesRetained: number;
  lowestRetainedScore: number;
}

export interface AssemblyTelemetry {
  kind: 'assembly';
  timestamp: number;
  entriesIncluded: number;
  totalChars: number;
  budgetUsedRatio: number;
}

export type MemoryTelemetryEvent =
  | RetrievalTelemetry
  | CompactionTelemetry
  | ForgettingTelemetry
  | AssemblyTelemetry;

export interface TelemetrySnapshot {
  retrievalCount: number;
  avgRetrievalScore: number;
  totalCompactions: number;
  totalEpisodesCompacted: number;
  totalDropped: number;
  avgAssemblyBudgetUsed: number;
}
