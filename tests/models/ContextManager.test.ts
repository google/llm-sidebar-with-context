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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextManager } from '../../src/scripts/models/ContextManager';
import { TabContext } from '../../src/scripts/models/TabContext';
import { ILocalStorageService } from '../../src/scripts/services/storageService';
import { ITabService, ChromeTab } from '../../src/scripts/services/tabService';
import {
  StorageKeys,
  CONTEXT_MESSAGES,
  MAX_AUTO_PINNED_TABS,
} from '../../src/scripts/constants';

describe('ContextManager', () => {
  let contextManager: ContextManager;
  let mockLocalStorageService: ILocalStorageService;
  let mockTabService: ITabService;

  beforeEach(() => {
    mockLocalStorageService = {
      get: vi.fn(),
      set: vi.fn(),
    };

    mockTabService = {
      query: vi.fn(),
      executeScript: vi.fn(),
      executeScriptFile: vi.fn(),
      create: vi.fn(),
      waitForTabComplete: vi.fn(),
      getTab: vi.fn(),
    } as unknown as ITabService;

    contextManager = new ContextManager(
      mockLocalStorageService,
      mockTabService,
    );
  });

  describe('addTab', () => {
    it('should add a valid tab and save', async () => {
      const tabId = 1;
      const tab = new TabContext(
        tabId,
        'https://example.com',
        'Example',
        mockTabService,
      );

      await contextManager.addTab(tab);

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(contextManager.getPinnedTabs()[0].tabId).toBe(tabId);
      // Verify saved data includes ID
      expect(mockLocalStorageService.set).toHaveBeenCalledWith(
        StorageKeys.PINNED_CONTEXTS,
        expect.arrayContaining([expect.objectContaining({ id: tabId })]),
      );
    });

    it('should throw error for restricted URLs', async () => {
      const tab = new TabContext(
        1,
        'chrome://settings',
        'Settings',
        mockTabService,
      );

      await expect(contextManager.addTab(tab)).rejects.toThrow(
        'Cannot pin restricted Chrome pages.',
      );
      expect(contextManager.getPinnedTabs()).toHaveLength(0);
      expect(mockLocalStorageService.set).not.toHaveBeenCalled();
    });

    it('should be idempotent (ignore duplicates by ID)', async () => {
      const tab = new TabContext(
        1,
        'https://example.com',
        'Example',
        mockTabService,
      );

      await contextManager.addTab(tab);
      await contextManager.addTab(tab); // Add again

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(mockLocalStorageService.set).toHaveBeenCalledTimes(1);
    });

    it('should allow duplicate URLs if IDs are different', async () => {
      const tab1 = new TabContext(
        1,
        'https://example.com',
        'Example 1',
        mockTabService,
      );
      const tab2 = new TabContext(
        2,
        'https://example.com',
        'Example 2',
        mockTabService,
      );

      await contextManager.addTab(tab1);
      await contextManager.addTab(tab2);

      expect(contextManager.getPinnedTabs()).toHaveLength(2);
      expect(contextManager.getPinnedTabs()[0].tabId).toBe(1);
      expect(contextManager.getPinnedTabs()[1].tabId).toBe(2);
      expect(mockLocalStorageService.set).toHaveBeenCalledTimes(2);
    });

    it('should not remove both tabs when removing one of two tabs with the same URL', async () => {
      const tab1 = new TabContext(
        1,
        'https://example.com',
        'Example 1',
        mockTabService,
      );
      const tab2 = new TabContext(
        2,
        'https://example.com',
        'Example 2',
        mockTabService,
      );

      await contextManager.addTab(tab1);
      await contextManager.addTab(tab2);

      await contextManager.removeTab(1);

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(contextManager.getPinnedTabs()[0].tabId).toBe(2);
      expect(contextManager.getPinnedTabs()[0].url).toBe('https://example.com');
    });

    it('should update tab metadata correctly', async () => {
      const tab = new TabContext(
        1,
        'https://old.com',
        'Old Title',
        mockTabService,
      );
      await contextManager.addTab(tab);

      await contextManager.updateTabMetadata(1, 'https://new.com', 'New Title');

      expect(contextManager.getPinnedTabs()[0].url).toBe('https://new.com');
      expect(contextManager.getPinnedTabs()[0].title).toBe('New Title');
      expect(mockLocalStorageService.set).toHaveBeenCalledTimes(2);
    });

    it('should throw error when pinning a tab with an empty URL', async () => {
      const tab = new TabContext(1, '', 'No URL', mockTabService);
      await expect(contextManager.addTab(tab)).rejects.toThrow(
        'Cannot pin a tab with no URL.',
      );
      expect(contextManager.getPinnedTabs()).toHaveLength(0);
    });

    it('should allow pinning more than 6 tabs (no hard limit)', async () => {
      // Pin 10 tabs — the old limit was 6, now unlimited
      for (let i = 0; i < 10; i++) {
        const tab = new TabContext(
          i + 1,
          `https://example${i}.com`,
          `Title ${i}`,
          mockTabService,
        );
        await contextManager.addTab(tab);
      }

      expect(contextManager.getPinnedTabs()).toHaveLength(10);
    });

    it('should allow pinning 20+ tabs without error', async () => {
      for (let i = 0; i < 25; i++) {
        const tab = new TabContext(
          i + 1,
          `https://site${i}.com`,
          `Site ${i}`,
          mockTabService,
        );
        await contextManager.addTab(tab);
      }

      expect(contextManager.getPinnedTabs()).toHaveLength(25);
      expect(mockLocalStorageService.set).toHaveBeenCalledTimes(25);
    });

    it('should handle simultaneous addTab calls correctly (Concurrency)', async () => {
      // Pin 5 tabs
      for (let i = 0; i < 5; i++) {
        const tab = new TabContext(
          i + 1,
          `https://example${i}.com`,
          `Title ${i}`,
          mockTabService,
        );
        await contextManager.addTab(tab);
      }

      // Try to add two tabs simultaneously — both should succeed now
      const tabA = new TabContext(100, 'https://a.com', 'A', mockTabService);
      const tabB = new TabContext(101, 'https://b.com', 'B', mockTabService);

      const results = await Promise.allSettled([
        contextManager.addTab(tabA),
        contextManager.addTab(tabB),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(2);
      expect(contextManager.getPinnedTabs()).toHaveLength(7);
    });

    it('should be idempotent even with many tabs pinned', async () => {
      // Pin 10 tabs
      for (let i = 0; i < 10; i++) {
        const tab = new TabContext(
          i + 1,
          `https://example${i}.com`,
          `Title ${i}`,
          mockTabService,
        );
        await contextManager.addTab(tab);
      }

      // Try to pin one of the already pinned tabs
      const existingTab = new TabContext(
        1,
        'https://example0.com',
        'Title 0',
        mockTabService,
      );
      await expect(contextManager.addTab(existingTab)).resolves.not.toThrow();
      expect(contextManager.getPinnedTabs()).toHaveLength(10);
    });
  });

  describe('removeTab', () => {
    it('should remove a tab by ID and save', async () => {
      const tab1 = new TabContext(1, 'https://a.com', 'A', mockTabService);
      const tab2 = new TabContext(2, 'https://b.com', 'B', mockTabService);

      await contextManager.addTab(tab1);
      await contextManager.addTab(tab2);

      vi.mocked(mockLocalStorageService.set).mockClear();

      await contextManager.removeTab(1);

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(contextManager.getPinnedTabs()[0].tabId).toBe(2);
      expect(mockLocalStorageService.set).toHaveBeenCalledTimes(1);
    });

    it('should do nothing if ID not found', async () => {
      const tab = new TabContext(
        1,
        'https://example.com',
        'Example',
        mockTabService,
      );
      await contextManager.addTab(tab);
      vi.mocked(mockLocalStorageService.set).mockClear();

      await contextManager.removeTab(999);

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(mockLocalStorageService.set).not.toHaveBeenCalled();
    });
  });

  describe('getAllContent', () => {
    it('should concatenate content from all pinned tabs', async () => {
      const tab1 = new TabContext(1, 'https://a.com', 'A', mockTabService);
      const tab2 = new TabContext(2, 'https://b.com', 'B', mockTabService);

      vi.spyOn(tab1, 'readContent').mockResolvedValue({
        type: 'text',
        text: 'Content A',
      });
      vi.spyOn(tab2, 'readContent').mockResolvedValue({
        type: 'text',
        text: 'Content B',
      });

      await contextManager.addTab(tab1);
      await contextManager.addTab(tab2);

      const content = await contextManager.getAllContent();

      expect(content).toEqual(
        expect.arrayContaining([
          {
            type: 'text',
            text: expect.stringContaining('--- Pinned Tab: A (https://a.com)'),
          },
          { type: 'text', text: 'Content A' },
          {
            type: 'text',
            text: expect.stringContaining('--- Pinned Tab: B (https://b.com)'),
          },
          { type: 'text', text: 'Content B' },
        ]),
      );

      expect(tab1.readContent).toHaveBeenCalled();
      expect(tab2.readContent).toHaveBeenCalled();
    });

    it('should handle partial failure (one tab fails to read)', async () => {
      const tab1 = new TabContext(
        1,
        'https://good.com',
        'Good',
        mockTabService,
      );
      const tab2 = new TabContext(2, 'https://bad.com', 'Bad', mockTabService);

      vi.spyOn(tab1, 'readContent').mockResolvedValue({
        type: 'text',
        text: 'Good Content',
      });
      vi.spyOn(tab2, 'readContent').mockResolvedValue({
        type: 'text',
        text: CONTEXT_MESSAGES.TAB_NOT_FOUND,
      });

      await contextManager.addTab(tab1);
      await contextManager.addTab(tab2);

      const content = await contextManager.getAllContent();

      expect(content).toEqual(
        expect.arrayContaining([
          { type: 'text', text: 'Good Content' },
          { type: 'text', text: CONTEXT_MESSAGES.TAB_NOT_FOUND },
        ]),
      );
    });

    it('should handle many tabs within budget as full content', async () => {
      const tabs: TabContext[] = [];
      for (let i = 0; i < 15; i++) {
        const tab = new TabContext(
          i + 1,
          `https://site${i}.com`,
          `Site ${i}`,
          mockTabService,
        );
        vi.spyOn(tab, 'readContent').mockResolvedValue({
          type: 'text',
          text: `Short content ${i}`,
        });
        tabs.push(tab);
        await contextManager.addTab(tab);
      }

      const content = await contextManager.getAllContent();

      // All tabs should be included (15 tabs × ~15 chars each = well within budget)
      const headers = content.filter(
        (p) => p.type === 'text' && p.text.includes('--- Pinned Tab:'),
      );
      expect(headers).toHaveLength(15);
    });
  });

  describe('getActiveTabContent', () => {
    it('should fetch content for the active tab using ID', async () => {
      const activeTab = {
        id: 99,
        url: 'https://active.com',
        title: 'Active',
        status: 'complete',
      } as ChromeTab;

      vi.mocked(mockTabService.query).mockResolvedValueOnce([activeTab]);
      // Mock getTab for the internally created TabContext's readContent
      vi.mocked(mockTabService.getTab).mockResolvedValue(activeTab);
      vi.mocked(mockTabService.executeScript).mockResolvedValue(
        'Active Content',
      );

      const content = await contextManager.getActiveTabContent();

      expect(content).toEqual(
        expect.arrayContaining([
          {
            type: 'text',
            text: expect.stringContaining(
              'Current tab URL: https://active.com',
            ),
          },
          { type: 'text', text: 'Active Content' },
        ]),
      );

      // Verify we passed the ID to getTab
      expect(mockTabService.getTab).toHaveBeenCalledWith(99);
    });

    it('should return empty array if no active tab found', async () => {
      vi.mocked(mockTabService.query).mockResolvedValue([]);
      const content = await contextManager.getActiveTabContent();
      expect(content).toEqual([]);
    });

    it('should return warning message if active tab is restricted', async () => {
      const restrictedTab = {
        id: 99,
        url: 'chrome://settings',
        title: 'Settings',
      } as ChromeTab;

      vi.mocked(mockTabService.query).mockResolvedValueOnce([restrictedTab]);

      const content = await contextManager.getActiveTabContent();

      expect(content).toEqual(
        expect.arrayContaining([
          {
            type: 'text',
            text: expect.stringContaining('Current tab URL: chrome://settings'),
          },
          {
            type: 'text',
            text: expect.stringContaining(CONTEXT_MESSAGES.RESTRICTED_URL),
          },
        ]),
      );
    });

    it("should not extract active tab content if it's already pinned", async () => {
      const tabId = 123;
      const activeTab = {
        id: tabId,
        url: 'https://pinned.com',
        title: 'Pinned',
        status: 'complete',
      } as ChromeTab;

      vi.mocked(mockTabService.query).mockResolvedValueOnce([activeTab]);

      // Pin the tab
      const pinnedTab = new TabContext(
        tabId,
        activeTab.url!,
        activeTab.title!,
        mockTabService,
      );
      await contextManager.addTab(pinnedTab);

      vi.mocked(mockTabService.executeScript).mockClear();

      const content = await contextManager.getActiveTabContent();

      expect(content).toEqual([
        {
          type: 'text',
          text: expect.stringContaining(`Current tab URL: ${activeTab.url}`),
        },
      ]);
      expect(
        content[0].type === 'text' && (content[0] as { text: string }).text,
      ).toContain('(Content included in pinned tabs)');
      expect(mockTabService.executeScript).not.toHaveBeenCalled();
    });

    it('should handle YouTube context in getAllContent', async () => {
      const url = 'https://www.youtube.com/watch?v=123';
      const tab = new TabContext(1, url, 'Video', mockTabService);
      await contextManager.addTab(tab);

      const content = await contextManager.getAllContent();

      expect(content).toEqual([
        {
          type: 'text',
          text: expect.stringContaining(
            '--- Pinned Tab: Video (https://www.youtube.com/watch?v=123)',
          ),
        },
        { type: 'file_data', mimeType: 'video/mp4', fileUri: url },
      ]);
    });

    it('should handle mixed contexts in getAllContent', async () => {
      const tab1 = new TabContext(
        1,
        'https://example.com',
        'Text Site',
        mockTabService,
      );
      const tab2 = new TabContext(
        2,
        'https://www.youtube.com/watch?v=123',
        'Video Site',
        mockTabService,
      );

      vi.spyOn(tab1, 'readContent').mockResolvedValue({
        type: 'text',
        text: 'Text Content',
      });
      // tab2 will use YouTubeStrategy automatically

      await contextManager.addTab(tab1);
      await contextManager.addTab(tab2);

      const content = await contextManager.getAllContent();

      expect(content).toEqual([
        {
          type: 'text',
          text: expect.stringContaining('--- Pinned Tab: Text Site'),
        },
        { type: 'text', text: 'Text Content' },
        {
          type: 'text',
          text: expect.stringContaining('--- Pinned Tab: Video Site'),
        },
        {
          type: 'file_data',
          mimeType: 'video/mp4',
          fileUri: 'https://www.youtube.com/watch?v=123',
        },
      ]);
    });

    it('should handle YouTube active tab in getActiveTabContent', async () => {
      const url = 'https://www.youtube.com/watch?v=active';
      const activeTab = { id: 99, url, title: 'Active Video' } as ChromeTab;
      vi.mocked(mockTabService.query).mockResolvedValueOnce([activeTab]);
      vi.mocked(mockTabService.getTab).mockResolvedValue(activeTab);

      const content = await contextManager.getActiveTabContent();

      expect(content).toEqual([
        {
          type: 'text',
          text: expect.stringContaining(`Current tab URL: ${url}`),
        },
        { type: 'file_data', mimeType: 'video/mp4', fileUri: url },
      ]);
    });
  });

  describe('load (Rehydration)', () => {
    it('should rehydrate pinned tabs if ID is still valid', async () => {
      const storedData = [
        { id: 101, url: 'https://saved.com', title: 'Saved' },
      ];
      vi.mocked(mockLocalStorageService.get).mockResolvedValue(storedData);

      // Mock tab service finding the tab
      vi.mocked(mockTabService.getTab).mockResolvedValue({
        id: 101,
        url: 'https://saved.com',
        title: 'Saved',
        status: 'complete',
        active: false,
        windowId: 1,
        discarded: false,
      });

      await contextManager.load();

      const pinned = contextManager.getPinnedTabs();
      expect(pinned).toHaveLength(1);
      expect(pinned[0].tabId).toBe(101);
    });

    it('should drop tabs if ID is no longer valid (Strict Session Persistence)', async () => {
      const storedData = [
        { id: 101, url: 'https://saved.com', title: 'Saved' },
      ];
      vi.mocked(mockLocalStorageService.get).mockResolvedValue(storedData);

      // Mock tab service NOT finding the tab (undefined)
      vi.mocked(mockTabService.getTab).mockResolvedValue(undefined);

      await contextManager.load();

      const pinned = contextManager.getPinnedTabs();
      expect(pinned).toHaveLength(0);

      // Should also save the cleaned list
      expect(mockLocalStorageService.set).toHaveBeenCalledWith(
        StorageKeys.PINNED_CONTEXTS,
        [],
      );
    });

    it('should handle invalid storage data gracefully', async () => {
      vi.mocked(mockLocalStorageService.get).mockResolvedValue('Not an array');

      await contextManager.load();

      expect(contextManager.getPinnedTabs()).toHaveLength(0);
    });
  });

  describe('Favicon Handling', () => {
    it('should maintain favIconUrl through metadata updates and persistence', async () => {
      const tabId = 1;
      const initialFavIcon = 'https://initial.com/icon.png';
      const updatedFavIcon = 'https://updated.com/icon.png';
      const tab = new TabContext(
        tabId,
        'https://example.com',
        'Example',
        mockTabService,
        initialFavIcon,
      );

      await contextManager.addTab(tab);

      // Verify it was saved with favicon
      expect(mockLocalStorageService.set).toHaveBeenLastCalledWith(
        StorageKeys.PINNED_CONTEXTS,
        expect.arrayContaining([
          expect.objectContaining({ id: tabId, favIconUrl: initialFavIcon }),
        ]),
      );

      // Update metadata with new favicon
      await contextManager.updateTabMetadata(
        tabId,
        'https://example.com/new',
        'New Title',
        updatedFavIcon,
      );

      expect(contextManager.getPinnedTabs()[0].favIconUrl).toBe(updatedFavIcon);
      expect(mockLocalStorageService.set).toHaveBeenLastCalledWith(
        StorageKeys.PINNED_CONTEXTS,
        expect.arrayContaining([
          expect.objectContaining({ id: tabId, favIconUrl: updatedFavIcon }),
        ]),
      );
    });

    it('should rehydrate favIconUrl from storage and then from TabService if available', async () => {
      const storedData = [
        {
          id: 101,
          url: 'https://saved.com',
          title: 'Saved',
          favIconUrl: 'https://saved.com/icon.png',
        },
      ];
      vi.mocked(mockLocalStorageService.get).mockResolvedValue(storedData);

      // Mock TabService finding the tab WITH a potentially newer favicon
      vi.mocked(mockTabService.getTab).mockResolvedValue({
        id: 101,
        url: 'https://saved.com',
        title: 'Saved',
        status: 'complete',
        active: false,
        windowId: 1,
        discarded: false,
        favIconUrl: 'https://new.com/icon.png',
      });

      await contextManager.load();

      const pinned = contextManager.getPinnedTabs();
      expect(pinned).toHaveLength(1);
      expect(pinned[0].favIconUrl).toBe('https://new.com/icon.png');
    });
  });

  describe('autoPin', () => {
    it('should auto-pin a tab with autoPinned=true', async () => {
      const tab = new TabContext(
        1,
        'https://example.com',
        'Example',
        mockTabService,
      );

      await contextManager.autoPin(tab);

      const pinned = contextManager.getPinnedTabs();
      expect(pinned).toHaveLength(1);
      expect(pinned[0].autoPinned).toBe(true);
      expect(mockLocalStorageService.set).toHaveBeenCalled();
    });

    it('should be idempotent for already pinned tabs', async () => {
      const tab = new TabContext(
        1,
        'https://example.com',
        'Example',
        mockTabService,
      );

      await contextManager.autoPin(tab);
      await contextManager.autoPin(tab);

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
    });

    it('should skip restricted URLs silently', async () => {
      const tab = new TabContext(
        1,
        'chrome://settings',
        'Settings',
        mockTabService,
      );

      await contextManager.autoPin(tab);

      expect(contextManager.getPinnedTabs()).toHaveLength(0);
    });

    it('should skip tabs with no URL silently', async () => {
      const tab = new TabContext(1, '', 'Empty', mockTabService);

      await contextManager.autoPin(tab);

      expect(contextManager.getPinnedTabs()).toHaveLength(0);
    });

    it('should evict oldest auto-pinned tab when limit exceeded', async () => {
      // Fill up to the limit
      for (let i = 0; i < MAX_AUTO_PINNED_TABS; i++) {
        const tab = new TabContext(
          i + 1,
          `https://site${i}.com`,
          `Site ${i}`,
          mockTabService,
        );
        await contextManager.autoPin(tab);
      }

      expect(contextManager.getPinnedTabs()).toHaveLength(MAX_AUTO_PINNED_TABS);

      // Add one more — should evict the first
      const newTab = new TabContext(
        999,
        'https://new-site.com',
        'New Site',
        mockTabService,
      );
      await contextManager.autoPin(newTab);

      const pinned = contextManager.getPinnedTabs();
      expect(pinned).toHaveLength(MAX_AUTO_PINNED_TABS);
      // Oldest (id=1) should have been evicted
      expect(pinned.find((t) => t.tabId === 1)).toBeUndefined();
      // Newest should be present
      expect(pinned.find((t) => t.tabId === 999)).toBeDefined();
    });

    it('should not evict manually pinned tabs during LRU eviction', async () => {
      // Manually pin a tab first
      const manualTab = new TabContext(
        1,
        'https://manual.com',
        'Manual',
        mockTabService,
      );
      await contextManager.addTab(manualTab);
      expect(manualTab.autoPinned).toBe(false);

      // Fill auto-pin up to the limit
      for (let i = 0; i < MAX_AUTO_PINNED_TABS; i++) {
        const tab = new TabContext(
          i + 100,
          `https://auto${i}.com`,
          `Auto ${i}`,
          mockTabService,
        );
        await contextManager.autoPin(tab);
      }

      // Add one more auto-pin — should evict oldest auto-pin, NOT the manual one
      const overflow = new TabContext(
        9999,
        'https://overflow.com',
        'Overflow',
        mockTabService,
      );
      await contextManager.autoPin(overflow);

      const pinned = contextManager.getPinnedTabs();
      // Manual tab should still be present
      expect(pinned.find((t) => t.tabId === 1)).toBeDefined();
      // Oldest auto-pin (id=100) should be evicted
      expect(pinned.find((t) => t.tabId === 100)).toBeUndefined();
    });

    it('should persist autoPinned flag in save and restore in load', async () => {
      const tab = new TabContext(
        42,
        'https://auto.com',
        'Auto Tab',
        mockTabService,
        'https://auto.com/icon.png',
      );
      await contextManager.autoPin(tab);

      // Verify save includes autoPinned
      expect(mockLocalStorageService.set).toHaveBeenCalledWith(
        StorageKeys.PINNED_CONTEXTS,
        expect.arrayContaining([
          expect.objectContaining({ id: 42, autoPinned: true }),
        ]),
      );

      // Simulate load
      vi.mocked(mockLocalStorageService.get).mockResolvedValue([
        {
          id: 42,
          url: 'https://auto.com',
          title: 'Auto Tab',
          favIconUrl: 'https://auto.com/icon.png',
          autoPinned: true,
        },
      ]);
      vi.mocked(mockTabService.getTab).mockResolvedValue({
        id: 42,
        url: 'https://auto.com',
        title: 'Auto Tab',
        status: 'complete',
        active: false,
        windowId: 1,
        discarded: false,
        favIconUrl: 'https://auto.com/icon.png',
      });

      const newManager = new ContextManager(
        mockLocalStorageService,
        mockTabService,
      );
      await newManager.load();

      const pinned = newManager.getPinnedTabs();
      expect(pinned).toHaveLength(1);
      expect(pinned[0].autoPinned).toBe(true);
    });
  });
});
