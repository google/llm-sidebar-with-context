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

import { ChatMessage, LLMResponse, ContentPart } from '../../types';
import { isAbortError } from '../../utils';
import { ILLMService } from '../llmService';

interface OpenAIApiResponse {
  choices?: Array<{
    message: { role: string; content: string };
  }>;
  error?: { message: string; type: string };
}

export class OpenAILLMService implements ILLMService {
  async generateContent(
    apiKey: string,
    context: ContentPart[],
    history: ChatMessage[],
    model: string = 'gpt-4o',
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    try {
      if (!apiKey) {
        return { error: 'API key is required' };
      }
      if (history.length === 0) {
        return { error: 'Chat history cannot be empty' };
      }

      const messages = history.map((msg) => ({
        role: (msg.role === 'model' ? 'assistant' : 'user') as
          | 'user'
          | 'assistant',
        content: msg.text,
      }));

      // Inject context into the last user message
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'user' && context.length > 0) {
        const contextText = context
          .filter((p) => p.type === 'text')
          .map((p) => (p as { type: 'text'; text: string }).text)
          .join('\n\n');
        if (contextText) {
          lastMsg.content = `${contextText}\n\n${lastMsg.content}`;
        }
      }

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
          }),
          signal,
        },
      );

      const data: OpenAIApiResponse = await response.json();

      if (data.choices && data.choices.length > 0) {
        return { reply: data.choices[0].message.content };
      } else if (data.error) {
        return { error: data.error.message };
      } else {
        return { error: 'Unknown error from OpenAI API.' };
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
