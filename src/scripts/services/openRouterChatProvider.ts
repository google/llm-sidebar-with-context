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

import { StorageKeys, OPENROUTER_ASSUMED_CONTEXT_LENGTH } from '../constants';
import { OpenRouterModelConfig, OpenRouterSettings } from '../types';
import { calculateOpenRouterCharLimitPerTab } from '../utils';
import { IChatProvider, StartSessionResult } from './chatProvider';
import { IOpenRouterService } from './openRouterService';
import { ILocalStorageService, ISyncStorageService } from './storageService';

export class OpenRouterChatProvider implements IChatProvider {
  constructor(
    private openRouterService: IOpenRouterService,
    private syncStorageService: ISyncStorageService,
    private localStorageService?: ILocalStorageService,
  ) {}

  async startSession(): Promise<StartSessionResult> {
    const settings = await this.syncStorageService.get<OpenRouterSettings>(
      StorageKeys.OPENROUTER_SETTINGS,
    );
    if (!settings || !settings.enabled) {
      return {
        error: 'OpenRouter is not enabled. Please enable it in the Settings.',
      };
    }

    const apiKey = settings.apiKey ? settings.apiKey.trim() : '';
    if (!apiKey) {
      return {
        error: 'OpenRouter API Key not set. Please set it in the Settings.',
      };
    }

    // Build context length mapping across configured custom models and cached models
    const contextLengthMap = new Map<string, number>();
    if (Array.isArray(settings.customModels)) {
      for (const m of settings.customModels) {
        if (m.id && typeof m.contextLength === 'number') {
          contextLengthMap.set(m.id, m.contextLength);
        }
      }
    }
    if (this.localStorageService) {
      const topCached = await this.localStorageService.get<
        OpenRouterModelConfig[]
      >(StorageKeys.OPENROUTER_TOP_MODELS_CACHE);
      if (Array.isArray(topCached)) {
        for (const m of topCached) {
          if (m.id && typeof m.contextLength === 'number') {
            contextLengthMap.set(m.id, m.contextLength);
          }
        }
      }
      const allCached = await this.localStorageService.get<
        OpenRouterModelConfig[]
      >(StorageKeys.OPENROUTER_ALL_MODELS_CACHE);
      if (Array.isArray(allCached)) {
        for (const m of allCached) {
          if (m.id && typeof m.contextLength === 'number') {
            contextLengthMap.set(m.id, m.contextLength);
          }
        }
      }
    }

    return {
      session: {
        charLimitPerTab: (numTabs: number, model?: string) => {
          const contextLength =
            (model ? contextLengthMap.get(model) : undefined) ??
            OPENROUTER_ASSUMED_CONTEXT_LENGTH;
          return calculateOpenRouterCharLimitPerTab(numTabs, contextLength);
        },
        generateContent: (context, history, model, signal) =>
          this.openRouterService.generateContent(
            apiKey,
            model,
            context,
            history,
            signal,
          ),
      },
    };
  }
}
