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
  ChatMessage,
  ContentPart,
  LLMResponse,
  OpenRouterListModelsResponse,
  OpenRouterModelConfig,
  OpenRouterVerifyKeyResponse,
} from '../types';
import {
  OPENROUTER_FALLBACK_FREE_MODELS,
  OPENROUTER_REQUEST_TIMEOUT_MS,
  OPENROUTER_ASSUMED_CONTEXT_LENGTH,
} from '../constants';
import {
  formatMessagesWithContext,
  toLLMErrorResponse,
  validateChatHistory,
} from '../utils';

export interface IOpenRouterService {
  verifyKey(apiKey: string): Promise<OpenRouterVerifyKeyResponse>;
  fetchTopFreeModels(): Promise<OpenRouterListModelsResponse>;
  fetchAllModels(): Promise<OpenRouterListModelsResponse>;
  generateContent(
    apiKey: string,
    model: string,
    context: ContentPart[],
    history: ChatMessage[],
    signal?: AbortSignal,
  ): Promise<LLMResponse>;
}

export class OpenRouterService implements IOpenRouterService {
  private static readonly CREDITS_URL = 'https://openrouter.ai/api/v1/credits';
  private static readonly MODELS_URL =
    'https://openrouter.ai/api/v1/models?sort=most-popular';
  private static readonly CHAT_COMPLETIONS_URL =
    'https://openrouter.ai/api/v1/chat/completions';
  private static readonly ROUTER_MODEL: OpenRouterModelConfig = {
    id: 'openrouter/free',
    name: 'openrouter/free: Free Models Router',
    isFree: true,
    contextLength: OPENROUTER_ASSUMED_CONTEXT_LENGTH,
  };

  async verifyKey(apiKey: string): Promise<OpenRouterVerifyKeyResponse> {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      return { success: false, error: 'API key is required' };
    }

