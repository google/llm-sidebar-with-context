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
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return a restricted message for restricted URLs", async () => {
    const tabContext = new TabContext("chrome://settings", "Settings", mockTabService);
    const content = await tabContext.readContent();
    expect(content).toContain(CONTEXT_MESSAGES.RESTRICTED_URL);
    expect(mockTabService.query).not.toHaveBeenCalled();
  });

  it("should wait for loading tabs to complete and then extract content", async () => {
    // Initial query returns a loading tab
    vi.mocked(mockTabService.query).mockResolvedValue([{ id: 123, status: "loading", active: true, windowId: 1 }]);
    // waitForTabComplete resolves successfully
    vi.mocked(mockTabService.waitForTabComplete).mockResolvedValue(undefined);
    vi.mocked(mockTabService.executeScript).mockResolvedValue("Final content");

    const tabContext = new TabContext("https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();
    
    expect(mockTabService.waitForTabComplete).toHaveBeenCalledWith(123, 2000);
    expect(content).toBe("Final content");
    expect(content).not.toContain(CONTEXT_MESSAGES.LOADING_WARNING);
  });

  it("should extract available content with a warning if the tab times out while loading", async () => {
    // Initial query returns a loading tab
    vi.mocked(mockTabService.query).mockResolvedValue([{ id: 123, status: "loading", active: true, windowId: 1 }]);
    // waitForTabComplete rejects (timeout)
    vi.mocked(mockTabService.waitForTabComplete).mockRejectedValue(new TimeoutError("Timeout"));
    // executeScript still runs and returns partial content
    vi.mocked(mockTabService.executeScript).mockResolvedValue("Partial content");

    const tabContext = new TabContext("https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();

    expect(mockTabService.waitForTabComplete).toHaveBeenCalledWith(123, 2000);
    expect(content).toContain(CONTEXT_MESSAGES.LOADING_WARNING);
    expect(content).toContain("Partial content");
  });

  it("should return a 'No content' message if the page is empty", async () => {
    vi.mocked(mockTabService.query).mockResolvedValue([{ id: 123, active: true, windowId: 1 }]);
    vi.mocked(mockTabService.executeScript).mockResolvedValue("   "); // Empty or whitespace

    const tabContext = new TabContext("https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();

    expect(content).toBe(CONTEXT_MESSAGES.NO_CONTENT_WARNING);
  });

  it("should return a not found message if the tab is missing (complete or loading)", async () => {
    vi.mocked(mockTabService.query).mockResolvedValue([]); // Returns empty for both queries
    const tabContext = new TabContext("https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();
    expect(content).toContain(CONTEXT_MESSAGES.TAB_NOT_FOUND);
  });

  it("should return a missing ID message if the tab has no ID", async () => {
    vi.mocked(mockTabService.query).mockResolvedValue([{ active: true, windowId: 1 }]);
    const tabContext = new TabContext("https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();
    expect(content).toContain(CONTEXT_MESSAGES.TAB_ID_NOT_FOUND);
  });

  it("should return the truncated text content of the tab", async () => {
    const longContent = "A".repeat(MAX_CONTEXT_LENGTH + 100);
    vi.mocked(mockTabService.query).mockResolvedValue([{ id: 123, active: true, windowId: 1 }]);
    vi.mocked(mockTabService.executeScript).mockResolvedValue(longContent);

    const tabContext = new TabContext("https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();

    expect(content.length).toBe(MAX_CONTEXT_LENGTH);
    expect(content).toBe("A".repeat(MAX_CONTEXT_LENGTH));
    expect(mockTabService.executeScript).toHaveBeenCalledWith(123, expect.any(Function));
  });

  it("should return an empty message if script execution returns null", async () => {
    vi.mocked(mockTabService.query).mockResolvedValue([{ id: 123, active: true, windowId: 1 }]);
    vi.mocked(mockTabService.executeScript).mockResolvedValue(null);

    const tabContext = new TabContext("https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();

    expect(content).toBe(CONTEXT_MESSAGES.NO_CONTENT_WARNING);
  });

  it("should return an error message if script execution fails", async () => {
    vi.mocked(mockTabService.query).mockResolvedValue([{ id: 123, active: true, windowId: 1 }]);
    vi.mocked(mockTabService.executeScript).mockRejectedValue(new Error("Script failed"));

    const tabContext = new TabContext("https://example.com", "Example", mockTabService);
    const content = await tabContext.readContent();

    expect(content).toContain(CONTEXT_MESSAGES.ERROR_PREFIX);
    expect(content).toContain("Script failed");
  });
});
