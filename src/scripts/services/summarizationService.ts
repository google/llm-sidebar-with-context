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

interface GeminiSummarizationResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
  error?: { message: string };
}

/**
 * Uses a fast/cheap Gemini model to summarize tab content that exceeds
 * the per-tab context budget. This implements the "hierarchical
 * summarization" pattern from NEXUSSUM (ACL 2025) at the application
 * layer — compressing large documents into dense, information-preserving
 * summaries before they enter the main context window.
 */
export class GeminiSummarizationService implements ISummarizationService {
  private readonly model = 'gemini-2.5-flash-lite';

  constructor(private getApiKey: () => Promise<string | null>) {}

  async summarize(
    text: string,
    targetLength: number,
    signal?: AbortSignal,
  ): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('No API key available for summarization');
    }

    const prompt = `You are a context compression engine. Summarize the following web page content into approximately ${targetLength} characters. Preserve all key facts, data points, names, dates, code snippets, and arguments. Do NOT add commentary. Output only the summary.\n\n---\n${text.substring(0, 200000)}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
        signal,
      },
    );

    const data: GeminiSummarizationResponse = await response.json();

    if (data.candidates && data.candidates.length > 0) {
      return data.candidates[0].content.parts[0].text;
    }
    if (data.error) {
      throw new Error(`Summarization failed: ${data.error.message}`);
    }
    throw new Error('Summarization returned no content');
  }
}

/**
 * A no-op summarization service that simply truncates.
 * Used as a fallback when no API key is available.
 */
export class TruncationSummarizationService implements ISummarizationService {
  async summarize(
    text: string,
    targetLength: number,
    _signal?: AbortSignal,
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
