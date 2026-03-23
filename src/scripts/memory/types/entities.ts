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

import { MemoryEpisodeKind } from '../../types';
import { AgentId, TeamId, MemoryScope, AccessTier } from './domain';

export interface MemoryAccessPolicyRecord {
  tier: AccessTier;
  readers: string[];
  writers: string[];
}

export interface MemoryProvenanceRecord {
  sourceAgentId: AgentId;
  sourceTeamId: TeamId;
  createdAt: number;
  revision: number;
}

export interface MemoryEpisodeRecord {
  id: string;
  kind: MemoryEpisodeKind;
  scope: MemoryScope;
  ownerAgentId: AgentId;
  ownerTeamId: TeamId;
  summary: string;
  keywords: string[];
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
  accessPolicy: MemoryAccessPolicyRecord;
  provenance: MemoryProvenanceRecord;
}

export interface TeamMemoryEnvelope {
  scope: MemoryScope;
  episodes: MemoryEpisodeRecord[];
}

export interface TeamMemoryState {
  byScope: Record<MemoryScope, TeamMemoryEnvelope>;
  schemaVersion: number;
  updatedAt: number;
}

export interface RetrievalQueryRecord {
  agentId: AgentId;
  teamId: TeamId;
  queryText: string;
  recentUserTurns: string[];
  maxResults: number;
}

export interface RankedCandidateRecord {
  episode: MemoryEpisodeRecord;
  score: number;
  matchedKeywords: string[];
}

export interface PromptSegment {
  title: string;
  body: string;
  priority: number;
}
