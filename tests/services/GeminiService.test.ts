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
import { GeminiService } from "../../src/scripts/services/geminiService";
import { ChatMessage } from "../../src/scripts/types";

describe("GeminiService", () => {
  let geminiService: GeminiService;

  beforeEach(() => {
    geminiService = new GeminiService();
    // Stub the global fetch
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should format request correctly and return reply", async () => {
    const history: ChatMessage[] = [{ role: "user", text: "Hello" }];
    const context = "User is on example.com";
    const apiKey = "test-api-key";

    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "Hello! How can I help?" }],
          },
        },
      ],
    };

    // Mock fetch response
    vi.mocked(fetch).mockResolvedValue({
      json: async () => mockResponse,
    } as Response);

    const result = await geminiService.generateContent(
      apiKey,
      context,
      history
    );

    // Verify response
    expect(result.reply).toBe("Hello! How can I help?");

    // Verify fetch call arguments
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    
    expect(url).toContain("gemini-2.5-flash-lite");
    expect((options as RequestInit).headers).toEqual({
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    });

    const body = JSON.parse((options as RequestInit).body as string);
    // Context should be injected into the first user message (preprended)
    expect(body.contents[0].parts[0].text).toContain("Context: User is on example.com");
    // Original message should be at index 1
    expect(body.contents[0].parts[1].text).toContain("Hello");
  });

  it("should handle API errors", async () => {
    const mockErrorResponse = {
      error: {
        message: "API key invalid",
      },
    };

    vi.mocked(fetch).mockResolvedValue({
      json: async () => mockErrorResponse,
    } as Response);

    const result = await geminiService.generateContent(
      "bad-key",
      "",
      [{ role: "user", text: "Hi" }]
    );

    expect(result.error).toBe("API key invalid");
  });

  it("should handle network exceptions", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network failure"));

    const result = await geminiService.generateContent(
      "key",
      "",
      [{ role: "user", text: "Hi" }]
    );

    expect(result.error).toBe("Network failure");
  });

  it("should handle unknown API response structure", async () => {
    // Return empty object (no candidates, no error)
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({}),
    } as Response);

    const result = await geminiService.generateContent(
      "key",
      "",
      [{ role: "user", text: "Hi" }]
    );

    expect(result.error).toBe("Unknown error from Gemini API.");
  });

  it("should return error if API key is empty", async () => {
    const result = await geminiService.generateContent(
      "", 
      "Context", 
      [{ role: "user", text: "Hi" }]
    );
    expect(result.error).toBe("API key is required");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should return error if history is empty", async () => {
    const result = await geminiService.generateContent(
      "key", 
      "Context", 
      []
    );
    expect(result.error).toBe("Chat history cannot be empty");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should return error if the last message is not from user", async () => {
    const result = await geminiService.generateContent(
      "key", 
      "Context", 
      [{ role: "user", text: "Hi" }, { role: "model", text: "Hello" }]
    );
    expect(result.error).toBe("The last message must be from the user");
    expect(fetch).not.toHaveBeenCalled();
  });
});
