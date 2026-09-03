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
  RestrictedURLs,
  CONTEXT_MESSAGES,
  MIN_CONTEXT_LENGTH_CHARS_PER_TAB,
  MAX_CONTEXT_LENGTH_CHARS_PER_TAB_DEFAULT,
  CHARS_PER_TOKEN,
  OPENROUTER_ASSUMED_CONTEXT_LENGTH,
} from './constants';
import { ChatMessage, ContentPart, LLMResponse } from './types';

/**
 * Checks if a URL is restricted (e.g., chrome://, about:, file://).
 * @param url - The URL to check.
 * @returns True if the URL is restricted, false otherwise.
 */
export function isRestrictedURL(url: string): boolean {
  return RestrictedURLs.some((prefix) => url.startsWith(prefix));
}

/**
 * Truncates text by keeping the beginning and end, with a truncation message in the middle.
 * @param text - The text to truncate.
 * @param charLimit - The maximum character limit.
 * @returns The truncated text.
 */
export function sandwichTruncate(text: string, charLimit: number): string {
  if (text.length <= charLimit) {
    return text;
  }

  const truncationMessage = CONTEXT_MESSAGES.TRUNCATION_MESSAGE;
  const remainingSpace = charLimit - truncationMessage.length;

  if (remainingSpace <= 0) {
    // If limit is very small, just return the first few characters
    return text.substring(0, charLimit);
  }

  const startChars = Math.floor(remainingSpace / 2);
  const endChars = remainingSpace - startChars;

  return (
    text.substring(0, startChars) +
    truncationMessage +
    text.substring(text.length - endChars)
  );
}

/**
 * Validates that a chat history is sendable to an LLM provider.
 * @param history - The chat history to validate.
 * @returns A user-facing error message, or null when the history is valid.
 */
export function validateChatHistory(history: ChatMessage[]): string | null {
  if (history.length === 0) {
    return 'Chat history cannot be empty';
  }
  if (history[history.length - 1].role !== 'user') {
    return 'The last message must be from the user';
  }
  return null;
}

/**
 * Maps a caught error to the LLMResponse shape shared by all providers:
 * aborts become `{ aborted: true }`, everything else a user-facing error.
 * @param error - The caught error.
 */
export function toLLMErrorResponse(error: unknown): LLMResponse {
  if (isAbortError(error)) {
    return { aborted: true };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { error: message };
}

/**
 * Checks if an error is an AbortError.
 * @param error - The error to check.
 * @returns True if the error is an AbortError.
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.message.toLowerCase().includes('aborted'))
  ) {
    return true;
  }
  return false;
}

/**
 * Formats ChatMessage history and context parts into OpenAI/Ollama compatible message objects.
 * Maps 'model' role to 'assistant' and prepends context text to the last user message.
 */
export function formatMessagesWithContext(
  context: ContentPart[],
  history: ChatMessage[],
  unsupportedPlaceholder: string = CONTEXT_MESSAGES.FILE_CONTENT_UNSUPPORTED,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> =
    history.map((msg) => ({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content: msg.text,
    }));

  if (context.length > 0 && messages.length > 0) {
    const contextText = context
      .map((part) =>
        part.type === 'text' ? part.text : unsupportedPlaceholder,
      )
      .join('\n');
    const lastMessage = messages[messages.length - 1];
    lastMessage.content = `${contextText}\n\n${lastMessage.content}`;
  }

  return messages;
}

/**
 * Calculates the per-tab character limit for OpenRouter page content from the
 * model's context length.
 * Tokens are reserved for response output and prompt overhead (2048 tokens);
 * 75% of the remaining window is budgeted for tab content at ~3 chars/token.
 * @param numTabs - Number of tabs contributing content (pinned + current).
 * @param contextLengthTokens - The model's context window in tokens (defaults to 32768).
 */
export function calculateOpenRouterCharLimitPerTab(
  numTabs: number,
  contextLengthTokens: number = OPENROUTER_ASSUMED_CONTEXT_LENGTH,
): number {
  const reserveTokens = 2048;
  const inputTokens = Math.max(0, contextLengthTokens - reserveTokens);
  const budget = Math.floor(
    (inputTokens * 0.75 * CHARS_PER_TOKEN) / Math.max(1, numTabs),
  );
  return Math.max(
    MIN_CONTEXT_LENGTH_CHARS_PER_TAB,
    Math.min(MAX_CONTEXT_LENGTH_CHARS_PER_TAB_DEFAULT, budget),
  );
}

/**
 * Formats a token count into a human-readable string (e.g. 32768 -> '32k', 1048576 -> '1M').
 * @param tokens - Number of tokens.
 * @returns Formatted string (e.g. '32k', '128k', '1M') or empty string if invalid.
 */
export function formatContextLength(tokens?: number): string {
  if (!tokens || typeof tokens !== 'number' || tokens <= 0) {
    return '';
  }
  if (tokens >= 1_000_000) {
    if (tokens % 1_000_000 === 0) {
      return `${tokens / 1_000_000}M`;
    }
    if (tokens % (1024 * 1024) === 0) {
      return `${tokens / (1024 * 1024)}M`;
    }
    const decMillions = tokens / 1_000_000;
    return decMillions % 1 === 0
      ? `${decMillions}M`
      : `${decMillions.toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    if (tokens % 1000 === 0) {
      return `${tokens / 1000}k`;
    }
    if (tokens % 1024 === 0) {
      return `${tokens / 1024}k`;
    }
    const thousands = Math.round(tokens / 1000);
    return `${thousands}k`;
  }
  return `${tokens}`;
}
