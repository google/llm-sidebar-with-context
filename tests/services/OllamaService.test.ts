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
import { OllamaService } from '../../src/scripts/services/ollamaService';
import { CONTEXT_MESSAGES } from '../../src/scripts/constants';
import { ChatMessage, ContentPart } from '../../src/scripts/types';

const HOST = 'http://127.0.0.1:11434';

describe('OllamaService', () => {
  let service: OllamaService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new OllamaService();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockJsonResponse(body: unknown, ok = true, status = 200) {
    fetchMock.mockResolvedValue({
      ok,
      status,
      json: async () => body,
    });
  }

  describe('listModels', () => {
    it('should fetch model names from /api/tags', async () => {
      mockJsonResponse({
        models: [{ name: 'llama3.1:8b' }, { name: 'qwen3:4b' }],
      });

      const result = await service.listModels(HOST);

      // The fetch is bounded by a timeout signal so an unreachable host
      // cannot stall callers (e.g. sidebar startup).
      expect(fetchMock).toHaveBeenCalledWith(`${HOST}/api/tags`, {
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual({ models: ['llama3.1:8b', 'qwen3:4b'] });
    });

    it('should skip malformed entries in the tags response', async () => {
      mockJsonResponse({
        models: [{ name: 'llama3.1:8b' }, null, { notName: true }],
      });
      expect(await service.listModels(HOST)).toEqual({
        models: ['llama3.1:8b'],
      });
    });

    it('should return an empty list when no models are installed', async () => {
      mockJsonResponse({ models: [] });
      expect(await service.listModels(HOST)).toEqual({ models: [] });
    });

    it('should tolerate a malformed tags response', async () => {
      mockJsonResponse({ unexpected: true });
      expect(await service.listModels(HOST)).toEqual({ models: [] });
    });

    it('should surface HTTP errors', async () => {
      mockJsonResponse({}, false, 403);
      expect(await service.listModels(HOST)).toEqual({
        error: 'Ollama returned HTTP 403',
      });
    });

    it('should surface network errors', async () => {
      fetchMock.mockRejectedValue(new Error('Failed to fetch'));
      expect(await service.listModels(HOST)).toEqual({
        error: 'Failed to fetch',
      });
    });
  });

  describe('generateContent', () => {
    const history: ChatMessage[] = [
      { role: 'user', text: 'First question' },
      { role: 'model', text: 'First answer' },
      { role: 'user', text: 'Second question' },
    ];

    it('should send a non-streaming chat request and return the reply', async () => {
      mockJsonResponse({ message: { content: 'The answer' } });

      const result = await service.generateContent(
        HOST,
        'llama3.1:8b',
        [],
        history,
        { numCtx: 8192, keepAlive: '10m' },
      );

      expect(result).toEqual({ reply: 'The answer' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${HOST}/api/chat`);
      const body = JSON.parse(init.body);
      expect(body.model).toBe('llama3.1:8b');
      expect(body.stream).toBe(false);
      expect(body.options).toEqual({ num_ctx: 8192 });
      expect(body.keep_alive).toBe('10m');
    });

    it('should map the "model" role to "assistant"', async () => {
      mockJsonResponse({ message: { content: 'ok' } });

      await service.generateContent(HOST, 'llama3.1:8b', [], history, {
        numCtx: 4096,
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.messages.map((m: { role: string }) => m.role)).toEqual([
        'user',
        'assistant',
        'user',
      ]);
    });

    it('should omit keep_alive when not set', async () => {
      mockJsonResponse({ message: { content: 'ok' } });

      await service.generateContent(HOST, 'llama3.1:8b', [], history, {
        numCtx: 4096,
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect('keep_alive' in body).toBe(false);
    });

    it('should omit options when num_ctx is not set', async () => {
      mockJsonResponse({ message: { content: 'ok' } });

      await service.generateContent(HOST, 'llama3.1:8b', [], history, {});

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect('options' in body).toBe(false);
    });

    it('should prepend context to the last user message', async () => {
      mockJsonResponse({ message: { content: 'ok' } });
      const context: ContentPart[] = [
        { type: 'text', text: 'Page content here' },
      ];

      await service.generateContent(HOST, 'llama3.1:8b', context, history, {
        numCtx: 4096,
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const last = body.messages[body.messages.length - 1];
      expect(last.role).toBe('user');
      expect(last.content).toBe('Page content here\n\nSecond question');
    });

    it('should replace file_data context parts with a placeholder', async () => {
      mockJsonResponse({ message: { content: 'ok' } });
      const context: ContentPart[] = [
        { type: 'file_data', mimeType: 'video/mp4', fileUri: 'https://yt' },
      ];

      await service.generateContent(HOST, 'llama3.1:8b', context, history, {
        numCtx: 4096,
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const last = body.messages[body.messages.length - 1];
      expect(last.content).toContain(CONTEXT_MESSAGES.FILE_CONTENT_UNSUPPORTED);
    });

    it('should validate inputs before fetching', async () => {
      expect(
        await service.generateContent(HOST, '', [], history, { numCtx: 4096 }),
      ).toEqual({ error: 'Ollama model is required' });
      expect(
        await service.generateContent(HOST, 'llama3.1:8b', [], [], {
          numCtx: 4096,
        }),
      ).toEqual({ error: 'Chat history cannot be empty' });
      expect(
        await service.generateContent(
          HOST,
          'llama3.1:8b',
          [],
          [{ role: 'model', text: 'Answer' }],
          { numCtx: 4096 },
        ),
      ).toEqual({ error: 'The last message must be from the user' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should surface the error field from an HTTP error body', async () => {
      mockJsonResponse({ error: 'model "missing" not found' }, false, 404);

      const result = await service.generateContent(
        HOST,
        'missing',
        [],
        history,
        { numCtx: 4096 },
      );

      expect(result).toEqual({ error: 'model "missing" not found' });
    });

    it('should fall back to the HTTP status on an unparseable error body', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      });

      const result = await service.generateContent(
        HOST,
        'llama3.1:8b',
        [],
        history,
        { numCtx: 4096 },
      );

      expect(result).toEqual({ error: 'Ollama returned HTTP 500' });
    });

    it('should return an error on an unexpected response shape', async () => {
      mockJsonResponse({ done: true });

      const result = await service.generateContent(
        HOST,
        'llama3.1:8b',
        [],
        history,
        { numCtx: 4096 },
      );

      expect(result).toEqual({ error: 'Unknown error from Ollama.' });
    });

    it('should surface a context-window error when the reply is empty due to length', async () => {
      // Reasoning models can burn the whole window on thinking and produce
      // no content at all.
      mockJsonResponse({
        message: { content: '' },
        done_reason: 'length',
      });

      const result = await service.generateContent(
        HOST,
        'gemma4:latest',
        [],
        history,
        { numCtx: 4096 },
      );

      expect(result.reply).toBeUndefined();
      expect(result.error).toContain('ran out of context window');
    });

    it('should return an error instead of an empty reply', async () => {
      mockJsonResponse({
        message: { content: '   ' },
        done_reason: 'stop',
      });

      const result = await service.generateContent(
        HOST,
        'llama3.1:8b',
        [],
        history,
        { numCtx: 4096 },
      );

      expect(result).toEqual({ error: 'Ollama returned an empty response.' });
    });

    it('should report aborts', async () => {
      fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

      const result = await service.generateContent(
        HOST,
        'llama3.1:8b',
        [],
        history,
        { numCtx: 4096 },
      );

      expect(result).toEqual({ aborted: true });
    });
  });
});
