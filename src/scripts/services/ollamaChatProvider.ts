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
  StorageKeys,
  OLLAMA_ASSUMED_NUM_CTX,
  OLLAMA_DEFAULT_HOST,
} from '../constants';
import { OllamaConfig, OllamaModelsResponse } from '../types';
import {
  sanitizeOllamaSettings,
  calculateOllamaCharLimitPerTab,
  normalizeOllamaHost,
} from '../ollamaUtils';
import { IChatProvider, StartSessionResult } from './chatProvider';
import { IOllamaService } from './ollamaService';
import { IDNRService } from './dnrService';
import { ISyncStorageService } from './storageService';

export class OllamaChatProvider implements IChatProvider {
  constructor(
    private ollamaService: IOllamaService,
    private dnrService: IDNRService,
    private syncStorageService: ISyncStorageService,
  ) {}

  private async getConfig(): Promise<OllamaConfig> {
    return sanitizeOllamaSettings(
      await this.syncStorageService.get(StorageKeys.OLLAMA_SETTINGS),
    );
  }

  async startSession(): Promise<StartSessionResult> {
    const config = await this.getConfig();
    if (!config.enabled) {
      return {
        error: 'Ollama is not enabled. Please enable it in the Settings.',
      };
    }
    // Make sure the CORS-bypass rule is in place before fetching.
    await this.dnrService.ensureRule(config);
    return {
      session: {
        charLimitPerTab: (numTabs) =>
          calculateOllamaCharLimitPerTab(
            numTabs,
            config.numCtx ?? OLLAMA_ASSUMED_NUM_CTX,
          ),
        generateContent: (context, history, model, signal) =>
          this.ollamaService.generateContent(
            config.host,
            model,
            context,
            history,
            { numCtx: config.numCtx, keepAlive: config.keepAlive },
            signal,
          ),
      },
    };
  }

  async listModels(): Promise<OllamaModelsResponse> {
    const config = await this.getConfig();
    if (!config.enabled) {
      return { success: false, models: [], error: 'Ollama is not enabled.' };
    }
    await this.dnrService.ensureRule(config);
    const result = await this.ollamaService.listModels(config.host);
    if (result.error !== undefined || !result.models) {
      return { success: false, models: [], error: result.error };
    }
    return { success: true, models: result.models };
  }

  async testConnection(host: string): Promise<OllamaModelsResponse> {
    // An empty host means "use the default".
    const normalizedHost = normalizeOllamaHost(
      host.trim() || OLLAMA_DEFAULT_HOST,
    );
    if (!normalizedHost) {
      return { success: false, models: [], error: 'Invalid Ollama host URL.' };
    }
    // Testing uses the (possibly unsaved) host from the input, so a dedicated
    // test rule targets it for the request to pass Ollama's CORS check. The
    // main rule — and any chat request relying on it — is never touched.
    await this.dnrService.setTestRule(normalizedHost);
    try {
      const result = await this.ollamaService.listModels(normalizedHost);
      if (result.error !== undefined || !result.models) {
        return { success: false, models: [], error: result.error };
      }
      return { success: true, models: result.models };
    } finally {
      // A cleanup failure must not mask the test result; the stale test rule
      // is inert (extension-initiated requests to that host only) and is
      // replaced by the next test.
      try {
        await this.dnrService.removeTestRule();
      } catch (error) {
        console.error('Failed to remove the Ollama test DNR rule:', error);
      }
    }
  }

  async reconcile(): Promise<void> {
    // Dynamic DNR rules persist across service-worker restarts; re-derive
    // them from saved settings (e.g. remove the rule if Ollama was disabled
    // before the restart) and drop any test rule left by an interrupted test.
    await this.dnrService.ensureRule(await this.getConfig());
    await this.dnrService.removeTestRule();
  }
}
