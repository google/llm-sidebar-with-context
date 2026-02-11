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
import { isRestrictedURL, isAbortError } from '../src/scripts/utils';

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
});
