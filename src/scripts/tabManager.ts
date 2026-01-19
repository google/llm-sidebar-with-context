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

import { MAX_CONTEXT_LENGTH } from "./constants";
import { isRestrictedURL } from "./utils";

/**
 * Gets the content of a tab.
 * @param contextTabUrl - The URL of the tab to get content from.
 * @param contextTabId - The optional ID of the tab. If not provided, it will be queried.
 * @returns The content of the tab.
 */
export async function getTabContent(
  contextTabUrl: string,
  contextTabId: number | null = null
): Promise<string> {
  if (isRestrictedURL(contextTabUrl)) {
    console.warn(
      `Cannot extract content from restricted URL: ${contextTabUrl}`
    );
    return `(Content not accessible for restricted URL: ${contextTabUrl})`;
  }

  // If no tab ID is provided, query for it.
  let tabId = contextTabId;
  if (!tabId) {
    const tabs = await chrome.tabs.query({
      url: contextTabUrl,
      status: "complete",
    });

    if (tabs.length === 0) {
      console.error(`Tab not found or accessible: ${contextTabUrl}`);
      return `(Tab not found or accessible: ${contextTabUrl})`;
    }

    tabId = tabs[0].id ?? null;
  }

  if (tabId === null) {
    console.error(`Tab ID not found for: ${contextTabUrl}`);
    return `(Tab ID not found for: ${contextTabUrl})`;
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => document.body.innerText,
    });
    return result.result ? result.result.substring(0, MAX_CONTEXT_LENGTH) : "";
  } catch (error: any) {
    console.error(`Failed to execute script for tab ${contextTabUrl}:`, error);
    return `(Could not extract content from ${contextTabUrl}: ${error.message})`;
  }
}
