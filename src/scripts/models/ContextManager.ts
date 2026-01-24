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

import { StorageKeys } from "../constants";
import { TabContext } from "./TabContext";
import { isRestrictedURL } from "../utils";
import { TabInfo } from "../types";
import { ILocalStorageService } from "../services/storageService";
import { ITabService } from "../services/tabService";

export class ContextManager {
  private pinnedTabs: TabContext[] = [];

  constructor(
    private localStorageService: ILocalStorageService,
    private tabService: ITabService
  ) {}

  async addTab(tab: TabContext): Promise<void> {
    if (!tab.url) {
      throw new Error("Cannot pin a tab with no URL.");
    }
    if (isRestrictedURL(tab.url)) {
      throw new Error("Cannot pin restricted Chrome pages.");
    }
    if (this.isTabPinned(tab.url)) {
      // Idempotent: If already pinned, do nothing.
      return;
    }
    this.pinnedTabs.push(tab);
    await this.save();
  }

  async removeTab(url: string): Promise<void> {
    const initialLength = this.pinnedTabs.length;
    this.pinnedTabs = this.pinnedTabs.filter((t) => t.url !== url);
    if (this.pinnedTabs.length < initialLength) {
        await this.save();
    }
  }

  isTabPinned(url: string): boolean {
    return this.pinnedTabs.some((t) => t.url === url);
  }

  getPinnedTabs(): TabContext[] {
    return [...this.pinnedTabs];
  }

  async clear(): Promise<void> {
    this.pinnedTabs = [];
    await this.save();
  }

  /**
   * Fetches the combined content of all pinned tabs.
   */
  async getAllContent(): Promise<string> {
    const contents = await Promise.all(
      this.pinnedTabs.map(async (tab) => {
        const content = await tab.readContent();
        return `\n\n--- Pinned Tab: ${tab.title} (${tab.url}) ---\n${content}`;
      })
    );
    return contents.join("");
  }
  
  /**
   * Fetches content of the currently active tab.
   */
  async getActiveTabContent(): Promise<string> {
      const [activeTab] = await this.tabService.query({
          active: true,
          currentWindow: true,
      });
  
      if (activeTab && activeTab.url) {
          const tempContext = new TabContext(activeTab.url, activeTab.title || "", this.tabService);
          const content = await tempContext.readContent();
          return `Current tab URL: ${activeTab.url}\nContent: ${content}`;
      }
      return "";
  }

  async load(): Promise<void> {
    const stored = await this.localStorageService.get<TabInfo[]>(StorageKeys.PINNED_CONTEXTS);
    if (Array.isArray(stored)) {
      this.pinnedTabs = stored.map(
        (s: TabInfo) => new TabContext(s.url, s.title, this.tabService)
      );
    }
  }

  private async save(): Promise<void> {
    await this.localStorageService.set(StorageKeys.PINNED_CONTEXTS, this.pinnedTabs);
  }
}
