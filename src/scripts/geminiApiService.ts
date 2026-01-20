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

import { ChatMessage, GeminiResponse } from "./types";

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

/**
 * Calls the Gemini API with the given context and message history.
 * @param apiKey - The Gemini API key.
 * @param context - The context to send to the API.
 * @param history - The conversation history, including the latest user message.
 * @param model - The model to use.
 * @returns The API response.
 */
export async function callGeminiApi(
  apiKey: string,
  context: string,
  history: ChatMessage[],
  model: string = "gemini-2.5-flash"
): Promise<GeminiResponse> {
  try {
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