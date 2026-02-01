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

import { ChatMessage, GeminiResponse } from "../types";

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
    context: string,
    history: ChatMessage[],
    model?: string
  ): Promise<GeminiResponse>;
}

export class GeminiService implements IGeminiService {
  async generateContent(
    apiKey: string,
    context: string,
    history: ChatMessage[],
    model: string = "gemini-2.5-flash-lite"
  ): Promise<GeminiResponse> {
    try {
      if (!apiKey) {
        return { error: "API key is required" };
      }
      if (history.length === 0) {
        return { error: "Chat history cannot be empty" };
      }
      if (history[history.length - 1].role !== "user") {
        return { error: "The last message must be from the user" };
      }

      // Map history to Gemini API format
      const contents = history.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      }));

      // Inject context as the first part of the last user message
      if (contents.length > 0) {
        const lastMessage = contents[contents.length - 1];
        if (lastMessage.role === "user") {
          lastMessage.parts.unshift({ text: "Context: " + context });
        }
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: contents,
          }),
        }
      );

      const data: GeminiApiResponse = await response.json();

      if (data.candidates && data.candidates.length > 0) {
        return { reply: data.candidates[0].content.parts[0].text };
      } else if (data.error) {
        return { error: data.error.message };
      } else {
        return { error: "Unknown error from Gemini API." };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }
}
