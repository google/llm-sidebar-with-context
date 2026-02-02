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

import { StorageKeys, MAX_PINNED_TABS } from '../constants';
import { TabContext } from './TabContext';
import { isRestrictedURL } from '../utils';
import { TabInfo, ContentPart } from '../types';
import { ILocalStorageService } from '../services/storageService';
import { ITabService } from '../services/tabService';

export class ContextManager {
  private pinnedTabs: TabContext[] = [];

  constructor(
    private localStorageService: ILocalStorageService,
    private tabService: ITabService,
  ) {}

  async addTab(tab: TabContext): Promise<void> {
    if (!tab.url) {
      throw new Error('Cannot pin a tab with no URL.');
    }
    if (isRestrictedURL(tab.url)) {
      throw new Error('Cannot pin restricted Chrome pages.');
    }
    if (this.isTabPinned(tab.tabId)) {
      // Idempotent: If already pinned, do nothing.
      return;
    }
    if (this.pinnedTabs.length >= MAX_PINNED_TABS) {
      throw new Error(`You can only pin up to ${MAX_PINNED_TABS} tabs.`);
    }
    this.pinnedTabs.push(tab);
    await this.save();
  }

  async removeTab(tabId: number): Promise<void> {
    const initialLength = this.pinnedTabs.length;
    this.pinnedTabs = this.pinnedTabs.filter((t) => t.tabId !== tabId);
    if (this.pinnedTabs.length < initialLength) {
      await this.save();
    }
  }

  isTabPinned(tabId: number): boolean {
    return this.pinnedTabs.some((t) => t.tabId === tabId);
  }

  async updateTabMetadata(
    tabId: number,
    url: string,
    title: string,
  ): Promise<void> {
    const tab = this.pinnedTabs.find((t) => t.tabId === tabId);
    if (tab) {
      tab.url = url;
      tab.title = title;
      await this.save();
    }
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
  async getAllContent(): Promise<ContentPart[]> {
    const allParts: ContentPart[] = [];

    for (const tab of this.pinnedTabs) {
      const header = `\n\n--- Pinned Tab: ${tab.title} (${tab.url}) ---`;
      allParts.push({ type: 'text', text: header });
      allParts.push(await tab.readContent());
    }

    return allParts;
  }

  /**
   * Fetches content of the currently active tab.
   */
  async getActiveTabContent(): Promise<ContentPart[]> {
    const [activeTab] = await this.tabService.query({
      active: true,
      currentWindow: true,
    });

    if (activeTab && activeTab.url && activeTab.id !== undefined) {
      // De-duplication: If active tab is already pinned, don't re-extract.
      if (this.isTabPinned(activeTab.id)) {
        return [
          {
            type: 'text',
            text: `Current tab URL: ${activeTab.url}\n(Content included in pinned tabs)`,
          },
        ];
      }

      const tempContext = new TabContext(
        activeTab.id,
        activeTab.url,
        activeTab.title || '',
        this.tabService,
      );
      const header = `Current tab URL: ${activeTab.url}`;

      return [{ type: 'text', text: header }, await tempContext.readContent()];
    }
    return [];
  }

  async load(): Promise<void> {
    const stored = await this.localStorageService.get<TabInfo[]>(
      StorageKeys.PINNED_CONTEXTS,
    );
    if (Array.isArray(stored)) {
      const rehydratedTabs: TabContext[] = [];
      for (const s of stored) {
        if (s.id !== undefined) {
          // Verify the tab still exists (Strict Session Persistence)
          const tab = await this.tabService.getTab(s.id);
          if (tab) {
            // We update title/url to match current reality
            rehydratedTabs.push(
              new TabContext(
                s.id,
                tab.url || s.url,
                tab.title || s.title || 'Untitled',
                this.tabService,
              ),
            );
          }
        }
      }
      this.pinnedTabs = rehydratedTabs;
      // If we pruned any closed tabs, save the clean list
      if (this.pinnedTabs.length !== stored.length) {
        await this.save();
      }
    }
  }

  private async save(): Promise<void> {
    const infos: TabInfo[] = this.pinnedTabs.map((t) => ({
      id: t.tabId,
      title: t.title,
      url: t.url,
    }));
    await this.localStorageService.set(StorageKeys.PINNED_CONTEXTS, infos);
  }
}
