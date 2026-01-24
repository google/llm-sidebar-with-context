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

import { MAX_CONTEXT_LENGTH, CONTEXT_MESSAGES } from "../constants";
import { isRestrictedURL } from "../utils";
import { ITabService, TimeoutError } from "../services/tabService";

export class TabContext {
  constructor(
    public readonly tabId: number,
    public url: string,
    public title: string,
    private tabService: ITabService
  ) {}

  /**
   * Reads the text content of the tab.
   * @returns The content of the tab or an error message if inaccessible.
   */
  async readContent(): Promise<string> {
    if (isRestrictedURL(this.url)) {
      console.warn(`Cannot extract content from restricted URL: ${this.url}`);
      return `${CONTEXT_MESSAGES.RESTRICTED_URL}: ${this.url}`;
    }

    const tab = await this.tabService.getTab(this.tabId);

    if (!tab) {
      console.error(`Tab not found or accessible: ${this.tabId} (${this.url})`);
      return `${CONTEXT_MESSAGES.TAB_NOT_FOUND}: ${this.url}`;
    }

    if (tab.discarded) {
      return `${CONTEXT_MESSAGES.TAB_DISCARDED}: ${this.url}`;
    }

    const id = tab.id ?? this.tabId;
    let warningPrefix = "";

    // 3. Handle 'loading' state
    if (tab.status === "loading") {
      try {
        await this.tabService.waitForTabComplete(id, 2000);
      } catch (error) {
        if (error instanceof TimeoutError) {
           // Timeout occurred, proceed with best-effort extraction
           warningPrefix = `${CONTEXT_MESSAGES.LOADING_WARNING} `;
        } else {
           // Re-throw other errors
           throw error; 
        }
      }
    }

    try {
      const result = await this.tabService.executeScript(id, () => document.body.innerText);

      if (!result || result.trim().length === 0) {
        return CONTEXT_MESSAGES.NO_CONTENT_WARNING;
      }

      const truncated = result.substring(0, MAX_CONTEXT_LENGTH);
      return warningPrefix ? `${warningPrefix}${truncated}` : truncated;
    } catch (error: unknown) {
      console.error(`Failed to execute script for tab ${this.url}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `${CONTEXT_MESSAGES.ERROR_PREFIX} ${this.url}: ${errorMessage})`;
    }
  }
}
