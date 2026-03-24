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

import { ChatMessage, LLMResponse, ContentPart } from '../../types';
import { isAbortError } from '../../utils';
import { ILLMService } from '../llmService';

/**
 * Chrome's built-in Gemini Nano model via the Prompt API.
 *
 * This provider runs entirely in-browser with no API key required.
 * It uses the chrome.aiOriginTrial.languageModel API (or the
 * standardized self.ai.languageModel when available).
 *
 * Availability: Chrome 131+ with "Prompt API for Gemini Nano" flag
 * enabled in chrome://flags. Falls back gracefully when unavailable.
 */
export class GeminiNanoLLMService implements ILLMService {
  async generateContent(
    _apiKey: string,
    context: ContentPart[],
    history: ChatMessage[],
    _model?: string,
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    try {
      if (history.length === 0) {
        return { error: 'Chat history cannot be empty' };
      }

      const api = await this.getLanguageModelAPI();
      if (!api) {
        return {
          error:
            'Gemini Nano is not available. Enable "Prompt API for Gemini Nano" in chrome://flags.',
        };
      }

      const capabilities = await api.capabilities();
      if (capabilities.available === 'no') {
        return {
          error:
            'Gemini Nano model is not downloaded. Visit chrome://components and update "Optimization Guide On Device Model".',
        };
      }

      const session = await api.create({ signal });

      // Build prompt from context + history
      const prompt = this.buildPrompt(context, history);
      const reply = await session.prompt(prompt, { signal });
      session.destroy();

      return { reply };
    } catch (error: unknown) {
      if (isAbortError(error)) {
        return { aborted: true };
      }
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }

  private buildPrompt(context: ContentPart[], history: ChatMessage[]): string {
    const parts: string[] = [];

    // Add context
    for (const part of context) {
      if (part.type === 'text') {
        parts.push(part.text);
      }
    }

    // Add conversation history
    for (const msg of history) {
      const role = msg.role === 'model' ? 'Assistant' : 'User';
      parts.push(`${role}: ${msg.text}`);
    }

    return parts.join('\n\n');
  }

  private async getLanguageModelAPI(): Promise<LanguageModelAPI | null> {
    // Try the standardized API first, then Chrome's origin trial API
    const global = globalThis as Record<string, unknown>;

    if (global.ai && typeof global.ai === 'object') {
      const ai = global.ai as Record<string, unknown>;
      if (ai.languageModel) {
        return ai.languageModel as LanguageModelAPI;
      }
    }

    if (global.chrome && typeof global.chrome === 'object') {
      const chrome = global.chrome as Record<string, unknown>;
      if (chrome.aiOriginTrial && typeof chrome.aiOriginTrial === 'object') {
        const trial = chrome.aiOriginTrial as Record<string, unknown>;
        if (trial.languageModel) {
          return trial.languageModel as LanguageModelAPI;
        }
      }
    }

    return null;
  }
}

interface LanguageModelAPI {
  capabilities(): Promise<{ available: string }>;
  create(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
}

interface LanguageModelSession {
  prompt(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}
