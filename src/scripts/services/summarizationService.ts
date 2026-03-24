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

import { ISummarizationService } from '../models/ContextBudgetManager';
import { ILLMService } from './llmService';
import { GeminiService } from './geminiService';

/**
 * Provider-agnostic summarization service that works with any ILLMService.
 * Replaces the Gemini-specific GeminiSummarizationService.
 */
export class LLMSummarizationService implements ISummarizationService {
  constructor(
    private llmService: ILLMService,
    private getApiKey: () => Promise<string | null>,
    private model?: string,
  ) {}

  async summarize(
    text: string,
    targetLength: number,
    signal?: AbortSignal,
    query?: string,
  ): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('No API key available for summarization');
    }

    const prompt = `You are a context compression engine. Summarize the following web page content into approximately ${targetLength} characters. Preserve all key facts, data points, names, dates, code snippets, and arguments. Prioritize details relevant to the user request when one is provided, but keep globally important facts even if they are not mentioned in the request. Do NOT add commentary. Output only the summary.\n\nUser request: ${query || 'No specific request provided.'}\n\n---\n${text.substring(0, 200000)}`;

    const response = await this.llmService.generateContent(
      apiKey,
      [],
      [{ role: 'user', text: prompt }],
      this.model,
      signal,
    );

    if (response.reply) {
      return response.reply;
    }
    if (response.error) {
      throw new Error(`Summarization failed: ${response.error}`);
    }
    throw new Error('Summarization returned no content');
  }
}

/** @deprecated Use LLMSummarizationService instead */
export class GeminiSummarizationService extends LLMSummarizationService {
  constructor(getApiKey: () => Promise<string | null>) {
    super(new GeminiService(), getApiKey, 'gemini-2.5-flash-lite');
  }
}

/**
 * A no-op summarization service that simply truncates.
 * Used as a fallback when no API key or LLM is available.
 */
export class TruncationSummarizationService implements ISummarizationService {
  async summarize(
    text: string,
    targetLength: number,
    _signal?: AbortSignal,
    _query?: string,
  ): Promise<string> {
    if (text.length <= targetLength) return text;
    // Truncate at a sentence boundary if possible.
    const truncated = text.substring(0, targetLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf('.\n'),
    );
    if (lastSentenceEnd > targetLength * 0.7) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }
    return truncated + '…';
  }
}
