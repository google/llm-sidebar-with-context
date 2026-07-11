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
  MIN_CONTEXT_LENGTH_CHARS_PER_TAB,
  OLLAMA_DEFAULT_HOST,
  OLLAMA_NUM_CTX_MIN,
  OLLAMA_NUM_CTX_MAX,
  OLLAMA_RESPONSE_RESERVE_TOKENS,
  CHARS_PER_TOKEN,
} from './constants';
import { OllamaConfig, OllamaSettings } from './types';

/**
 * Normalizes a user-entered Ollama host into a clean origin.
 * Prepends http:// when the scheme is missing and strips any path.
 * @param input - The raw host string (e.g. "127.0.0.1:11434").
 * @returns The normalized origin (e.g. "http://127.0.0.1:11434") or null if invalid.
 */
export function normalizeOllamaHost(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Coerces a raw (possibly malformed) storage value into the stored settings
 * shape, keeping strings verbatim for display and defaulting anything
 * malformed. This is the single boundary that types untrusted storage
 * contents; sanitizeOllamaSettings builds its use-time config on top of it.
 */
export function toStoredOllamaSettings(raw: unknown): OllamaSettings {
  const obj =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  return {
    enabled: obj.enabled === true,
    host: typeof obj.host === 'string' ? obj.host : '',
    numCtx: typeof obj.numCtx === 'string' ? obj.numCtx : '',
    keepAlive: typeof obj.keepAlive === 'string' ? obj.keepAlive : '',
  };
}

/**
 * Parses raw (possibly malformed) stored Ollama settings into a validated
 * use-time config, falling back to safe defaults for any invalid field.
 * Takes `unknown` deliberately: storage contents are untrusted (and may hold
 * verbatim garbage saved while the provider was disabled), and this function
 * is the boundary that turns them into a guaranteed-valid object.
 */
export function sanitizeOllamaSettings(raw: unknown): OllamaConfig {
  const stored = toStoredOllamaSettings(raw);
  const config: OllamaConfig = {
    enabled: stored.enabled,
    host: normalizeOllamaHost(stored.host) ?? OLLAMA_DEFAULT_HOST,
  };

  const numCtx = parseInt(stored.numCtx.trim(), 10);
  if (Number.isFinite(numCtx)) {
    config.numCtx = Math.min(
      OLLAMA_NUM_CTX_MAX,
      Math.max(OLLAMA_NUM_CTX_MIN, numCtx),
    );
  }

  if (stored.keepAlive.trim() !== '') {
    config.keepAlive = stored.keepAlive.trim();
  }

  return config;
}

/**
 * Calculates the per-tab character limit for Ollama page content from the
 * configured context window. Tokens are reserved for the model's output
 * first (reasoning models spend output tokens on thinking before answering);
 * 75% of the remaining window is budgeted for tab content at ~3 chars/token.
 * @param numTabs - Number of tabs contributing content (pinned + current).
 * @param numCtx - The Ollama context window size in tokens.
 */
export function calculateOllamaCharLimitPerTab(
  numTabs: number,
  numCtx: number,
): number {
  const inputTokens = Math.max(0, numCtx - OLLAMA_RESPONSE_RESERVE_TOKENS);
  const budget = Math.floor(
    (inputTokens * 0.75 * CHARS_PER_TOKEN) / Math.max(1, numTabs),
  );
  return Math.max(MIN_CONTEXT_LENGTH_CHARS_PER_TAB, budget);
}
