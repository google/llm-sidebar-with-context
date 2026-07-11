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
  MAX_CONTEXT_LENGTH_CHARS_PER_TAB_DEFAULT,
} from '../constants';
import { IChatProvider, StartSessionResult } from './chatProvider';
import { IGeminiService } from './geminiService';
import { ISyncStorageService } from './storageService';

export class GoogleGeminiChatProvider implements IChatProvider {
  constructor(
    private geminiService: IGeminiService,
    private syncStorageService: ISyncStorageService,
  ) {}

  async startSession(): Promise<StartSessionResult> {
    const apiKey = await this.syncStorageService.get<string>(
      StorageKeys.API_KEY,
    );
    if (!apiKey) {
      return {
        error: 'Gemini API Key not set. Please set it in the Settings.',
      };
    }
    return {
      session: {
        charLimitPerTab: () => MAX_CONTEXT_LENGTH_CHARS_PER_TAB_DEFAULT,
        generateContent: (context, history, model, signal) =>
          this.geminiService.generateContent(
            apiKey,
            context,
            history,
            model,
            signal,
          ),
      },
    };
  }
}
