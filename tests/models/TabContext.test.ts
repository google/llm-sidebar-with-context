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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TabContext } from "../../src/scripts/models/TabContext";
import { ITabService, TimeoutError } from "../../src/scripts/services/tabService";
import { MAX_CONTEXT_LENGTH, CONTEXT_MESSAGES } from "../../src/scripts/constants";

describe("TabContext", () => {
  let mockTabService: ITabService;

  beforeEach(() => {
    mockTabService = {
      query: vi.fn(),
      executeScript: vi.fn(),
      create: vi.fn(),
      waitForTabComplete: vi.fn(),
      getTab: vi.fn(),
    } as unknown as ITabService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return a restricted message for restricted URLs", async () => {
    const tabContext = new TabContext(1, "chrome://settings", "Settings", mockTabService);
    const content = await tabContext.readContent();
    expect(content).toContain(CONTEXT_MESSAGES.RESTRICTED_URL);
    expect(mockTabService.getTab).not.toHaveBeenCalled();
  });

  it("should fetch tab by ID and extract content", async () => {
    const tabId = 123;
    vi.mocked(mockTabService.getTab).mockResolvedValue({ id: tabId, status: "complete", active: true, windowId: 1, url: "https://example.com" });
    vi.mocked(mockTabService.executeScript).mockResolvedValue("Content");

    const tabContext = new TabContext(tabId, "https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();

    expect(mockTabService.getTab).toHaveBeenCalledWith(tabId);
    expect(content).toBe("Content");
  });

  it("should handle fragment URLs correctly by using ID", async () => {
    // This is the BUG FIX Verification
    const tabId = 456;
    const url = "https://geminicli.com/docs/cli/settings/#general";
    
    vi.mocked(mockTabService.getTab).mockResolvedValue({ id: tabId, status: "complete", active: true, windowId: 1, url: url });
    vi.mocked(mockTabService.executeScript).mockResolvedValue("Fragment Page Content");

    const tabContext = new TabContext(tabId, url, "Docs", mockTabService);
    const content = await tabContext.readContent();

    expect(mockTabService.getTab).toHaveBeenCalledWith(tabId);
    // Ensure we DID NOT call query({ url }) which would fail on fragments
    expect(mockTabService.query).not.toHaveBeenCalled(); 
    expect(content).toBe("Fragment Page Content");
  });

  it("should wait for loading tabs to complete and then extract content", async () => {
    const tabId = 123;
    vi.mocked(mockTabService.getTab).mockResolvedValue({ id: tabId, status: "loading", active: true, windowId: 1 });
    vi.mocked(mockTabService.waitForTabComplete).mockResolvedValue(undefined);
    vi.mocked(mockTabService.executeScript).mockResolvedValue("Final content");

    const tabContext = new TabContext(tabId, "https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();
    
    expect(mockTabService.waitForTabComplete).toHaveBeenCalledWith(tabId, 2000);
    expect(content).toBe("Final content");
  });

  it("should return a not found message if the tab ID does not exist", async () => {
    vi.mocked(mockTabService.getTab).mockResolvedValue(undefined);
    
    const tabContext = new TabContext(999, "https://gone.com", "Gone", mockTabService);
    const content = await tabContext.readContent();
    
    expect(content).toContain(CONTEXT_MESSAGES.TAB_NOT_FOUND);
  });

  it("should return a specific message if the tab is discarded", async () => {
    const tabId = 123;
    vi.mocked(mockTabService.getTab).mockResolvedValue({ 
        id: tabId, discarded: true, active: true, windowId: 1, url: "https://example.com" 
    });

    const tabContext = new TabContext(tabId, "https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();

    expect(content).toContain(CONTEXT_MESSAGES.TAB_DISCARDED);
    expect(mockTabService.executeScript).not.toHaveBeenCalled();
  });

  it("should return a restricted message if a pinned tab navigates to a restricted URL", async () => {
    const tabId = 123;
    const tabContext = new TabContext(tabId, "https://valid.com", "Valid", mockTabService);

    // Update URL to a restricted one
    tabContext.url = "chrome://extensions"; 
    
    const content = await tabContext.readContent();

    expect(content).toContain(CONTEXT_MESSAGES.RESTRICTED_URL);
    expect(mockTabService.getTab).not.toHaveBeenCalled();
  });

  it("should successfully extract content after navigating from a restricted to a valid URL", async () => {
    const tabId = 123;
    const tabContext = new TabContext(tabId, "chrome://newtab", "New Tab", mockTabService);

    // Update URL back to a valid one
    tabContext.url = "https://real-site.com";
    vi.mocked(mockTabService.getTab).mockResolvedValue({ 
        id: tabId, discarded: false, active: true, windowId: 1, url: "https://real-site.com", status: "complete"
    });
    vi.mocked(mockTabService.executeScript).mockResolvedValue("Site Content");

    const content = await tabContext.readContent();

    expect(content).toBe("Site Content");
    expect(mockTabService.getTab).toHaveBeenCalled();
  });

  it("should extract available content with a warning if the tab times out while loading", async () => {
    const tabId = 123;
    vi.mocked(mockTabService.getTab).mockResolvedValue({ id: tabId, status: "loading", active: true, windowId: 1 });
    vi.mocked(mockTabService.waitForTabComplete).mockRejectedValue(new TimeoutError("Timeout"));
    vi.mocked(mockTabService.executeScript).mockResolvedValue("Partial content");

    const tabContext = new TabContext(tabId, "https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();

    expect(mockTabService.waitForTabComplete).toHaveBeenCalledWith(tabId, 2000);
    expect(content).toContain(CONTEXT_MESSAGES.LOADING_WARNING);
    expect(content).toContain("Partial content");
  });

  it("should return an error message if script execution fails", async () => {
    const tabId = 123;
    vi.mocked(mockTabService.getTab).mockResolvedValue({ id: tabId, active: true, windowId: 1 });
    vi.mocked(mockTabService.executeScript).mockRejectedValue(new Error("Script failed"));

    const tabContext = new TabContext(tabId, "https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();

    expect(content).toContain(CONTEXT_MESSAGES.ERROR_PREFIX);
    expect(content).toContain("Script failed");
  });

  it("should return a 'No content' message if the page is empty", async () => {
    const tabId = 123;
    vi.mocked(mockTabService.getTab).mockResolvedValue({ id: tabId, active: true, windowId: 1 });
    vi.mocked(mockTabService.executeScript).mockResolvedValue("   ");

    const tabContext = new TabContext(tabId, "https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();

    expect(content).toBe(CONTEXT_MESSAGES.NO_CONTENT_WARNING);
  });

  it("should return an empty message if script execution returns null", async () => {
    const tabId = 123;
    vi.mocked(mockTabService.getTab).mockResolvedValue({ id: tabId, active: true, windowId: 1 });
    vi.mocked(mockTabService.executeScript).mockResolvedValue(null);

    const tabContext = new TabContext(tabId, "https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();

    expect(content).toBe(CONTEXT_MESSAGES.NO_CONTENT_WARNING);
  });

  it("should return the truncated text content of the tab", async () => {
    const tabId = 123;
    const longContent = "A".repeat(MAX_CONTEXT_LENGTH + 100);
    vi.mocked(mockTabService.getTab).mockResolvedValue({ id: tabId, active: true, windowId: 1 });
    vi.mocked(mockTabService.executeScript).mockResolvedValue(longContent);

    const tabContext = new TabContext(tabId, "https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();

    expect(content.length).toBe(MAX_CONTEXT_LENGTH);
    expect(content).toBe("A".repeat(MAX_CONTEXT_LENGTH));
  });
});