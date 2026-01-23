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

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Interface for tab and scripting operations.
 */
export interface ITabService {
  /**
   * Queries for tabs based on criteria.
   */
  query(queryInfo: chrome.tabs.QueryInfo): Promise<ChromeTab[]>;

  /**
   * Executes a script in a tab.
   */
  executeScript<T>(tabId: number, func: () => T): Promise<T | null>;

  /**
   * Creates a new tab.
   */
  create(createProperties: chrome.tabs.CreateProperties): Promise<ChromeTab>;

  /**
   * Waits for a tab to reach the 'complete' status.
   * @param tabId The ID of the tab to wait for.
   * @param timeoutMs Optional timeout in milliseconds.
   * @throws TimeoutError if the timeout is reached.
   */
  waitForTabComplete(tabId: number, timeoutMs?: number): Promise<void>;
}

/**
 * Represents a browser tab, decoupled from the chrome namespace.
 */
export interface ChromeTab {
  id?: number;
  url?: string;
  title?: string;
  status?: string;
  active: boolean;
  windowId: number;
}

/**
 * Concrete implementation of ITabService using chrome.tabs and chrome.scripting.
 */
export class ChromeTabService implements ITabService {
  async query(queryInfo: chrome.tabs.QueryInfo): Promise<ChromeTab[]> {
    const tabs = await chrome.tabs.query(queryInfo);
    return tabs.map(this.mapTab);
  }

  async executeScript<T>(tabId: number, func: () => T): Promise<T | null> {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func,
    });
    return (result.result as T) ?? null;
  }

  async create(createProperties: chrome.tabs.CreateProperties): Promise<ChromeTab> {
    const tab = await chrome.tabs.create(createProperties);
    return this.mapTab(tab);
  }

  async waitForTabComplete(tabId: number, timeoutMs = 10000): Promise<void> {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new TimeoutError(`Timed out waiting for tab ${tabId} to complete`));
      }, timeoutMs);

      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.OnUpdatedInfo
      ) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  private mapTab(tab: chrome.tabs.Tab): ChromeTab {
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      status: tab.status,
      active: tab.active,
      windowId: tab.windowId,
    };
  }
}