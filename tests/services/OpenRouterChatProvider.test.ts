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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterChatProvider } from '../../src/scripts/services/openRouterChatProvider';
import { IOpenRouterService } from '../../src/scripts/services/openRouterService';
import {
  ILocalStorageService,
  ISyncStorageService,
} from '../../src/scripts/services/storageService';
import {
  StorageKeys,
  MAX_CONTEXT_LENGTH_CHARS_PER_TAB_DEFAULT,
} from '../../src/scripts/constants';
import { OpenRouterSettings } from '../../src/scripts/types';

describe('OpenRouterChatProvider', () => {
  let provider: OpenRouterChatProvider;
  let mockOpenRouterService: IOpenRouterService;
  let mockSyncStorage: ISyncStorageService;
  let mockLocalStorage: ILocalStorageService;

  beforeEach(() => {
    mockOpenRouterService = {
      verifyKey: vi.fn(),
      fetchTopFreeModels: vi.fn(),
      fetchAllModels: vi.fn(),
      generateContent: vi.fn(),
    };
    mockSyncStorage = {
      get: vi.fn(),
      set: vi.fn(),
    };
    mockLocalStorage = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
    };
    provider = new OpenRouterChatProvider(
      mockOpenRouterService,
      mockSyncStorage,
      mockLocalStorage,
    );
  });

  it('should return error if settings are not found or provider is disabled', async () => {
    vi.mocked(mockSyncStorage.get).mockResolvedValue(undefined);
    const result1 = await provider.startSession();
    expect(result1.error).toBe(
      'OpenRouter is not enabled. Please enable it in the Settings.',
    );

    vi.mocked(mockSyncStorage.get).mockResolvedValue({
      enabled: false,
      apiKey: 'sk-or-test',
      mode: 'top5',
    } as OpenRouterSettings);
    const result2 = await provider.startSession();
    expect(result2.error).toBe(
      'OpenRouter is not enabled. Please enable it in the Settings.',
    );
  });

  it('should return error if apiKey is missing or empty', async () => {
    vi.mocked(mockSyncStorage.get).mockResolvedValue({
      enabled: true,
      apiKey: '   ',
      mode: 'top5',
    } as OpenRouterSettings);
    const result = await provider.startSession();
    expect(result.error).toBe(
      'OpenRouter API Key not set. Please set it in the Settings.',
    );
  });

  it('should return a ready-to-use ChatSession when configured and enabled', async () => {
    vi.mocked(mockSyncStorage.get).mockResolvedValue({
      enabled: true,
      apiKey: 'sk-or-valid',
      mode: 'top5',
      customModels: [
        {
          id: 'custom/model-32k',
          name: 'Model 32K',
          contextLength: 32768,
        },
      ],
    } as OpenRouterSettings);

    vi.mocked(mockLocalStorage.get).mockImplementation(async (key) => {
      if (key === StorageKeys.OPENROUTER_TOP_MODELS_CACHE) {
        return [
          {
            id: 'meta-llama/llama-3.3-70b-instruct:free',
            name: 'Llama 3.3 70B',
            contextLength: 131072,
          },
        ];
      }
      return undefined;
    });

    const result = await provider.startSession();
    expect(result.error).toBeUndefined();
    expect(result.session).toBeDefined();

    // Default fallback calculation: (32768 - 2048) * 0.75 * 3 / 1 = 69120
    expect(result.session!.charLimitPerTab(1)).toBe(69120);
    expect(result.session!.charLimitPerTab(2)).toBe(34560);

    // Context length from custom models
    expect(result.session!.charLimitPerTab(1, 'custom/model-32k')).toBe(69120);

    // Context length from cached top models: (131072 - 2048) * 0.75 * 3 / 1 = 290304 -> capped at 250000
    expect(
      result.session!.charLimitPerTab(
        1,
        'meta-llama/llama-3.3-70b-instruct:free',
      ),
    ).toBe(MAX_CONTEXT_LENGTH_CHARS_PER_TAB_DEFAULT);

    // Check generateContent delegation
    const mockContext = [{ type: 'text' as const, text: 'context' }];
    const mockHistory = [{ role: 'user' as const, text: 'Hi' }];
    const signal = new AbortController().signal;

    vi.mocked(mockOpenRouterService.generateContent).mockResolvedValue({
      reply: 'Hello there!',
    });

    const response = await result.session!.generateContent(
      mockContext,
      mockHistory,
      'openrouter/free',
      signal,
    );

    expect(mockOpenRouterService.generateContent).toHaveBeenCalledWith(
      'sk-or-valid',
      'openrouter/free',
      mockContext,
      mockHistory,
      signal,
    );
    expect(response).toEqual({ reply: 'Hello there!' });
  });
});
