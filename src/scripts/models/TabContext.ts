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

import { CONTEXT_MESSAGES } from '../constants';
import { isRestrictedURL } from '../utils';
import { ITabService } from '../services/tabService';
import { ContentPart } from '../types';
import { IContentStrategy } from '../strategies/IContentStrategy';
import { YouTubeStrategy } from '../strategies/YouTubeStrategy';
import { GoogleDocsStrategy } from '../strategies/GoogleDocsStrategy';
import { DefaultWebPageStrategy } from '../strategies/DefaultWebPageStrategy';

export class TabContext {
  private strategies: IContentStrategy[];

  constructor(
    public readonly tabId: number,
    public url: string,
    public title: string,
    private tabService: ITabService,
  ) {
    this.strategies = [
      new YouTubeStrategy(),
      new GoogleDocsStrategy(this.tabService),
      new DefaultWebPageStrategy(this.tabService),
    ];
  }

  /**
   * Reads the content of the tab using the appropriate strategy.
   * @returns The content part (text or file data) or an error message as text.
   */
  async readContent(): Promise<ContentPart> {
    if (isRestrictedURL(this.url)) {
      console.warn(`Cannot extract content from restricted URL: ${this.url}`);
      return {
        type: 'text',
        text: `${CONTEXT_MESSAGES.RESTRICTED_URL}: ${this.url}`,
      };
    }

    const strategy = this.strategies.find((s) => s.canHandle(this.url));

    if (!strategy) {
      // Should not happen as DefaultWebPageStrategy handles everything
      return {
        type: 'text',
        text: `${CONTEXT_MESSAGES.ERROR_PREFIX} No strategy found for ${this.url}`,
      };
    }

    try {
      return await strategy.getContent(this.tabId, this.url);
    } catch (error: unknown) {
      console.error(`Failed to extract content for tab ${this.url}:`, error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        type: 'text',
        text: `${CONTEXT_MESSAGES.ERROR_PREFIX} ${this.url}: ${errorMessage})`,
      };
    }
  }
}
