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

import { ChatMessage, ContentPart, LLMResponse } from '../types';

/**
 * Provider-agnostic interface for LLM content generation.
 *
 * Implementations should handle provider-specific API formats,
 * authentication, and response parsing internally. The memory
 * pipeline and orchestrator depend only on this interface, not
 * on any specific provider.
 */
export interface ILLMService {
  generateContent(
    apiKey: string,
    context: ContentPart[],
    history: ChatMessage[],
    model?: string,
    signal?: AbortSignal,
  ): Promise<LLMResponse>;
}

export type LLMProviderType = 'gemini' | 'claude' | 'openai' | 'gemini-nano';
