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
import { ForgettingPolicyService } from '../../../src/scripts/memory/domains/forgettingPolicy/ForgettingPolicyService';
import { TeamMemoryEnvelope } from '../../../src/scripts/memory/types/entities';

describe('ForgettingPolicyService', () => {
  const service = new ForgettingPolicyService();

  it('should retain all episodes when below capacity', () => {
    const memory: TeamMemoryEnvelope = {
      scope: 'agent',
      episodes: [],
    };

    const result = service.applyPolicy(memory);
    expect(result.retainedEpisodes).toEqual([]);
    expect(result.droppedEpisodeIds).toEqual([]);
  });
});
