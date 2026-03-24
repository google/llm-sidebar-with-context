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

import {
  IForgettingPolicyService,
  ForgettingDecision,
} from '../../contracts/IForgettingPolicyService';
import { TeamMemoryEnvelope } from '../../types/entities';
import { MEMORY_MAX_EPISODES } from '../../config';

export class ForgettingPolicyService implements IForgettingPolicyService {
  applyPolicy(memory: TeamMemoryEnvelope): ForgettingDecision {
    if (memory.episodes.length <= MEMORY_MAX_EPISODES) {
      return {
        retainedEpisodes: [...memory.episodes],
        droppedEpisodeIds: [],
      };
    }

    const sorted = [...memory.episodes].sort((a, b) => {
      const aScore = this.retentionScore(a.createdAt, a.accessCount);
      const bScore = this.retentionScore(b.createdAt, b.accessCount);
      return bScore - aScore;
    });

    const retainedEpisodes = sorted.slice(0, MEMORY_MAX_EPISODES);
    const retainedIds = new Set(retainedEpisodes.map((episode) => episode.id));
    const droppedEpisodeIds = memory.episodes
      .filter((episode) => !retainedIds.has(episode.id))
      .map((episode) => episode.id);

    return {
      retainedEpisodes,
      droppedEpisodeIds,
    };
  }

  private retentionScore(createdAt: number, accessCount: number): number {
    const ageHours = Math.max(1, (Date.now() - createdAt) / (1000 * 60 * 60));
    const recencyScore = 1 / (1 + Math.log10(ageHours + 1));
    const accessScore = Math.min(accessCount, 20) / 25;
    return recencyScore + accessScore;
  }
}
