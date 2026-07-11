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

import { MessageTypes, StorageKeys } from '../constants';
import { OllamaModelsResponse } from '../types';
import { sanitizeOllamaSettings } from '../ollamaUtils';
import { ILocalStorageService, ISyncStorageService } from './storageService';
import { IMessageService } from './messageService';

// Cached Ollama model list, keyed by the host it was fetched from so a host
// change can never serve another server's models.
export interface OllamaModelsCacheEntry {
  host: string;
  models: string[];
}

/**
 * Sidebar-side access to the Ollama model list: fetches it via the
 * background and maintains the host-keyed fallback cache.
 */
export class OllamaModelsClient {
  constructor(
    private syncStorageService: ISyncStorageService,
    private localStorageService: ILocalStorageService,
    private messageService: IMessageService,
  ) {}

  /**
   * Fetches the Ollama model list via the background. A successful response
   * is authoritative — even when empty — and refreshes the cache. On failure,
   * falls back to the cached list if it was fetched from the same host.
   */
  async fetchModels(): Promise<{
    models: string[];
    fromCache: boolean;
  }> {
    const host = sanitizeOllamaSettings(
      await this.syncStorageService.get(StorageKeys.OLLAMA_SETTINGS),
    ).host;
    try {
      const response =
        await this.messageService.sendMessage<OllamaModelsResponse>({
          type: MessageTypes.OLLAMA_LIST_MODELS,
        });
      if (response && response.success && Array.isArray(response.models)) {
        const entry: OllamaModelsCacheEntry = {
          host,
          models: response.models,
        };
        await this.localStorageService.set(
          StorageKeys.OLLAMA_MODELS_CACHE,
          entry,
        );
        return { models: response.models, fromCache: false };
      }
    } catch (error) {
      console.error('Failed to fetch Ollama models:', error);
    }

    const cached = await this.localStorageService.get<OllamaModelsCacheEntry>(
      StorageKeys.OLLAMA_MODELS_CACHE,
    );
    // A pre-host-keyed cache (plain array) fails the host check and is
    // discarded, which is the intended migration.
    const models =
      cached && cached.host === host && Array.isArray(cached.models)
        ? cached.models.filter((m): m is string => typeof m === 'string')
        : [];
    return { models, fromCache: true };
  }
}
