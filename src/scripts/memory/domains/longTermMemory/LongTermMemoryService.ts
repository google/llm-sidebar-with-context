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

import { StorageKeys } from '../../../constants';
import { ILocalStorageService } from '../../../services/storageService';
import { MEMORY_SCHEMA_VERSION } from '../../config';
import { ILongTermMemoryService } from '../../contracts/ILongTermMemoryService';
import { MemoryScope } from '../../types/domain';
import {
  MemoryEpisodeRecord,
  TeamMemoryEnvelope,
  TeamMemoryState,
} from '../../types/entities';

function createEmptyEnvelope(scope: MemoryScope): TeamMemoryEnvelope {
  return { scope, episodes: [] };
}

function createEmptyState(): TeamMemoryState {
  return {
    byScope: {
      agent: createEmptyEnvelope('agent'),
      team: createEmptyEnvelope('team'),
      global: createEmptyEnvelope('global'),
    },
    schemaVersion: MEMORY_SCHEMA_VERSION,
    updatedAt: Date.now(),
  };
}

export class LongTermMemoryService implements ILongTermMemoryService {
  private state: TeamMemoryState = createEmptyState();

  constructor(private localStorageService: ILocalStorageService) {}

  async load(): Promise<void> {
    const stored = await this.localStorageService.get<unknown>(
      StorageKeys.AGENT_MEMORY,
    );

    if (!stored || typeof stored !== 'object') {
      this.state = createEmptyState();
      return;
    }

    const storedState = stored as Partial<TeamMemoryState> & {
      episodes?: MemoryEpisodeRecord[];
    };

    if (storedState.byScope) {
      this.state = this.normalizeState(storedState as TeamMemoryState);
      return;
    }

    // Backward compatibility with v1 schema (flat episodes array)
    const fallback = createEmptyState();
    const episodes = Array.isArray(storedState.episodes)
      ? storedState.episodes
      : [];
    fallback.byScope.agent.episodes = episodes
      .filter((episode) => this.isLegacyCompatibleEpisode(episode))
      .map((episode) => ({
        ...episode,
        scope: episode.scope ?? 'agent',
        accessPolicy: episode.accessPolicy ?? {
          tier: 'private',
          readers: [episode.ownerAgentId ?? 'primary-agent'],
          writers: [episode.ownerAgentId ?? 'primary-agent'],
        },
        provenance: episode.provenance ?? {
          sourceAgentId: episode.ownerAgentId ?? 'primary-agent',
          sourceTeamId: episode.ownerTeamId ?? 'default-team',
          createdAt: episode.createdAt,
          revision: 1,
        },
        ownerAgentId: episode.ownerAgentId ?? 'primary-agent',
        ownerTeamId: episode.ownerTeamId ?? 'default-team',
      }));
    fallback.updatedAt =
      typeof storedState.updatedAt === 'number'
        ? storedState.updatedAt
        : Date.now();
    this.state = fallback;
    await this.save();
  }

  async save(): Promise<void> {
    this.state.updatedAt = Date.now();
    await this.localStorageService.set(StorageKeys.AGENT_MEMORY, this.state);
  }

  async clear(scope?: MemoryScope): Promise<void> {
    if (!scope) {
      this.state = createEmptyState();
      await this.save();
      return;
    }
    this.state.byScope[scope] = createEmptyEnvelope(scope);
    await this.save();
  }

  async appendEpisode(episode: MemoryEpisodeRecord): Promise<void> {
    if (!this.isValidEpisode(episode)) {
      return;
    }
    this.state.byScope[episode.scope].episodes.push(episode);
    await this.save();
  }

  getEpisodes(scope: MemoryScope): MemoryEpisodeRecord[] {
    return [...this.state.byScope[scope].episodes];
  }

  async updateEpisodes(
    scope: MemoryScope,
    episodes: MemoryEpisodeRecord[],
  ): Promise<void> {
    this.state.byScope[scope] = {
      scope,
      episodes: episodes.filter((episode) => this.isValidEpisode(episode)),
    };
    await this.save();
  }

  getStateSnapshot(): TeamMemoryState {
    return structuredClone(this.state);
  }

  private normalizeState(state: TeamMemoryState): TeamMemoryState {
    const normalized = createEmptyState();
    normalized.updatedAt =
      typeof state.updatedAt === 'number' ? state.updatedAt : Date.now();
    normalized.schemaVersion = MEMORY_SCHEMA_VERSION;

    for (const scope of ['agent', 'team', 'global'] as MemoryScope[]) {
      const envelope = state.byScope?.[scope];
      normalized.byScope[scope] = {
        scope,
        episodes: Array.isArray(envelope?.episodes)
          ? envelope.episodes.filter((episode) => this.isValidEpisode(episode))
          : [],
      };
    }

    return normalized;
  }

  private isValidEpisode(value: unknown): value is MemoryEpisodeRecord {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const episode = value as MemoryEpisodeRecord;
    return (
      typeof episode.id === 'string' &&
      (episode.kind === 'turn' || episode.kind === 'summary') &&
      (episode.scope === 'agent' ||
        episode.scope === 'team' ||
        episode.scope === 'global') &&
      typeof episode.summary === 'string' &&
      Array.isArray(episode.keywords) &&
      typeof episode.createdAt === 'number' &&
      typeof episode.accessCount === 'number' &&
      typeof episode.lastAccessedAt === 'number' &&
      episode.accessPolicy !== undefined &&
      episode.provenance !== undefined
    );
  }

  private isLegacyCompatibleEpisode(
    value: unknown,
  ): value is MemoryEpisodeRecord {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const episode = value as Partial<MemoryEpisodeRecord>;
    return (
      typeof episode.id === 'string' &&
      (episode.kind === 'turn' || episode.kind === 'summary') &&
      typeof episode.summary === 'string' &&
      Array.isArray(episode.keywords) &&
      typeof episode.createdAt === 'number' &&
      typeof episode.accessCount === 'number' &&
      typeof episode.lastAccessedAt === 'number'
    );
  }
}
