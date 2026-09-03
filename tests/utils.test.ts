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

import { describe, it, expect } from 'vitest';
import {
  isRestrictedURL,
  isAbortError,
  sandwichTruncate,
  validateChatHistory,
  toLLMErrorResponse,
  formatMessagesWithContext,
  calculateOpenRouterCharLimitPerTab,
  formatContextLength,
} from '../src/scripts/utils';
import {
  CONTEXT_MESSAGES,
  MIN_CONTEXT_LENGTH_CHARS_PER_TAB,
  MAX_CONTEXT_LENGTH_CHARS_PER_TAB_DEFAULT,
} from '../src/scripts/constants';

describe('Utils', () => {
  describe('isRestrictedURL', () => {
    it('should identify chrome:// URLs as restricted', () => {
      expect(isRestrictedURL('chrome://settings')).toBe(true);
      expect(isRestrictedURL('chrome://extensions')).toBe(true);
    });

    it('should identify about: URLs as restricted', () => {
      expect(isRestrictedURL('about:blank')).toBe(true);
      expect(isRestrictedURL('about:config')).toBe(true);
    });

    it('should identify chrome-extension:// URLs as restricted', () => {
      expect(isRestrictedURL('chrome-extension://some-id/index.html')).toBe(
        true,
      );
    });

    it('should identify file:// URLs as restricted', () => {
      expect(isRestrictedURL('file:///Users/username/doc.txt')).toBe(true);
    });

    it('should allow normal http/https URLs', () => {
      expect(isRestrictedURL('https://www.google.com')).toBe(false);
      expect(isRestrictedURL('http://localhost:3000')).toBe(false);
    });
  });

  describe('isAbortError', () => {
    it('should return true for DOMException with name "AbortError"', () => {
      const error = new DOMException('Aborted', 'AbortError');
      expect(isAbortError(error)).toBe(true);
    });

    it('should return true for Error with name "AbortError"', () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      expect(isAbortError(error)).toBe(true);
    });

    it('should return true for Error with message containing "aborted"', () => {
      const error = new Error('The user aborted a request.');
      expect(isAbortError(error)).toBe(true);
    });

    it('should return true for case-insensitive "aborted" message', () => {
      const error = new Error('Request Aborted by user');
      expect(isAbortError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      const error = new Error('Network Error');
      expect(isAbortError(error)).toBe(false);
    });

    it('should return false for non-error objects', () => {
      expect(isAbortError('string error')).toBe(false);
      expect(isAbortError({ random: 'object' })).toBe(false);
    });
  });

  describe('sandwichTruncate', () => {
    it('should not truncate if text is within limit', () => {
      const text = 'short text';
      expect(sandwichTruncate(text, 20)).toBe(text);
    });

    it('should not truncate if text is exactly at limit', () => {
      const text = 'exactly 10';
      expect(sandwichTruncate(text, 10)).toBe(text);
    });

    it('should truncate and keep both ends if text exceeds limit', () => {
      const text = 'START' + 'M'.repeat(100) + 'END';
      const limit = 70;
      const result = sandwichTruncate(text, limit);

      expect(result.length).toBe(limit);
      expect(result.startsWith('START')).toBe(true);
      expect(result.endsWith('END')).toBe(true);
      expect(result).toContain(CONTEXT_MESSAGES.TRUNCATION_MESSAGE);
    });

    it('should handle very small limits by returning start of string', () => {
      const text = 'Some long text that needs truncation';
      const limit = 5;
      const result = sandwichTruncate(text, limit);

      expect(result).toBe('Some ');
    });

    it('should split remaining space equally between start and end', () => {
      const text = '1234567890' + 'X'.repeat(100) + 'ABCDEFGHIJ';
      const truncationMessage = CONTEXT_MESSAGES.TRUNCATION_MESSAGE;
      const limit = truncationMessage.length + 10; // 5 chars from start, 5 from end
      const result = sandwichTruncate(text, limit);

      expect(result.startsWith('12345')).toBe(true);
      expect(result.endsWith('FGHIJ')).toBe(true);
      expect(result.length).toBe(limit);
    });
  });

  describe('validateChatHistory', () => {
    it('should reject an empty history', () => {
      expect(validateChatHistory([])).toBe('Chat history cannot be empty');
    });

    it('should reject a history not ending with a user message', () => {
      expect(
        validateChatHistory([
          { role: 'user', text: 'Hi' },
          { role: 'model', text: 'Hello' },
        ]),
      ).toBe('The last message must be from the user');
    });

    it('should accept a history ending with a user message', () => {
      expect(validateChatHistory([{ role: 'user', text: 'Hi' }])).toBeNull();
    });
  });

  describe('toLLMErrorResponse', () => {
    it('should map abort errors to an aborted response', () => {
      expect(
        toLLMErrorResponse(new DOMException('Aborted', 'AbortError')),
      ).toEqual({ aborted: true });
    });

    it('should map other errors to their message', () => {
      expect(toLLMErrorResponse(new Error('boom'))).toEqual({ error: 'boom' });
    });

    it('should stringify non-Error values', () => {
      expect(toLLMErrorResponse('boom')).toEqual({ error: 'boom' });
    });
  });

  describe('formatMessagesWithContext', () => {
    it('should map history roles to OpenAI/Ollama compatible roles', () => {
      const history = [
        { role: 'user' as const, text: 'Hello' },
        { role: 'model' as const, text: 'Hi there!' },
        { role: 'user' as const, text: 'How are you?' },
      ];

      const result = formatMessagesWithContext([], history);

      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ]);
    });

    it('should prepend text context to the last user message', () => {
      const history = [{ role: 'user' as const, text: 'Summarize this page' }];
      const context = [
        { type: 'text' as const, text: 'Page title: Example' },
        { type: 'text' as const, text: 'Page body: Hello world' },
      ];

      const result = formatMessagesWithContext(context, history);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe(
        'Page title: Example\nPage body: Hello world\n\nSummarize this page',
      );
    });

    it('should replace non-text context parts with unsupported placeholder', () => {
      const history = [{ role: 'user' as const, text: 'Look at this' }];
      const context = [
        { type: 'text' as const, text: 'Some text' },
        {
          type: 'file_data' as const,
          mimeType: 'video/mp4',
          fileUri: 'http://video.mp4',
        },
      ];

      const result = formatMessagesWithContext(context, history);

      expect(result[0].content).toContain('Some text');
      expect(result[0].content).toContain(
        CONTEXT_MESSAGES.FILE_CONTENT_UNSUPPORTED,
      );
      expect(result[0].content).toContain('Look at this');
    });

    it('should allow custom unsupported placeholder', () => {
      const history = [{ role: 'user' as const, text: 'Look at this' }];
      const context = [
        {
          type: 'file_data' as const,
          mimeType: 'image/png',
          fileUri: 'http://img.png',
        },
      ];

      const result = formatMessagesWithContext(
        context,
        history,
        '(Custom placeholder)',
      );

      expect(result[0].content).toBe('(Custom placeholder)\n\nLook at this');
    });
  });

  describe('calculateOpenRouterCharLimitPerTab', () => {
    it('should budget based on default assumed context length (32768) for 1 tab', () => {
      // (32768 - 2048) * 0.75 * 3 / 1 = 69120
      const limit = calculateOpenRouterCharLimitPerTab(1);
      expect(limit).toBe(69120);
    });

    it('should split budget equally across multiple tabs', () => {
      // (32768 - 2048) * 0.75 * 3 / 2 = 34560
      const limit = calculateOpenRouterCharLimitPerTab(2);
      expect(limit).toBe(34560);
    });

    it('should cap limit at MAX_CONTEXT_LENGTH_CHARS_PER_TAB_DEFAULT for very large models', () => {
      // (131072 - 2048) * 0.75 * 3 / 1 = 290304 -> capped at 250000
      const limit = calculateOpenRouterCharLimitPerTab(1, 131072);
      expect(limit).toBe(MAX_CONTEXT_LENGTH_CHARS_PER_TAB_DEFAULT);
    });

    it('should clamp limit at MIN_CONTEXT_LENGTH_CHARS_PER_TAB for very small windows or many tabs', () => {
      // (2048 - 2048) = 0 -> clamped at 1000
      const limit = calculateOpenRouterCharLimitPerTab(10, 2048);
      expect(limit).toBe(MIN_CONTEXT_LENGTH_CHARS_PER_TAB);
    });
  });

  describe('formatContextLength', () => {
    it('should return empty string for undefined, zero, or negative numbers', () => {
      expect(formatContextLength(undefined)).toBe('');
      expect(formatContextLength(0)).toBe('');
      expect(formatContextLength(-100)).toBe('');
    });

    it('should format binary multiples of 1024 as thousands with k suffix', () => {
      expect(formatContextLength(32768)).toBe('32k');
      expect(formatContextLength(65536)).toBe('64k');
      expect(formatContextLength(131072)).toBe('128k');
      expect(formatContextLength(16384)).toBe('16k');
      expect(formatContextLength(8192)).toBe('8k');
      expect(formatContextLength(4096)).toBe('4k');
    });

    it('should format round thousand token counts with k suffix', () => {
      expect(formatContextLength(64000)).toBe('64k');
      expect(formatContextLength(128000)).toBe('128k');
    });

    it('should format millions of tokens with M suffix', () => {
      expect(formatContextLength(1048576)).toBe('1M');
      expect(formatContextLength(2097152)).toBe('2M');
      expect(formatContextLength(1000000)).toBe('1M');
    });

    it('should format small token counts verbatim', () => {
      expect(formatContextLength(500)).toBe('500');
    });
  });
});
