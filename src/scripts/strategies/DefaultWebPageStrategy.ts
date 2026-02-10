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
import { MAX_CONTEXT_LENGTH, CONTEXT_MESSAGES } from '../constants';

export class DefaultWebPageStrategy implements IContentStrategy {
  constructor(private tabService: ITabService) {}

  canHandle(_url: string): boolean {
    return true; // Catch-all strategy
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
      const result = await this.tabService.executeScript(
        id,
        () => document.body.innerText,
      );

      if (!result || result.trim().length === 0) {
        return { type: 'text', text: CONTEXT_MESSAGES.NO_CONTENT_WARNING };
      }

      const truncated = result.substring(0, MAX_CONTEXT_LENGTH);
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
          text: CONTEXT_MESSAGES.RESTRICTED_URL,
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
