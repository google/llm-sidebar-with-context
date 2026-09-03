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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterService } from '../../src/scripts/services/openRouterService';

describe('OpenRouterService', () => {
  let openRouterService: OpenRouterService;

  beforeEach(() => {
    openRouterService = new OpenRouterService();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('verifyKey', () => {
    it('should return error if apiKey is empty', async () => {
      const result = await openRouterService.verifyKey('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('API key is required');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should return error if apiKey is only whitespace', async () => {
      const result = await openRouterService.verifyKey('   ');
      expect(result.success).toBe(false);
      expect(result.error).toBe('API key is required');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should call OpenRouter credits endpoint with Bearer token and return balance', async () => {
      const mockCreditsResponse = {
        data: {
          total_credits: 10.0,
          total_usage: 2.5,
        },
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockCreditsResponse,
      } as Response);

      const result = await openRouterService.verifyKey('sk-or-v1-valid-key');

      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe('https://openrouter.ai/api/v1/credits');
      expect((options as RequestInit).headers).toEqual(
        expect.objectContaining({
          Authorization: 'Bearer sk-or-v1-valid-key',
        }),
      );

      expect(result.success).toBe(true);
      expect(result.balance).toBe(7.5);
      expect(result.isFreeTier).toBe(false);
    });

    it('should identify free tier account if total_credits is 0', async () => {
      const mockCreditsResponse = {
        data: {
          total_credits: 0,
          total_usage: 0,
        },
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockCreditsResponse,
      } as Response);

      const result = await openRouterService.verifyKey('sk-or-v1-free-key');

      expect(result.success).toBe(true);
      expect(result.balance).toBe(0);
      expect(result.isFreeTier).toBe(true);
    });

    it('should clamp negative balance to 0 if usage exceeds credits', async () => {
      const mockCreditsResponse = {
        data: {
          total_credits: 5.0,
          total_usage: 6.0,
        },
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockCreditsResponse,
      } as Response);

      const result = await openRouterService.verifyKey('sk-or-v1-used-key');

      expect(result.success).toBe(true);
      expect(result.balance).toBe(0);
    });

    it('should return invalid API key error on 401 Unauthorized', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: 'Invalid API Key' },
        }),
      } as Response);

      const result = await openRouterService.verifyKey('sk-or-v1-bad-key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('should return custom error message from API if available on other error status', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: { message: 'Account suspended' },
        }),
      } as Response);

      const result = await openRouterService.verifyKey('sk-or-v1-key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account suspended');
    });

    it('should handle network exceptions gracefully', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Failed to fetch'));

      const result = await openRouterService.verifyKey('sk-or-v1-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to connect to OpenRouter');
    });
  });

  describe('fetchTopFreeModels', () => {
    it('should fetch models from sort=most-popular endpoint and extract top 5 free models plus router', async () => {
      const mockModelsResponse = {
        data: [
          {
            id: 'openrouter/free',
            name: 'openrouter/free: Free Models Router',
            context_length: 32768,
            pricing: { prompt: '0', completion: '0' },
          },
          {
            id: 'meta-llama/llama-3.3-70b-instruct:free',
            name: 'Meta: Llama 3.3 70B Instruct (free)',
            context_length: 131072,
            pricing: { prompt: '0', completion: '0' },
          },
          {
            id: 'openai/gpt-4o',
            name: 'OpenAI: GPT-4o',
            context_length: 128000,
            pricing: { prompt: '0.000005', completion: '0.000015' },
          },
          {
            id: 'deepseek/deepseek-r1:free',
            name: 'DeepSeek: DeepSeek R1 (free)',
            context_length: 64000,
            pricing: { prompt: '0', completion: '0' },
          },
          {
            id: 'deepseek/deepseek-chat:free',
            name: 'DeepSeek: DeepSeek V3 (free)',
            context_length: 64000,
            pricing: { prompt: '0', completion: '0' },
          },
          {
            id: 'qwen/qwen-2.5-coder-32b-instruct:free',
            name: 'Qwen: Qwen 2.5 Coder 32B (free)',
            context_length: 32768,
            pricing: { prompt: '0', completion: '0' },
          },
          {
            id: 'nvidia/nemotron-3-ultra:free',
            name: 'NVIDIA: Nemotron 3 Ultra (free)',
            context_length: 32768,
            pricing: { prompt: '0', completion: '0' },
          },
          {
            id: 'google/gemini-2.0-flash-lite:free',
            name: 'Google: Gemini 2.0 Flash Lite (free)',
            context_length: 1048576,
            pricing: { prompt: '0', completion: '0' },
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockModelsResponse,
      } as Response);

      const result = await openRouterService.fetchTopFreeModels();

      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe('https://openrouter.ai/api/v1/models?sort=most-popular');
      expect((options as RequestInit).signal).toBeDefined();

      expect(result.success).toBe(true);
      // openrouter/free + top 5 free models = 6 models
      expect(result.models).toHaveLength(6);
      expect(result.models[0]).toEqual({
        id: 'openrouter/free',
        name: 'openrouter/free: Free Models Router',
        isFree: true,
        contextLength: 32768,
      });
      expect(result.models[1]).toEqual({
        id: 'meta-llama/llama-3.3-70b-instruct:free',
        name: 'Meta: Llama 3.3 70B Instruct (free)',
        isFree: true,
        contextLength: 131072,
      });
      expect(result.models[2].id).toBe('deepseek/deepseek-r1:free');
      expect(result.models[3].id).toBe('deepseek/deepseek-chat:free');
      expect(result.models[4].id).toBe('qwen/qwen-2.5-coder-32b-instruct:free');
      expect(result.models[5].id).toBe('nvidia/nemotron-3-ultra:free');
      // The 6th free model (gemini-2.0-flash-lite:free) should be omitted
    });

    it('should fallback to openrouter/free if fetch fails or network is offline', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network offline'));

      const result = await openRouterService.fetchTopFreeModels();

      expect(result.success).toBe(false);
      expect(result.models).toEqual([
        {
          id: 'openrouter/free',
          name: 'openrouter/free: Free Models Router',
          isFree: true,
          contextLength: 32768,
        },
      ]);
      expect(result.error).toBeDefined();
    });

    it('should fallback to openrouter/free if response is not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const result = await openRouterService.fetchTopFreeModels();

      expect(result.success).toBe(false);
      expect(result.models).toEqual([
        {
          id: 'openrouter/free',
          name: 'openrouter/free: Free Models Router',
          isFree: true,
          contextLength: 32768,
        },
      ]);
    });
  });

  describe('fetchAllModels', () => {
    it('should fetch all models from sort=most-popular endpoint and map id, name, and isFree', async () => {
      const mockModelsResponse = {
        data: [
          {
            id: 'openai/gpt-4o',
            name: 'OpenAI: GPT-4o',
            context_length: 128000,
            pricing: { prompt: '0.000005', completion: '0.000015' },
          },
          {
            id: 'deepseek/deepseek-r1:free',
            name: 'DeepSeek: DeepSeek R1 (free)',
            context_length: 64000,
            pricing: { prompt: '0', completion: '0' },
          },
          {
            id: 'model-without-name',
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockModelsResponse,
      } as Response);

      const result = await openRouterService.fetchAllModels();

      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe('https://openrouter.ai/api/v1/models?sort=most-popular');
      expect((options as RequestInit).signal).toBeDefined();

      expect(result.success).toBe(true);
      expect(result.models).toEqual([
        {
          id: 'openai/gpt-4o',
          name: 'OpenAI: GPT-4o',
          isFree: false,
          contextLength: 128000,
        },
        {
          id: 'deepseek/deepseek-r1:free',
          name: 'DeepSeek: DeepSeek R1 (free)',
          isFree: true,
          contextLength: 64000,
        },
        {
          id: 'model-without-name',
          name: 'model-without-name',
          isFree: false,
          contextLength: undefined,
        },
      ]);
    });

    it('should handle fetch failure gracefully for fetchAllModels', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      const result = await openRouterService.fetchAllModels();

      expect(result.success).toBe(false);
      expect(result.models).toEqual([]);
      expect(result.error).toBeDefined();
    });
  });

  describe('generateContent', () => {
    it('should return error if apiKey is empty', async () => {
      const result = await openRouterService.generateContent(
        '',
        'openrouter/free',
        [],
        [{ role: 'user', text: 'Hi' }],
      );
      expect(result.error).toBe('API key is required');
    });

    it('should return error if chat history is invalid', async () => {
      const result = await openRouterService.generateContent(
        'sk-or-test',
        'openrouter/free',
        [],
        [],
      );
      expect(result.error).toBe('Chat history cannot be empty');

      const resultNotUser = await openRouterService.generateContent(
        'sk-or-test',
        'openrouter/free',
        [],
        [{ role: 'model', text: 'Hi' }],
      );
      expect(resultNotUser.error).toBe(
        'The last message must be from the user',
      );
    });

    it('should send POST request to /api/v1/chat/completions and return reply', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello, how can I help you today?',
            },
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const history = [
        { role: 'user' as const, text: 'Hello' },
        { role: 'model' as const, text: 'Hi!' },
        { role: 'user' as const, text: 'Can you help me?' },
      ];
      const context = [{ type: 'text' as const, text: 'Tab 1 context' }];

      const result = await openRouterService.generateContent(
        'sk-or-test',
        'openrouter/free',
        context,
        history,
      );

      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(options?.method).toBe('POST');
      expect(options?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk-or-test',
        'HTTP-Referer': expect.any(String),
        'X-Title': 'LLM Sidebar with Context',
      });

      const body = JSON.parse(options?.body as string);
      expect(body.model).toBe('openrouter/free');
      expect(body.messages).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        {
          role: 'user',
          content: 'Tab 1 context\n\nCan you help me?',
        },
      ]);

      expect(result).toEqual({
        reply: 'Hello, how can I help you today?',
      });
    });

    it('should return error message if API returns error object', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: 'Invalid API key provided' },
        }),
      } as Response);

      const result = await openRouterService.generateContent(
        'sk-or-invalid',
        'openrouter/free',
        [],
        [{ role: 'user', text: 'Hi' }],
      );

      expect(result.error).toBe('Invalid API key provided');
    });

    it('should return HTTP error if response is not ok and JSON parsing fails', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('Bad gateway');
        },
      } as unknown as Response);

      const result = await openRouterService.generateContent(
        'sk-or-test',
        'openrouter/free',
        [],
        [{ role: 'user', text: 'Hi' }],
      );

      expect(result.error).toBe('OpenRouter returned HTTP 502');
    });

    it('should extract provider name and raw error details from metadata when available', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({
          error: {
            code: 502,
            message: 'Provider returned error',
            metadata: {
              provider_name: 'DeepInfra',
              raw: JSON.stringify({ error: 'Model is currently overloaded' }),
            },
          },
        }),
      } as unknown as Response);

      const result = await openRouterService.generateContent(
        'sk-or-test',
        'openrouter/free',
        [],
        [{ role: 'user', text: 'Hi' }],
      );

      expect(result.error).toBe(
        'Provider error (DeepInfra): Model is currently overloaded',
      );
    });

    it('should format provider error with provider_name when raw details are missing', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({
          error: {
            code: 502,
            message: 'Provider returned error',
            metadata: {
              provider_name: 'Together',
            },
          },
        }),
      } as unknown as Response);

      const result = await openRouterService.generateContent(
        'sk-or-test',
        'openrouter/free',
        [],
        [{ role: 'user', text: 'Hi' }],
      );

      expect(result.error).toBe(
        'Provider error (Together): Upstream provider failed to respond.',
      );
    });

    it('should handle raw error in 200 OK error payload', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          error: {
            code: 400,
            message: 'Provider returned error',
            metadata: {
              provider_name: 'Google',
              raw: 'Input exceeds model token limit',
            },
          },
        }),
      } as Response);

      const result = await openRouterService.generateContent(
        'sk-or-test',
        'openrouter/free',
        [],
        [{ role: 'user', text: 'Hi' }],
      );

      expect(result.error).toBe(
        'Provider error (Google): Input exceeds model token limit',
      );
    });

    it('should return error if choices array is missing or empty', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [],
        }),
      } as Response);

      const result = await openRouterService.generateContent(
        'sk-or-test',
        'openrouter/free',
        [],
        [{ role: 'user', text: 'Hi' }],
      );

      expect(result.error).toBe('No content received from OpenRouter.');
    });

    it('should return helpful error if finish_reason is length and content is empty', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: { role: 'assistant', content: '' },
              finish_reason: 'length',
            },
          ],
        }),
      } as Response);

      const result = await openRouterService.generateContent(
        'sk-or-test',
        'openrouter/free',
        [],
        [{ role: 'user', text: 'Hi' }],
      );

      expect(result.error).toContain(
        'OpenRouter ran out of context window before finishing its response',
      );
    });

    it('should handle AbortError and return { aborted: true }', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      vi.mocked(fetch).mockRejectedValue(abortError);

      const controller = new AbortController();
      controller.abort();

      const result = await openRouterService.generateContent(
        'sk-or-test',
        'openrouter/free',
        [],
        [{ role: 'user', text: 'Hi' }],
        controller.signal,
      );

      expect(result).toEqual({ aborted: true });
    });
  });
});
