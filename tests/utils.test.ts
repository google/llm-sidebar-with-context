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
} from '../src/scripts/utils';
import { CONTEXT_MESSAGES } from '../src/scripts/constants';

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
});
