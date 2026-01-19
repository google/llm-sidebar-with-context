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

import { MAX_CONTEXT_LENGTH } from "../constants";
import { isRestrictedURL } from "../utils";

export class TabContext {
  constructor(
    public readonly url: string,
    public readonly title: string
  ) {}

  /**
   * Reads the text content of the tab.
   * @returns The content of the tab or an error message if inaccessible.
   */
  async readContent(): Promise<string> {
    if (isRestrictedURL(this.url)) {
      console.warn(`Cannot extract content from restricted URL: ${this.url}`);
      return `(Content not accessible for restricted URL: ${this.url})`;
    }

    // Always query for the tab ID by URL to ensure freshness.
    const tabs = await chrome.tabs.query({
      url: this.url,
      status: "complete",
    });

    if (tabs.length === 0) {
      console.error(`Tab not found or accessible: ${this.url}`);
      return `(Tab not found or accessible: ${this.url})`;
    }

    const id = tabs[0].id ?? null;

    if (id === null) {
      console.error(`Tab ID not found for: ${this.url}`);
      return `(Tab ID not found for: ${this.url})`;
    }

    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: id },
        func: () => document.body.innerText,
      });
      return result.result ? result.result.substring(0, MAX_CONTEXT_LENGTH) : "";
    } catch (error: any) {
      console.error(`Failed to execute script for tab ${this.url}:`, error);
      return `(Could not extract content from ${this.url}: ${error.message})`;
    }
  }
}
