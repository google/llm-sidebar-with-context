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
    };

    contextManager = new ContextManager(mockLocalStorageService, mockTabService);
  });

  describe("addTab", () => {
    it("should add a valid tab and save", async () => {
      const tab = new TabContext("https://example.com", "Example", mockTabService);
      
      await contextManager.addTab(tab);

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(contextManager.getPinnedTabs()[0].url).toBe("https://example.com");
      expect(mockLocalStorageService.set).toHaveBeenCalledWith(
        StorageKeys.PINNED_CONTEXTS,
        [tab]
      );
    });

    it("should throw error for restricted URLs", async () => {
      const tab = new TabContext("chrome://settings", "Settings", mockTabService);

      await expect(contextManager.addTab(tab)).rejects.toThrow(
        "Cannot pin restricted Chrome pages."
      );
      expect(contextManager.getPinnedTabs()).toHaveLength(0);
      expect(mockLocalStorageService.set).not.toHaveBeenCalled();
    });

    it("should be idempotent (ignore duplicates)", async () => {
      const tab = new TabContext("https://example.com", "Example", mockTabService);
      
      await contextManager.addTab(tab);
      await contextManager.addTab(tab); // Add again

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(mockLocalStorageService.set).toHaveBeenCalledTimes(1); // Saved only once
    });

    it("should be idempotent based on URL (ignore same URL with different title)", async () => {
      const tab1 = new TabContext("https://example.com", "Title 1", mockTabService);
      const tab2 = new TabContext("https://example.com", "Title 2", mockTabService);

      await contextManager.addTab(tab1);
      await contextManager.addTab(tab2); // Add same URL, diff title

      // Should still be length 1, and should keep the ORIGINAL one (tab1)
      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(contextManager.getPinnedTabs()[0].title).toBe("Title 1"); 
      expect(mockLocalStorageService.set).toHaveBeenCalledTimes(1);
    });

    it("should throw error when pinning a tab with an empty URL", async () => {
       const tab = new TabContext("", "No URL", mockTabService);
       await expect(contextManager.addTab(tab)).rejects.toThrow("Cannot pin a tab with no URL.");
       expect(contextManager.getPinnedTabs()).toHaveLength(0);
    });
  });

  describe("removeTab", () => {
    it("should remove a tab by URL and save", async () => {
      const tab1 = new TabContext("https://a.com", "A", mockTabService);
      const tab2 = new TabContext("https://b.com", "B", mockTabService);
      
      await contextManager.addTab(tab1);
      await contextManager.addTab(tab2);
      
      // Reset mock to clear previous calls
      vi.mocked(mockLocalStorageService.set).mockClear();

      await contextManager.removeTab("https://a.com");

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(contextManager.getPinnedTabs()[0].url).toBe("https://b.com");
      expect(mockLocalStorageService.set).toHaveBeenCalledTimes(1);
    });

    it("should do nothing if URL not found", async () => {
      const tab = new TabContext("https://example.com", "Example", mockTabService);
      await contextManager.addTab(tab);
      vi.mocked(mockLocalStorageService.set).mockClear();

      await contextManager.removeTab("https://notfound.com");

      expect(contextManager.getPinnedTabs()).toHaveLength(1);
      expect(mockLocalStorageService.set).not.toHaveBeenCalled();
    });
  });

  describe("getAllContent", () => {
    it("should concatenate content from all pinned tabs", async () => {
      const tab1 = new TabContext("https://a.com", "A", mockTabService);
      const tab2 = new TabContext("https://b.com", "B", mockTabService);
      
      // Spy on readContent to decouple from TabContext implementation
      vi.spyOn(tab1, 'readContent').mockResolvedValue("Content A");
      vi.spyOn(tab2, 'readContent').mockResolvedValue("Content B");
      
      await contextManager.addTab(tab1);
      await contextManager.addTab(tab2);

      const content = await contextManager.getAllContent();

      expect(content).toContain("--- Pinned Tab: A (https://a.com) ---");
      expect(content).toContain("Content A");
      expect(content).toContain("--- Pinned Tab: B (https://b.com) ---");
      expect(content).toContain("Content B");
      
      // Verify readContent was called
      expect(tab1.readContent).toHaveBeenCalled();
      expect(tab2.readContent).toHaveBeenCalled();
    });

    it("should handle partial failure (one tab fails to read)", async () => {
        const tab1 = new TabContext("https://good.com", "Good", mockTabService);
        const tab2 = new TabContext("https://bad.com", "Bad", mockTabService);
        
        vi.spyOn(tab1, 'readContent').mockResolvedValue("Good Content");
        vi.spyOn(tab2, 'readContent').mockResolvedValue(CONTEXT_MESSAGES.TAB_NOT_FOUND);
        
        await contextManager.addTab(tab1);
        await contextManager.addTab(tab2);
  
        const content = await contextManager.getAllContent();
  
        expect(content).toContain("Good Content");
        expect(content).toContain(CONTEXT_MESSAGES.TAB_NOT_FOUND);
      });
  });

  describe("getActiveTabContent", () => {
    it("should fetch content for the active tab", async () => {
      const activeTab = { id: 99, url: "https://active.com", title: "Active", status: "complete" } as ChromeTab;

      vi.mocked(mockTabService.query)
        .mockResolvedValueOnce([activeTab]) // For ContextManager finding the tab
        .mockResolvedValueOnce([activeTab]); // For TabContext finding it (complete)

      vi.mocked(mockTabService.executeScript).mockResolvedValue("Active Content");

      const content = await contextManager.getActiveTabContent();

      expect(content).toContain("Current tab URL: https://active.com");
      expect(content).toContain("Active Content");
    });
    
    it("should return empty string if no active tab found", async () => {
         vi.mocked(mockTabService.query).mockResolvedValue([]);
         const content = await contextManager.getActiveTabContent();
         expect(content).toBe("");
    });

    it("should return warning message if active tab is restricted", async () => {
        const restrictedTab = { id: 99, url: "chrome://settings", title: "Settings" } as ChromeTab;
        
        vi.mocked(mockTabService.query).mockResolvedValueOnce([restrictedTab]);
        
        const content = await contextManager.getActiveTabContent();
        
        expect(content).toContain("Current tab URL: chrome://settings");
        expect(content).toContain(CONTEXT_MESSAGES.RESTRICTED_URL);
    });
  });

  describe("load", () => {
      it("should rehydrate pinned tabs from storage", async () => {
          const storedData = [
              { url: "https://saved.com", title: "Saved" }
          ];
          vi.mocked(mockLocalStorageService.get).mockResolvedValue(storedData);

          await contextManager.load();

          const pinned = contextManager.getPinnedTabs();
          expect(pinned).toHaveLength(1);
          expect(pinned[0].url).toBe("https://saved.com");
          expect(pinned[0].title).toBe("Saved");
      });

      it("should handle invalid storage data gracefully", async () => {
          vi.mocked(mockLocalStorageService.get).mockResolvedValue("Not an array");
          
          await contextManager.load();
          
          expect(contextManager.getPinnedTabs()).toHaveLength(0);
      });
  });
});
