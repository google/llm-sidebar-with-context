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

import { MemoryEpisodeRecord } from '../../../src/scripts/memory/types/entities';
import { MemoryRetrievalQuery } from '../../../src/scripts/memory/types/domain';
import { MemoryEpisodeKind } from '../../../src/scripts/types';

export function computeRecall(
  retrievedIds: string[],
  expectedIds: string[],
): number {
  if (expectedIds.length === 0) {
    return 1;
  }
  const retrievedSet = new Set(retrievedIds);
  const hits = expectedIds.filter((id) => retrievedSet.has(id)).length;
  return hits / expectedIds.length;
}

export function computePrecision(
  retrievedIds: string[],
  expectedIds: string[],
): number {
  if (retrievedIds.length === 0) {
    return expectedIds.length === 0 ? 1 : 0;
  }
  const expectedSet = new Set(expectedIds);
  const hits = retrievedIds.filter((id) => expectedSet.has(id)).length;
  return hits / retrievedIds.length;
}

export function computeF1(recall: number, precision: number): number {
  if (recall + precision === 0) {
    return 0;
  }
  return (2 * recall * precision) / (recall + precision);
}

export function makeEvalEpisode(opts: {
  id: string;
  summary: string;
  keywords: string[];
  createdAt?: number;
  kind?: MemoryEpisodeKind;
  accessCount?: number;
}): MemoryEpisodeRecord {
  const createdAt = opts.createdAt ?? Date.now();
  return {
    id: opts.id,
    kind: opts.kind ?? 'turn',
    scope: 'agent',
    ownerAgentId: 'primary-agent',
    ownerTeamId: 'default-team',
    summary: opts.summary,
    keywords: opts.keywords,
    createdAt,
    accessCount: opts.accessCount ?? 0,
    lastAccessedAt: createdAt,
    accessPolicy: {
      tier: 'private',
      readers: ['primary-agent'],
      writers: ['primary-agent'],
    },
    provenance: {
      sourceAgentId: 'primary-agent',
      sourceTeamId: 'default-team',
      createdAt,
      revision: 1,
    },
  };
}

export function makeEvalQuery(
  queryText: string,
  overrides?: Partial<MemoryRetrievalQuery>,
): MemoryRetrievalQuery {
  return {
    requester: { agentId: 'primary-agent', teamId: 'default-team' },
    queryText,
    recentUserTurns: [],
    maxResults: 6,
    ...overrides,
  };
}

export type QuestionType =
  | 'single-hop'
  | 'multi-hop'
  | 'temporal'
  | 'adversarial'
  | 'preference-tracking';

export interface EvalScenario {
  name: string;
  seedEpisodes: MemoryEpisodeRecord[];
  query: MemoryRetrievalQuery;
  expectedEpisodeIds: string[];
  forbiddenEpisodeIds?: string[];
  questionType?: QuestionType;
}
