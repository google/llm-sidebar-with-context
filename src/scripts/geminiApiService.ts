/**
 * Copyright 2025 Google LLC
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

interface GeminiResponse {
  reply?: string;
  error?: string;
}

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
 * Calls the Gemini API with the given context and message.
 * @param apiKey - The Gemini API key.
 * @param context - The context to send to the API.
 * @param message - The user's message.
 * @param model - The model to use.
 * @returns The API response.
 */
export async function callGeminiApi(
  apiKey: string,
  context: string,
  message: string,
  model: string = "gemini-2.5-flash"
): Promise<GeminiResponse> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: "Context: " + context },
                { text: "User: " + message },
              ],
            },
          ],
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
  } catch (error: any) {
    return { error: error.message };
  }
}
