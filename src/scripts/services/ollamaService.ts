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

import { CONTEXT_MESSAGES, OLLAMA_LIST_MODELS_TIMEOUT_MS } from '../constants';
import { ChatMessage, LLMResponse, ContentPart } from '../types';
import { toLLMErrorResponse, validateChatHistory } from '../utils';

interface OllamaTagsResponse {
  models?: Array<{ name: string } | null>;
}

interface OllamaChatResponse {
  message?: {
    content: string;
  };
  done_reason?: string;
  error?: string;
}

// Each option is only sent to Ollama when set; otherwise the server's
// configuration applies.
export interface OllamaGenerateOptions {
  numCtx?: number;
  keepAlive?: string;
}

export interface OllamaListModelsResult {
  models?: string[];
  error?: string;
}

export interface IOllamaService {
  listModels(host: string): Promise<OllamaListModelsResult>;

  generateContent(
    host: string,
    model: string,
    context: ContentPart[],
    history: ChatMessage[],
    options: OllamaGenerateOptions,
    signal?: AbortSignal,
  ): Promise<LLMResponse>;
}

export class OllamaService implements IOllamaService {
  async listModels(host: string): Promise<OllamaListModelsResult> {
    try {
      const response = await fetch(`${host}/api/tags`, {
        // Bound the request so an unreachable host (hanging TCP connect)
        // cannot stall callers such as sidebar startup.
        signal: AbortSignal.timeout(OLLAMA_LIST_MODELS_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { error: `Ollama returned HTTP ${response.status}` };
      }
      const data: OllamaTagsResponse = await response.json();
      const models = Array.isArray(data.models)
        ? data.models
            .filter(
              (m): m is { name: string } =>
                m !== null &&
                typeof m === 'object' &&
                typeof m.name === 'string',
            )
            .map((m) => m.name)
        : [];
      return { models };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }

  async generateContent(
    host: string,
    model: string,
    context: ContentPart[],
    history: ChatMessage[],
    options: OllamaGenerateOptions,
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    try {
      if (!model) {
        return { error: 'Ollama model is required' };
      }
      const historyError = validateChatHistory(history);
      if (historyError) {
        return { error: historyError };
      }

      // Map history to Ollama chat format ('model' role becomes 'assistant')
      const messages: { role: string; content: string }[] = history.map(
        (msg) => ({
          role: msg.role === 'model' ? 'assistant' : msg.role,
          content: msg.text,
        }),
      );

      // Inject context into the last user message. Ollama has no file/video
      // input support, so file_data parts become a text placeholder.
      if (context.length > 0) {
        const contextText = context
          .map((part) =>
            part.type === 'text'
              ? part.text
              : CONTEXT_MESSAGES.FILE_CONTENT_UNSUPPORTED,
          )
          .join('\n');
        const lastMessage = messages[messages.length - 1];
        lastMessage.content = `${contextText}\n\n${lastMessage.content}`;
      }

      const response = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: false,
          ...(options.numCtx !== undefined && {
            options: { num_ctx: options.numCtx },
          }),
          ...(options.keepAlive !== undefined && {
            keep_alive: options.keepAlive,
          }),
        }),
        signal: signal,
      });

      if (!response.ok) {
        let errorMessage = `Ollama returned HTTP ${response.status}`;
        try {
          const errorData: OllamaChatResponse = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // Keep the HTTP status message
        }
        return { error: errorMessage };
      }

      const data: OllamaChatResponse = await response.json();

      if (data.message && typeof data.message.content === 'string') {
        if (data.message.content.trim() !== '') {
          return { reply: data.message.content };
        }
        // Reasoning models can exhaust the context window on "thinking"
        // before emitting any answer; surface that instead of an empty reply.
        if (data.done_reason === 'length') {
          return {
            error:
              'Ollama ran out of context window before finishing its response. ' +
              'Increase num_ctx under Settings → Ollama → Advanced, or share fewer tabs.',
          };
        }
        return { error: 'Ollama returned an empty response.' };
      } else if (data.error) {
        return { error: data.error };
      } else {
        return { error: 'Unknown error from Ollama.' };
      }
    } catch (error: unknown) {
      return toLLMErrorResponse(error);
    }
  }
}
