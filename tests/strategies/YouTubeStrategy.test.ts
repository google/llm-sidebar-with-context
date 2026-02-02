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

import { describe, it, expect } from "vitest";
import { YouTubeStrategy } from "../../src/scripts/strategies/YouTubeStrategy";

describe("YouTubeStrategy", () => {
  const strategy = new YouTubeStrategy();

  describe("canHandle", () => {
    it("should handle standard watch URLs", () => {
      expect(strategy.canHandle("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
      expect(strategy.canHandle("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    });

    it("should handle mobile watch URLs", () => {
      expect(strategy.canHandle("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    });

    it("should handle music watch URLs", () => {
      expect(strategy.canHandle("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    });

    it("should handle YouTube Shorts", () => {
      expect(strategy.canHandle("https://www.youtube.com/shorts/abcd123")).toBe(true);
    });

    it("should handle youtu.be short URLs", () => {
      expect(strategy.canHandle("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    });

    it("should NOT handle YouTube home or other pages", () => {
      expect(strategy.canHandle("https://www.youtube.com/")).toBe(false);
      expect(strategy.canHandle("https://www.youtube.com/feed/subscriptions")).toBe(false);
    });

    it("should NOT handle non-YouTube URLs", () => {
      expect(strategy.canHandle("https://google.com")).toBe(false);
      expect(strategy.canHandle("https://example.com/watch?v=123")).toBe(false);
    });

    it("should handle invalid URLs gracefully", () => {
      expect(strategy.canHandle("not-a-url")).toBe(false);
    });
  });

  describe("getContent", () => {
    it("should return file_data with video/mp4 mimeType", async () => {
      const url = "https://www.youtube.com/watch?v=123";
      const content = await strategy.getContent(1, url);
      
      expect(content).toEqual({
        type: "file_data",
        mimeType: "video/mp4",
        fileUri: url
      });
    });
  });
});
