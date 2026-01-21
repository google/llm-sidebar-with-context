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
import { isRestrictedURL } from '../src/scripts/utils';

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
      expect(isRestrictedURL('chrome-extension://some-id/index.html')).toBe(true);
    });

    it('should identify file:// URLs as restricted', () => {
      expect(isRestrictedURL('file:///Users/username/doc.txt')).toBe(true);
    });

    it('should allow normal http/https URLs', () => {
      expect(isRestrictedURL('https://www.google.com')).toBe(false);
      expect(isRestrictedURL('http://localhost:3000')).toBe(false);
    });
  });
});
