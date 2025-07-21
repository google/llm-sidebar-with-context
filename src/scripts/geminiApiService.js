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

/**
 * Calls the Gemini API with the given context and message.
 * @param {string} apiKey - The Gemini API key.
 * @param {string} context - The context to send to the API.
 * @param {string} message - The user's message.
 * @returns {Promise<object>} - The API response.
 */
export async function callGeminiApi(apiKey, context, message, model = 'gemini-2.5-flash') {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Context: ${context}\nUser: ${message}`,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (data.candidates && data.candidates.length > 0) {
      return { reply: data.candidates[0].content.parts[0].text };
    } else if (data.error) {
      return { error: data.error.message };
    } else {
      return { error: "Unknown error from Gemini API." };
    }
  } catch (error) {
    return { error: error.message };
  }
}