    try {
      const response = await fetch(OpenRouterService.CREDITS_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
        },
        signal: AbortSignal.timeout(OPENROUTER_REQUEST_TIMEOUT_MS),
      });

      if (response.status === 401) {
        return { success: false, error: 'Invalid API key' };
      }

      if (!response.ok) {
        let errorMessage = `Request failed with status ${response.status}`;
        try {
          const errorJson = await response.json();
          errorMessage = this.formatOpenRouterError(errorJson, errorMessage);
        } catch {
          // Keep default status message if json parsing fails
        }
        return { success: false, error: errorMessage };
      }

      const data = await response.json();
      const creditsData = data?.data;
      const totalCredits =
        typeof creditsData?.total_credits === 'number'
          ? creditsData.total_credits
          : 0;
      const totalUsage =
        typeof creditsData?.total_usage === 'number'
          ? creditsData.total_usage
          : 0;
      const balance = Math.max(0, totalCredits - totalUsage);
      const isFreeTier = totalCredits === 0;

      return {
        success: true,
        balance,
        isFreeTier,
      };
    } catch (error: unknown) {
      const err = error as Error;
      return {
        success: false,
        error: `Failed to connect to OpenRouter: ${err.message || String(error)}`,
      };
    }
  }

  async fetchTopFreeModels(): Promise<OpenRouterListModelsResponse> {
    try {
      const response = await fetch(OpenRouterService.MODELS_URL, {
        method: 'GET',
        signal: AbortSignal.timeout(OPENROUTER_REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        return {
          success: false,
          models: [...OPENROUTER_FALLBACK_FREE_MODELS],
          error: `Failed to fetch models: HTTP ${response.status}`,
        };
      }

      const json = await response.json();
      const rawModels: Array<{
        id: string;
        name?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
      }> = Array.isArray(json?.data) ? json.data : [];

      const freeModels = rawModels.filter((m) => {
        if (!m?.id) return false;
        if (m.id.endsWith(':free')) return true;
        const promptPrice = Number(m.pricing?.prompt);
        const completionPrice = Number(m.pricing?.completion);
        return promptPrice === 0 && completionPrice === 0;
      });

      const top5 = freeModels
        .filter((m) => m.id !== OpenRouterService.ROUTER_MODEL.id)
        .slice(0, 5)
        .map((m) => ({
          id: m.id,
          name: m.name || m.id,
          isFree: true,
          contextLength:
            typeof m.context_length === 'number' ? m.context_length : undefined,
        }));

      const models: OpenRouterModelConfig[] = [
        OpenRouterService.ROUTER_MODEL,
        ...top5,
      ];

      return {
        success: true,
        models,
      };
    } catch (error: unknown) {
      const err = error as Error;
      return {
        success: false,
        models: [...OPENROUTER_FALLBACK_FREE_MODELS],
        error: `Failed to fetch models: ${err.message || String(error)}`,
      };
    }
  }

  async fetchAllModels(): Promise<OpenRouterListModelsResponse> {
    try {
      const response = await fetch(OpenRouterService.MODELS_URL, {
        method: 'GET',
        signal: AbortSignal.timeout(OPENROUTER_REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        return {
          success: false,
          models: [],
          error: `Failed to fetch models: HTTP ${response.status}`,
        };
      }

      const json = await response.json();
      const rawModels: Array<{
        id: string;
        name?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
      }> = Array.isArray(json?.data) ? json.data : [];

      const models: OpenRouterModelConfig[] = rawModels
        .filter((m) => Boolean(m?.id))
        .map((m) => {
          const isFree =
            m.id.endsWith(':free') ||
            (Number(m.pricing?.prompt) === 0 &&
              Number(m.pricing?.completion) === 0);
          return {
            id: m.id,
            name: m.name || m.id,
            isFree,
            contextLength:
              typeof m.context_length === 'number'
                ? m.context_length
                : undefined,
          };
        });

      return {
        success: true,
        models,
      };
    } catch (error: unknown) {
      const err = error as Error;
      return {
        success: false,
        models: [],
        error: `Failed to fetch models: ${err.message || String(error)}`,
      };
    }
  }

  async generateContent(
    apiKey: string,
    model: string,
    context: ContentPart[],
    history: ChatMessage[],
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      return { error: 'API key is required' };
    }
    const historyError = validateChatHistory(history);
    if (historyError) {
      return { error: historyError };
    }

    try {
      const messages = formatMessagesWithContext(
        context,
        history,
        '(Video/file content is not supported by OpenRouter and was omitted)',
      );

      const response = await fetch(OpenRouterService.CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${trimmedKey}`,
          'HTTP-Referer': 'https://github.com/google/llm-sidebar-with-context',
          'X-Title': 'LLM Sidebar with Context',
        },
        body: JSON.stringify({
          model: model || 'openrouter/free',
          messages: messages,
        }),
        signal: signal,
      });

      if (!response.ok) {
        let errorMessage = `OpenRouter returned HTTP ${response.status}`;
        try {
          const errorJson = await response.json();
          errorMessage = this.formatOpenRouterError(errorJson, errorMessage);
        } catch {
          // Keep default status message if json parsing fails
        }
        return { error: errorMessage };
      }

      const data = await response.json();
      const choice = data?.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content === 'string' && content.trim() !== '') {
        return { reply: content };
      } else if (choice?.finish_reason === 'length') {
        return {
          error:
            'OpenRouter ran out of context window before finishing its response. ' +
            'Try sharing fewer tabs or selecting a model with a larger context window.',
        };
      } else if (data?.error) {
        return {
          error: this.formatOpenRouterError(
            data,
            'Error received from OpenRouter.',
          ),
        };
      } else {
        return { error: 'No content received from OpenRouter.' };
      }
    } catch (error: unknown) {
      return toLLMErrorResponse(error);
    }
  }

  private parseRawError(raw: unknown): string | null {
    if (!raw) return null;
    if (typeof raw === 'object' && raw !== null) {
      const obj = raw as Record<string, unknown>;
      const nested = obj.error;
      if (typeof nested === 'object' && nested !== null) {
        const nestedObj = nested as Record<string, unknown>;
        if (typeof nestedObj.message === 'string' && nestedObj.message.trim()) {
          return nestedObj.message.trim();
        }
      }
      if (typeof obj.error === 'string' && obj.error.trim()) {
        return obj.error.trim();
      }
      if (typeof obj.message === 'string' && obj.message.trim()) {
        return obj.message.trim();
      }
      try {
        return JSON.stringify(raw);
      } catch {
        return null;
      }
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          return this.parseRawError(parsed) || trimmed;
        } catch {
          return trimmed;
        }
      }
      return trimmed;
    }
    return String(raw);
  }

  private formatOpenRouterError(
    errorJson: unknown,
    defaultMessage: string,
  ): string {
    if (!errorJson) return defaultMessage;
    const jsonRecord =
      typeof errorJson === 'object' && errorJson !== null
        ? (errorJson as Record<string, unknown>)
        : undefined;
    const errorObj = jsonRecord ? (jsonRecord.error ?? jsonRecord) : errorJson;
    if (typeof errorObj === 'string' && errorObj.trim()) {
      return errorObj.trim();
    }

    const errorRecord =
      typeof errorObj === 'object' && errorObj !== null
        ? (errorObj as Record<string, unknown>)
        : undefined;

    const mainMessage =
      typeof errorRecord?.message === 'string'
        ? errorRecord.message.trim()
        : typeof jsonRecord?.message === 'string'
          ? jsonRecord.message.trim()
          : null;

    const metadata =
      typeof errorRecord?.metadata === 'object' && errorRecord.metadata !== null
        ? (errorRecord.metadata as Record<string, unknown>)
        : undefined;

    const providerName =
      typeof metadata?.provider_name === 'string'
        ? metadata.provider_name.trim()
        : null;
    const rawDetail = this.parseRawError(metadata?.raw);

    if (rawDetail) {
      return providerName
        ? `Provider error (${providerName}): ${rawDetail}`
        : `Provider error: ${rawDetail}`;
    }

    if (mainMessage) {
      if (mainMessage.toLowerCase().includes('provider returned error')) {
        return providerName
          ? `Provider error (${providerName}): Upstream provider failed to respond.`
          : 'Provider error: Upstream provider failed or is temporarily unavailable.';
      }
      return mainMessage;
    }

    return defaultMessage;
  }
}
