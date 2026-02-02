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
import { ITabService } from "../../src/scripts/services/tabService";
import { CONTEXT_MESSAGES } from "../../src/scripts/constants";

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
    expect(content).toEqual({
      type: "text",
      text: expect.stringContaining(CONTEXT_MESSAGES.RESTRICTED_URL)
    });
    expect(mockTabService.getTab).not.toHaveBeenCalled();
  });

  it("should select YouTubeStrategy for YouTube URLs", async () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const tabContext = new TabContext(123, url, "YouTube", mockTabService);
    const content = await tabContext.readContent();

    expect(content).toEqual({
      type: "file_data",
      mimeType: "video/mp4",
      fileUri: url
    });
  });

  it("should select DefaultWebPageStrategy for regular URLs", async () => {
    const url = "https://example.com";
    vi.mocked(mockTabService.getTab).mockResolvedValue({ id: 123, status: "complete", url } as any);
    vi.mocked(mockTabService.executeScript).mockResolvedValue("Regular Content");

    const tabContext = new TabContext(123, url, "Example", mockTabService);
    const content = await tabContext.readContent();

    expect(content).toEqual({ type: "text", text: "Regular Content" });
  });

  it("should handle navigation from restricted to valid URL", async () => {
    const tabId = 123;
    const tabContext = new TabContext(tabId, "chrome://newtab", "New Tab", mockTabService);

    // Update URL back to a valid one
    tabContext.url = "https://real-site.com";
    vi.mocked(mockTabService.getTab).mockResolvedValue({ 
        id: tabId, discarded: false, active: true, windowId: 1, url: "https://real-site.com", status: "complete"
    } as any);
    vi.mocked(mockTabService.executeScript).mockResolvedValue("Site Content");

    const content = await tabContext.readContent();

    expect(content).toEqual({ type: "text", text: "Site Content" });
    expect(mockTabService.getTab).toHaveBeenCalled();
  });
});
