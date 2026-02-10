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

import { IContentStrategy } from './IContentStrategy';
import { ContentPart } from '../types';
import { ITabService, TimeoutError } from '../services/tabService';
import { CONTEXT_MESSAGES, MAX_CONTEXT_LENGTH } from '../constants';

export class GoogleDocsStrategy implements IContentStrategy {
  constructor(private tabService: ITabService) {}

  canHandle(url: string): boolean {
    const GOOGLE_DOCS_REGEX = /docs\.google\.com\/document/;
    return GOOGLE_DOCS_REGEX.test(url);
  }

  async getContent(tabId: number, url: string): Promise<ContentPart> {
    const tab = await this.tabService.getTab(tabId);

    if (!tab) {
      return {
        type: 'text',
        text: `${CONTEXT_MESSAGES.TAB_NOT_FOUND}: ${url}`,
      };
    }

    if (tab.discarded) {
      return {
        type: 'text',
        text: `${CONTEXT_MESSAGES.TAB_DISCARDED}: ${url}`,
      };
    }

    const id = tab.id ?? tabId;
    let warningPrefix = '';

    if (tab.status === 'loading') {
      try {
        await this.tabService.waitForTabComplete(id, 2000);
      } catch (error) {
        if (error instanceof TimeoutError) {
          warningPrefix = `${CONTEXT_MESSAGES.LOADING_WARNING} `;
        } else {
          throw error;
        }
      }
    }

    try {
      // Define the extraction function inline to ensure it serializes correctly
      // as a standalone function for executeScript.
      const extractContentFn = function (): {
        content: string | null;
        debug?: string;
      } {
        try {
          console.log(
            'Gemini: Starting Google Docs extraction via script tags...',
          );

          const scripts = Array.from(document.querySelectorAll('script'));
          const modelChunksScripts = scripts.filter((s) =>
            s.innerText.trim().startsWith('DOCS_modelChunk ='),
          );

          if (modelChunksScripts.length === 0) {
            console.warn('Gemini: No DOCS_modelChunk scripts found.');
            return {
              content: null,
              debug: 'No DOCS_modelChunk scripts found',
            };
          }

          console.log(
            `Gemini: Found ${modelChunksScripts.length} model chunks. Parsing...`,
          );

          type ChunkItem = {
            index: number;
            text: string;
          };

          const chunks: ChunkItem[] = [];

          modelChunksScripts.forEach((script, i) => {
            try {
              const text = script.innerText.trim();
              // Remove "DOCS_modelChunk =" prefix
              let jsonStr = text.substring('DOCS_modelChunk ='.length).trim();

              // Heuristic: The JSON object ends before the next DOCS_ variable assignment or function call.
              // We split by "; DOCS_" to handle the following statements (e.g. DOCS_warmStartDocumentLoader)
              const parts = jsonStr.split('; DOCS_');
              if (parts.length > 0) {
                jsonStr = parts[0];
              }

              // Remove potential trailing semicolon if the split didn't catch it
              if (jsonStr.endsWith(';')) {
                jsonStr = jsonStr.slice(0, -1);
              }

              const json = JSON.parse(jsonStr);
              if (json && json.chunk && Array.isArray(json.chunk)) {
                json.chunk.forEach(
                  (c: { ty?: string; s?: string; ibi?: number }) => {
                    if (c.s) {
                      chunks.push({
                        index: c.ibi ?? 0,
                        text: c.s,
                      });
                    }
                  },
                );
              }
            } catch (e) {
              console.warn(`Gemini: Failed to parse chunk ${i}`, e);
            }
          });

          if (chunks.length === 0) {
            console.warn('Gemini: Found scripts but failed to parse content.');
            return {
              content: null,
              debug: 'Found scripts but failed to parse content',
            };
          }

          // Sort chunks by index (ibi) to ensure correct order
          chunks.sort((a, b) => a.index - b.index);

          const fullText = chunks.map((c) => c.text).join('');
          console.log(`Gemini: Content extracted! Length: ${fullText.length}`);

          return { content: fullText };
        } catch (e) {
          console.error('Gemini: Extraction error', e);
          return { content: null, debug: `Extraction error: ${String(e)}` };
        }
      };

      const result = await this.tabService.executeScript(id, extractContentFn);

      if (!result || !result.content || result.content.trim().length === 0) {
        const debugMsg = result?.debug
          ? ` (Debug: ${result.debug})`
          : ' (No content found)';
        return {
          type: 'text',
          text: `${CONTEXT_MESSAGES.NO_CONTENT_WARNING}${debugMsg}`,
        };
      }

      const truncated = result.content.substring(0, MAX_CONTEXT_LENGTH);
      return {
        type: 'text',
        text: warningPrefix ? `${warningPrefix}${truncated}` : truncated,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('ExtensionsSettings policy')) {
        return {
          type: 'text',
          text: CONTEXT_MESSAGES.EXTENSION_POLICY_ERROR,
        };
      }

      console.error(`Failed to execute script for tab ${url}:`, error);
      return {
        type: 'text',
        text: `${CONTEXT_MESSAGES.ERROR_PREFIX} ${url}: ${errorMessage})`,
      };
    }
  }
}
