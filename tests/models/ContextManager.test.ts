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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextManager } from "../../src/scripts/models/ContextManager";
import { TabContext } from "../../src/scripts/models/TabContext";
import { ILocalStorageService } from "../../src/scripts/services/storageService";
import { ITabService, ChromeTab } from "../../src/scripts/services/tabService";
import { StorageKeys, CONTEXT_MESSAGES } from "../../src/scripts/constants";

describe("ContextManager", () => {
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
      create: vi.fn(),
      waitForTabComplete: vi.fn(),
      getTab: vi.fn(),
    } as unknown as ITabService;

    contextManager = new ContextManager(mockLocalStorageService, mockTabService);
  });

  describe("addTab", () => {
    it("should add a valid tab and save", async () => {
      const tabId = 1;
      const tab = new TabContext(tabId, "https://example.com", "Example", mockTabService);
      
      await contextManager.addTab(tab);

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(contextManager.getPinnedTabs()[0].tabId).toBe(tabId);
      // Verify saved data includes ID
      expect(mockLocalStorageService.set).toHaveBeenCalledWith(
        StorageKeys.PINNED_CONTEXTS,
        expect.arrayContaining([expect.objectContaining({ id: tabId })])
      );
    });

    it("should throw error for restricted URLs", async () => {
      const tab = new TabContext(1, "chrome://settings", "Settings", mockTabService);

      await expect(contextManager.addTab(tab)).rejects.toThrow(
        "Cannot pin restricted Chrome pages."
      );
      expect(contextManager.getPinnedTabs()).toHaveLength(0);
      expect(mockLocalStorageService.set).not.toHaveBeenCalled();
    });

    it("should be idempotent (ignore duplicates by ID)", async () => {
      const tab = new TabContext(1, "https://example.com", "Example", mockTabService);
      
      await contextManager.addTab(tab);
      await contextManager.addTab(tab); // Add again

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(mockLocalStorageService.set).toHaveBeenCalledTimes(1); 
    });

    it("should allow duplicate URLs if IDs are different", async () => {
      const tab1 = new TabContext(1, "https://example.com", "Example 1", mockTabService);
      const tab2 = new TabContext(2, "https://example.com", "Example 2", mockTabService);

      await contextManager.addTab(tab1);
      await contextManager.addTab(tab2); 

      expect(contextManager.getPinnedTabs()).toHaveLength(2);
      expect(contextManager.getPinnedTabs()[0].tabId).toBe(1);
      expect(contextManager.getPinnedTabs()[1].tabId).toBe(2);
      expect(mockLocalStorageService.set).toHaveBeenCalledTimes(2);
    });

    it("should not remove both tabs when removing one of two tabs with the same URL", async () => {
      const tab1 = new TabContext(1, "https://example.com", "Example 1", mockTabService);
      const tab2 = new TabContext(2, "https://example.com", "Example 2", mockTabService);

      await contextManager.addTab(tab1);
      await contextManager.addTab(tab2); 

      await contextManager.removeTab(1);

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(contextManager.getPinnedTabs()[0].tabId).toBe(2);
      expect(contextManager.getPinnedTabs()[0].url).toBe("https://example.com");
    });

    it("should update tab metadata correctly", async () => {
      const tab = new TabContext(1, "https://old.com", "Old Title", mockTabService);
      await contextManager.addTab(tab);

      await contextManager.updateTabMetadata(1, "https://new.com", "New Title");

      expect(contextManager.getPinnedTabs()[0].url).toBe("https://new.com");
      expect(contextManager.getPinnedTabs()[0].title).toBe("New Title");
      expect(mockLocalStorageService.set).toHaveBeenCalledTimes(2);
    });

    it("should throw error when pinning a tab with an empty URL", async () => {
       const tab = new TabContext(1, "", "No URL", mockTabService);
       await expect(contextManager.addTab(tab)).rejects.toThrow("Cannot pin a tab with no URL.");
       expect(contextManager.getPinnedTabs()).toHaveLength(0);
    });

    it("should throw error if pinning more than MAX_PINNED_TABS", async () => {
      // Pin 6 tabs (MAX_PINNED_TABS)
      for (let i = 0; i < 6; i++) {
        const tab = new TabContext(i + 1, `https://example${i}.com`, `Title ${i}`, mockTabService);
        await contextManager.addTab(tab);
      }

      // Try to pin 7th
      const extraTab = new TabContext(99, "https://overflow.com", "Overflow", mockTabService);
      await expect(contextManager.addTab(extraTab)).rejects.toThrow("You can only pin up to 6 tabs.");
      expect(contextManager.isTabPinned(99)).toBe(false);
    });

    it("should allow pinning after reaching limit, failing, and then removing an item", async () => {
       // Pin 6 tabs
       for (let i = 0; i < 6; i++) {
        const tab = new TabContext(i + 1, `https://example${i}.com`, `Title ${i}`, mockTabService);
        await contextManager.addTab(tab);
      }

      // Try to pin 7th - should fail
      const extraTab = new TabContext(99, "https://overflow.com", "Overflow", mockTabService);
      await expect(contextManager.addTab(extraTab)).rejects.toThrow("You can only pin up to 6 tabs.");

      // Remove one
      await contextManager.removeTab(1);

      // Now trying to add the same extraTab should succeed
      await expect(contextManager.addTab(extraTab)).resolves.not.toThrow();
      expect(contextManager.getPinnedTabs()).toHaveLength(6);
      expect(contextManager.isTabPinned(99)).toBe(true);
    });

    it("should handle simultaneous addTab calls correctly (Concurrency)", async () => {
      // Pin 5 tabs
      for (let i = 0; i < 5; i++) {
        const tab = new TabContext(i + 1, `https://example${i}.com`, `Title ${i}`, mockTabService);
        await contextManager.addTab(tab);
      }

      // Try to add two tabs simultaneously
      const tabA = new TabContext(100, "https://a.com", "A", mockTabService);
      const tabB = new TabContext(101, "https://b.com", "B", mockTabService);

      // In JS, these aren't truly parallel but test if the state remains consistent
      const results = await Promise.allSettled([
        contextManager.addTab(tabA),
        contextManager.addTab(tabB)
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toContain("You can only pin up to 6 tabs.");
      expect(contextManager.getPinnedTabs()).toHaveLength(6);
    });

    it("should be idempotent even when at the limit", async () => {
      // Pin 6 tabs
      for (let i = 0; i < 6; i++) {
        const tab = new TabContext(i + 1, `https://example${i}.com`, `Title ${i}`, mockTabService);
        await contextManager.addTab(tab);
      }

      // Try to pin one of the already pinned tabs
      const existingTab = new TabContext(1, "https://example0.com", "Title 0", mockTabService);
      await expect(contextManager.addTab(existingTab)).resolves.not.toThrow();
      expect(contextManager.getPinnedTabs()).toHaveLength(6);
    });

    it("should prevent adding items if storage already has limit exceeded (Legacy Data)", async () => {
        // mock load() to populate the array with 7 items
        const storedData = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, url: `https://site${i}.com`, title: `Site ${i}` }));
        vi.mocked(mockLocalStorageService.get).mockResolvedValue(storedData);
        // Mock getTab to return valid tabs for all 7
        vi.mocked(mockTabService.getTab).mockImplementation(async (id) => ({ id, url: "u", title: "t", active: false } as any));
        
        await contextManager.load();
        expect(contextManager.getPinnedTabs()).toHaveLength(7);

        // Try to add an 8th tab
        const newTab = new TabContext(100, "https://new.com", "New", mockTabService);
        await expect(contextManager.addTab(newTab)).rejects.toThrow("You can only pin up to 6 tabs.");
    });
  });

  describe("removeTab", () => {
    it("should remove a tab by ID and save", async () => {
      const tab1 = new TabContext(1, "https://a.com", "A", mockTabService);
      const tab2 = new TabContext(2, "https://b.com", "B", mockTabService);
      
      await contextManager.addTab(tab1);
      await contextManager.addTab(tab2);
      
      vi.mocked(mockLocalStorageService.set).mockClear();

      await contextManager.removeTab(1);

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(contextManager.getPinnedTabs()[0].tabId).toBe(2);
      expect(mockLocalStorageService.set).toHaveBeenCalledTimes(1);
    });

    it("should do nothing if ID not found", async () => {
      const tab = new TabContext(1, "https://example.com", "Example", mockTabService);
      await contextManager.addTab(tab);
      vi.mocked(mockLocalStorageService.set).mockClear();

      await contextManager.removeTab(999);

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(mockLocalStorageService.set).not.toHaveBeenCalled();
    });
  });

  describe("getAllContent", () => {
    it("should concatenate content from all pinned tabs", async () => {
      const tab1 = new TabContext(1, "https://a.com", "A", mockTabService);
      const tab2 = new TabContext(2, "https://b.com", "B", mockTabService);
      
      vi.spyOn(tab1, 'readContent').mockResolvedValue({ type: "text", text: "Content A" });
      vi.spyOn(tab2, 'readContent').mockResolvedValue({ type: "text", text: "Content B" });
      
      await contextManager.addTab(tab1);
      await contextManager.addTab(tab2);

      const content = await contextManager.getAllContent();

      expect(content).toEqual(expect.arrayContaining([
        { type: "text", text: expect.stringContaining("--- Pinned Tab: A (https://a.com) ---") },
        { type: "text", text: "Content A" },
        { type: "text", text: expect.stringContaining("--- Pinned Tab: B (https://b.com) ---") },
        { type: "text", text: "Content B" }
      ]));
      
      expect(tab1.readContent).toHaveBeenCalled();
      expect(tab2.readContent).toHaveBeenCalled();
    });

    it("should handle partial failure (one tab fails to read)", async () => {
        const tab1 = new TabContext(1, "https://good.com", "Good", mockTabService);
        const tab2 = new TabContext(2, "https://bad.com", "Bad", mockTabService);
        
        vi.spyOn(tab1, 'readContent').mockResolvedValue({ type: "text", text: "Good Content" });
        vi.spyOn(tab2, 'readContent').mockResolvedValue({ type: "text", text: CONTEXT_MESSAGES.TAB_NOT_FOUND });
        
        await contextManager.addTab(tab1);
        await contextManager.addTab(tab2);
  
        const content = await contextManager.getAllContent();
  
        expect(content).toEqual(expect.arrayContaining([
          { type: "text", text: "Good Content" },
          { type: "text", text: CONTEXT_MESSAGES.TAB_NOT_FOUND }
        ]));
      });
  });

  describe("getActiveTabContent", () => {
    it("should fetch content for the active tab using ID", async () => {
      const activeTab = { id: 99, url: "https://active.com", title: "Active", status: "complete" } as ChromeTab;

      vi.mocked(mockTabService.query).mockResolvedValueOnce([activeTab]);
      // Mock getTab for the internally created TabContext's readContent
      vi.mocked(mockTabService.getTab).mockResolvedValue(activeTab);
      vi.mocked(mockTabService.executeScript).mockResolvedValue("Active Content");

      const content = await contextManager.getActiveTabContent();

      expect(content).toEqual(expect.arrayContaining([
        { type: "text", text: expect.stringContaining("Current tab URL: https://active.com") },
        { type: "text", text: "Active Content" }
      ]));
      
      // Verify we passed the ID to getTab
      expect(mockTabService.getTab).toHaveBeenCalledWith(99);
    });
    
    it("should return empty array if no active tab found", async () => {
         vi.mocked(mockTabService.query).mockResolvedValue([]);
         const content = await contextManager.getActiveTabContent();
         expect(content).toEqual([]);
    });

    it("should return warning message if active tab is restricted", async () => {
        const restrictedTab = { id: 99, url: "chrome://settings", title: "Settings" } as ChromeTab;
        
        vi.mocked(mockTabService.query).mockResolvedValueOnce([restrictedTab]);
        
        const content = await contextManager.getActiveTabContent();
        
        expect(content).toEqual(expect.arrayContaining([
          { type: "text", text: expect.stringContaining("Current tab URL: chrome://settings") },
          { type: "text", text: expect.stringContaining(CONTEXT_MESSAGES.RESTRICTED_URL) }
        ]));
    });

    it("should not extract active tab content if it's already pinned", async () => {
      const tabId = 123;
      const activeTab = { id: tabId, url: "https://pinned.com", title: "Pinned", status: "complete" } as ChromeTab;
      
      vi.mocked(mockTabService.query).mockResolvedValueOnce([activeTab]);
      
      // Pin the tab
      const pinnedTab = new TabContext(tabId, activeTab.url!, activeTab.title!, mockTabService);
      await contextManager.addTab(pinnedTab);
      
      vi.mocked(mockTabService.executeScript).mockClear();

      const content = await contextManager.getActiveTabContent();

      expect(content).toEqual([{
        type: "text",
        text: expect.stringContaining(`Current tab URL: ${activeTab.url}`)
      }]);
      expect(content[0].type === "text" && (content[0] as any).text).toContain("(Content included in pinned tabs)");
      expect(mockTabService.executeScript).not.toHaveBeenCalled();
    });

    it("should handle YouTube context in getAllContent", async () => {
        const url = "https://www.youtube.com/watch?v=123";
        const tab = new TabContext(1, url, "Video", mockTabService);
        await contextManager.addTab(tab);

        const content = await contextManager.getAllContent();
        
        expect(content).toEqual([
            { type: "text", text: expect.stringContaining("--- Pinned Tab: Video (https://www.youtube.com/watch?v=123) ---") },
            { type: "file_data", mimeType: "video/mp4", fileUri: url }
        ]);
    });

    it("should handle mixed contexts in getAllContent", async () => {
        const tab1 = new TabContext(1, "https://example.com", "Text Site", mockTabService);
        const tab2 = new TabContext(2, "https://www.youtube.com/watch?v=123", "Video Site", mockTabService);
        
        vi.spyOn(tab1, 'readContent').mockResolvedValue({ type: "text", text: "Text Content" });
        // tab2 will use YouTubeStrategy automatically
        
        await contextManager.addTab(tab1);
        await contextManager.addTab(tab2);

        const content = await contextManager.getAllContent();
        
        expect(content).toEqual([
            { type: "text", text: expect.stringContaining("--- Pinned Tab: Text Site") },
            { type: "text", text: "Text Content" },
            { type: "text", text: expect.stringContaining("--- Pinned Tab: Video Site") },
            { type: "file_data", mimeType: "video/mp4", fileUri: "https://www.youtube.com/watch?v=123" }
        ]);
    });

    it("should handle YouTube active tab in getActiveTabContent", async () => {
        const url = "https://www.youtube.com/watch?v=active";
        const activeTab = { id: 99, url, title: "Active Video" } as ChromeTab;
        vi.mocked(mockTabService.query).mockResolvedValueOnce([activeTab]);
        vi.mocked(mockTabService.getTab).mockResolvedValue(activeTab);

        const content = await contextManager.getActiveTabContent();

        expect(content).toEqual([
            { type: "text", text: expect.stringContaining(`Current tab URL: ${url}`) },
            { type: "file_data", mimeType: "video/mp4", fileUri: url }
        ]);
    });
  });

  describe("load (Rehydration)", () => {
      it("should rehydrate pinned tabs if ID is still valid", async () => {
          const storedData = [
              { id: 101, url: "https://saved.com", title: "Saved" }
          ];
          vi.mocked(mockLocalStorageService.get).mockResolvedValue(storedData);
          
          // Mock tab service finding the tab
          vi.mocked(mockTabService.getTab).mockResolvedValue({
            id: 101, url: "https://saved.com", title: "Saved", status: "complete", active: false, windowId: 1,
            discarded: false
          });

          await contextManager.load();

          const pinned = contextManager.getPinnedTabs();
          expect(pinned).toHaveLength(1);
          expect(pinned[0].tabId).toBe(101);
      });

      it("should drop tabs if ID is no longer valid (Strict Session Persistence)", async () => {
          const storedData = [
              { id: 101, url: "https://saved.com", title: "Saved" }
          ];
          vi.mocked(mockLocalStorageService.get).mockResolvedValue(storedData);
          
          // Mock tab service NOT finding the tab (undefined)
          vi.mocked(mockTabService.getTab).mockResolvedValue(undefined);

          await contextManager.load();

          const pinned = contextManager.getPinnedTabs();
          expect(pinned).toHaveLength(0);
          
          // Should also save the cleaned list
          expect(mockLocalStorageService.set).toHaveBeenCalledWith(StorageKeys.PINNED_CONTEXTS, []);
      });

      it("should handle invalid storage data gracefully", async () => {
          vi.mocked(mockLocalStorageService.get).mockResolvedValue("Not an array");
          
          await contextManager.load();
          
          expect(contextManager.getPinnedTabs()).toHaveLength(0);
      });
  });
});