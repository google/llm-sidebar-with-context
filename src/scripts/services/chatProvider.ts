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
  ChatMessage,
  ContentPart,
  LLMResponse,
  OllamaModelsResponse,
} from '../types';

/**
 * A ready-to-use chat session for one provider, created after that
 * provider's configuration has been loaded and validated.
 */
export interface ChatSession {
  /** Per-tab character budget for page content shared as context. */
  charLimitPerTab(numTabs: number): number;

  generateContent(
    context: ContentPart[],
    history: ChatMessage[],
    model: string,
    signal: AbortSignal,
  ): Promise<LLMResponse>;
}

export type StartSessionResult =
  | { session: ChatSession; error?: undefined }
  | { session?: undefined; error: string };

/**
 * One implementation per LLM provider. Adding a provider means implementing
 * this interface and registering it in BackgroundController's provider map —
 * config loading, environment preparation (e.g. CORS rules), context
 * budgeting, and request dispatch all live behind startSession().
 */
export interface IChatProvider {
  /**
   * Loads and validates the provider's configuration and prepares anything
   * the request needs (e.g. network rules). Returns a user-facing error
   * message when the provider is not usable.
   */
  startSession(): Promise<StartSessionResult>;

  /**
   * Lists the models available from the provider, when the provider supports
   * dynamic model discovery.
   */
  listModels?(): Promise<OllamaModelsResponse>;

  /**
   * Probes the given (possibly unsaved) host and reports the models found,
   * when the provider supports connection testing.
   */
  testConnection?(host: string): Promise<OllamaModelsResponse>;

  /**
   * Reconciles any environment the provider owns (e.g. persisted network
   * rules) with the saved settings. Called on service-worker startup.
   */
  reconcile?(): Promise<void>;
}
