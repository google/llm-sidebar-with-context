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

export type AgentId = string;
export type TeamId = string;
export type ScopeId = string;

export type MemoryScope = 'agent' | 'team' | 'global';
export type AccessTier = 'private' | 'team' | 'shared';

export interface MemoryActorScope {
  agentId: AgentId;
  teamId: TeamId;
  scope: MemoryScope;
}

export interface MemoryRequester {
  agentId: AgentId;
  teamId: TeamId;
}

export interface MemoryAccessPolicy {
  allowReadScopes: MemoryScope[];
  allowWriteScopes: MemoryScope[];
}

export interface MemoryProvenance {
  agentId: AgentId;
  teamId: TeamId;
  scope: MemoryScope;
  scopeId: ScopeId;
  source: 'chat' | 'summary' | 'imported';
}

export interface MemoryVersion {
  revision: number;
  updatedAt: number;
}

export interface MemoryIdentity {
  memoryId: string;
  kind: 'turn' | 'summary';
}

export interface WorkingContextSnapshot {
  actor: MemoryActorScope;
  turns: string[];
  limit: number;
}

export interface MemoryRetrievalQuery {
  requester: MemoryRequester;
  queryText: string;
  recentUserTurns: string[];
  maxResults: number;
}

export interface RankedMemoryCandidate {
  episodeId: string;
  score: number;
  matchedKeywords: string[];
}

export interface ConsolidatorInput {
  maxEpisodes: number;
  batchSize: number;
  keepRecentRaw: number;
}

export interface ConsolidatorResult {
  compacted: boolean;
  removedEpisodeIds: string[];
}

export interface PromptAssemblyInput {
  memoryLines: string[];
  maxChars: number;
}

export interface RetrieverConfig {
  minScoreThreshold: number;
  topK: number;
  diversitySimilarityThreshold: number;
}

export interface RetrievalDiagnostics {
  queryKeywords: string[];
  candidateCount: number;
  aboveThresholdCount: number;
  scores: number[];
  avgKeywordOverlap: number;
}
