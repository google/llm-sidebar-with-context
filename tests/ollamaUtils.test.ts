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
  normalizeOllamaHost,
  sanitizeOllamaSettings,
  toStoredOllamaSettings,
  calculateOllamaCharLimitPerTab,
} from '../src/scripts/ollamaUtils';
import {
  MIN_CONTEXT_LENGTH_CHARS_PER_TAB,
  OLLAMA_DEFAULT_HOST,
  OLLAMA_NUM_CTX_MAX,
  OLLAMA_NUM_CTX_MIN,
} from '../src/scripts/constants';

describe('OllamaUtils', () => {
  describe('normalizeOllamaHost', () => {
    it('should prepend http:// when the scheme is missing', () => {
      expect(normalizeOllamaHost('127.0.0.1:11434')).toBe(
        'http://127.0.0.1:11434',
      );
      expect(normalizeOllamaHost('localhost:11434')).toBe(
        'http://localhost:11434',
      );
    });

    it('should keep an explicit scheme', () => {
      expect(normalizeOllamaHost('https://ollama.local:8080')).toBe(
        'https://ollama.local:8080',
      );
    });

    it('should strip paths and trailing slashes', () => {
      expect(normalizeOllamaHost('http://localhost:11434/api/')).toBe(
        'http://localhost:11434',
      );
    });

    it('should trim whitespace', () => {
      expect(normalizeOllamaHost('  localhost:11434  ')).toBe(
        'http://localhost:11434',
      );
    });

    it('should reject invalid input', () => {
      expect(normalizeOllamaHost('')).toBeNull();
      expect(normalizeOllamaHost('   ')).toBeNull();
      expect(normalizeOllamaHost('not a url')).toBeNull();
    });
  });

  describe('sanitizeOllamaSettings', () => {
    it('should return defaults for missing or malformed storage values', () => {
      const expected = {
        enabled: false,
        host: OLLAMA_DEFAULT_HOST,
      };
      expect(sanitizeOllamaSettings(undefined)).toEqual(expected);
      expect(sanitizeOllamaSettings(null)).toEqual(expected);
      expect(sanitizeOllamaSettings('garbage')).toEqual(expected);
      expect(sanitizeOllamaSettings(42)).toEqual(expected);
      expect(sanitizeOllamaSettings({})).toEqual(expected);
    });

    it('should parse valid stored settings', () => {
      expect(
        sanitizeOllamaSettings({
          enabled: true,
          host: 'localhost:9999',
          numCtx: '8192',
          keepAlive: ' 10m ',
        }),
      ).toEqual({
        enabled: true,
        host: 'http://localhost:9999',
        numCtx: 8192,
        keepAlive: '10m',
      });
    });

    it('should fall back per-field on garbage values', () => {
      expect(
        sanitizeOllamaSettings({
          enabled: 'yes',
          host: 'not a url',
          numCtx: 'abc',
          keepAlive: '',
        }),
      ).toEqual({
        enabled: false,
        host: OLLAMA_DEFAULT_HOST,
      });
    });

    it('should leave numCtx unset for empty or unparseable values', () => {
      expect(sanitizeOllamaSettings({ numCtx: '' }).numCtx).toBeUndefined();
      expect(sanitizeOllamaSettings({ numCtx: 'abc' }).numCtx).toBeUndefined();
      expect(sanitizeOllamaSettings({}).numCtx).toBeUndefined();
    });

    it('should clamp numCtx to the allowed range', () => {
      expect(sanitizeOllamaSettings({ numCtx: '1' }).numCtx).toBe(
        OLLAMA_NUM_CTX_MIN,
      );
      expect(sanitizeOllamaSettings({ numCtx: '999999999' }).numCtx).toBe(
        OLLAMA_NUM_CTX_MAX,
      );
    });

    it('should ignore a non-string numCtx', () => {
      expect(sanitizeOllamaSettings({ numCtx: 8192 }).numCtx).toBeUndefined();
    });
  });

  describe('toStoredOllamaSettings', () => {
    it('should default all fields for missing or malformed storage values', () => {
      const expected = { enabled: false, host: '', numCtx: '', keepAlive: '' };
      expect(toStoredOllamaSettings(undefined)).toEqual(expected);
      expect(toStoredOllamaSettings(null)).toEqual(expected);
      expect(toStoredOllamaSettings('garbage')).toEqual(expected);
    });

    it('should keep string fields verbatim for display', () => {
      expect(
        toStoredOllamaSettings({
          enabled: true,
          host: ' localhost:9999 ',
          numCtx: ' 8192 ',
          keepAlive: ' 10m ',
        }),
      ).toEqual({
        enabled: true,
        host: ' localhost:9999 ',
        numCtx: ' 8192 ',
        keepAlive: ' 10m ',
      });
    });

    it('should default a non-string numCtx', () => {
      expect(toStoredOllamaSettings({ numCtx: 8192 }).numCtx).toBe('');
    });
  });

  describe('calculateOllamaCharLimitPerTab', () => {
    it('should divide the Ollama context budget across tabs', () => {
      // (8192 - 1024 reserved) tokens * 0.75 * 3 chars = 16128 chars / 2 tabs
      expect(calculateOllamaCharLimitPerTab(2, 8192)).toBe(8064);
    });

    it('should treat zero tabs as one tab', () => {
      expect(calculateOllamaCharLimitPerTab(0, 8192)).toBe(16128);
    });

    it('should enforce the minimum per-tab limit', () => {
      expect(calculateOllamaCharLimitPerTab(7, 512)).toBe(
        MIN_CONTEXT_LENGTH_CHARS_PER_TAB,
      );
    });
  });
});
