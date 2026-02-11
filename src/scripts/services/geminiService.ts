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

import { ChatMessage, GeminiResponse, ContentPart } from '../types';
import { isAbortError } from '../utils';

interface GeminiApiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
  error?: {
    message: string;
  };
}

export interface IGeminiService {
  generateContent(
    apiKey: string,
    context: ContentPart[],
    history: ChatMessage[],
    model?: string,
    signal?: AbortSignal,
  ): Promise<GeminiResponse>;
}

export class GeminiService implements IGeminiService {
  async generateContent(
    apiKey: string,
    context: ContentPart[],
    history: ChatMessage[],
    model: string = 'gemini-2.5-flash-lite',
    signal?: AbortSignal,
  ): Promise<GeminiResponse> {
    try {
      if (!apiKey) {
        return { error: 'API key is required' };
      }
      if (history.length === 0) {
        return { error: 'Chat history cannot be empty' };
      }
      if (history[history.length - 1].role !== 'user') {
        return { error: 'The last message must be from the user' };
      }

      // Map history to Gemini API format
      // Type is explicit: array of objects with role and parts array
      const contents: {
        role: string;
        parts: (
          | { text: string }
          | { file_data: { mime_type: string; file_uri: string } }
        )[];
      }[] = history.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      }));

      // Inject context parts into the last user message
      if (contents.length > 0) {
        const lastMessage = contents[contents.length - 1];
        if (lastMessage.role === 'user' && context.length > 0) {
          // Map ContentPart[] to Gemini API Part format
          const contextParts = context.map((part) => {
            if (part.type === 'text') {
              return { text: part.text };
            } else {
              return {
                file_data: {
                  mime_type: part.mimeType,
                  file_uri: part.fileUri,
                },
              };
            }
          });

          // Prepend context parts to the existing message parts
          lastMessage.parts = [...contextParts, ...lastMessage.parts];
        }
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: contents,
          }),
          signal: signal,
        },
      );

      const data: GeminiApiResponse = await response.json();

      if (data.candidates && data.candidates.length > 0) {
        return { reply: data.candidates[0].content.parts[0].text };
      } else if (data.error) {
        return { error: data.error.message };
      } else {
        return { error: 'Unknown error from Gemini API.' };
      }
    } catch (error: unknown) {
      if (isAbortError(error)) {
        return { aborted: true };
      }
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }
}
