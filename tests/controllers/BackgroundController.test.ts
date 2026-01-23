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
import { BackgroundController } from "../../src/scripts/controllers/BackgroundController";
import { IStorageService } from "../../src/scripts/services/storageService";
import { ITabService } from "../../src/scripts/services/tabService";
import { IGeminiService } from "../../src/scripts/services/geminiService";
import { MessageTypes, StorageKeys } from "../../src/scripts/constants";

describe("BackgroundController", () => {
  let controller: BackgroundController;
  let mockLocalStorage: IStorageService;
  let mockSyncStorage: IStorageService;
  let mockTabService: ITabService;
  let mockGeminiService: IGeminiService;

  beforeEach(() => {
    mockLocalStorage = {
      get: vi.fn(),
      set: vi.fn(),
    };
    mockSyncStorage = {
      get: vi.fn(),
      set: vi.fn(),
    };
    mockTabService = {
      query: vi.fn().mockResolvedValue([]),
      executeScript: vi.fn(),
      create: vi.fn(),
      waitForTabComplete: vi.fn(),
    };
    mockGeminiService = {
      generateContent: vi.fn(),
    };

    controller = new BackgroundController(
      mockLocalStorage,
      mockSyncStorage,
      mockTabService,
      mockGeminiService
    );
  });

  it("should handle CHAT_MESSAGE correctly", async () => {
    // 1. Setup mocks
    vi.mocked(mockSyncStorage.get).mockResolvedValue("fake-api-key");
    vi.mocked(mockGeminiService.generateContent).mockResolvedValue({
      reply: "Hello from Gemini",
    });
    vi.mocked(mockTabService.query).mockResolvedValue([
      { id: 1, url: "https://current.com", title: "Current" } as any,
    ]);

    // 2. Execute
    const response = await controller.handleMessage({
      type: MessageTypes.CHAT_MESSAGE,
      message: "Hi",
      model: "gemini-pro",
    });

    // 3. Verify
    expect(response).toEqual({ reply: "Hello from Gemini" });
    expect(mockGeminiService.generateContent).toHaveBeenCalledWith(
      "fake-api-key",
      expect.stringContaining("https://current.com"),
      expect.arrayContaining([{ role: "user", text: "Hi" }]),
      "gemini-pro"
    );
    // Verify history was saved
    expect(mockLocalStorage.set).toHaveBeenCalledWith(
      StorageKeys.CHAT_HISTORY,
      expect.arrayContaining([
        { role: "user", text: "Hi" },
        { role: "model", text: "Hello from Gemini" },
      ])
    );
  });

  it("should ensure JIT loading is called on every message", async () => {
    vi.mocked(mockLocalStorage.get).mockResolvedValue([]);
    
    await controller.handleMessage({ type: MessageTypes.GET_HISTORY });
    await controller.handleMessage({ type: MessageTypes.GET_HISTORY });

    // load() is called for both ChatHistory and ContextManager on every handleMessage
    // PINNED_CONTEXTS and CHAT_HISTORY should be fetched twice each
    expect(mockLocalStorage.get).toHaveBeenCalledWith(StorageKeys.CHAT_HISTORY);
    expect(mockLocalStorage.get).toHaveBeenCalledWith(StorageKeys.PINNED_CONTEXTS);
    expect(mockLocalStorage.get).toHaveBeenCalledTimes(4);
  });

  it("should handle CHAT_MESSAGE with composed context (active + pinned)", async () => {
    vi.mocked(mockSyncStorage.get).mockResolvedValue("fake-key");
    // Mock pinned tabs in storage
    vi.mocked(mockLocalStorage.get).mockImplementation((key) => {
      if (key === StorageKeys.PINNED_CONTEXTS) return Promise.resolve([{ url: "https://pinned.com", title: "Pinned" }]);
      return Promise.resolve([]);
    });
    // Mock active tab
    vi.mocked(mockTabService.query).mockResolvedValue([
      { id: 1, url: "https://active.com", title: "Active" } as any
    ]);
    // Mock script execution for content
    vi.mocked(mockTabService.executeScript).mockResolvedValue("Active Content");
    
    vi.mocked(mockGeminiService.generateContent).mockResolvedValue({ reply: "Responded" });

    await controller.handleMessage({
      type: MessageTypes.CHAT_MESSAGE,
      message: "Test context",
      model: "gemini-pro",
    });

    expect(mockGeminiService.generateContent).toHaveBeenCalledWith(
      "fake-key",
      expect.stringContaining("Active Content"), // From active tab
      expect.any(Array),
      "gemini-pro"
    );
    // It should also contain the pinned tab title/url (even if content read fails in mock)
    expect(mockGeminiService.generateContent).toHaveBeenCalledWith(
      "fake-key",
      expect.stringContaining("Pinned"),
      expect.any(Array),
      "gemini-pro"
    );
  });

  it("should not save model response to history if Gemini fails", async () => {
    vi.mocked(mockSyncStorage.get).mockResolvedValue("fake-key");
    vi.mocked(mockGeminiService.generateContent).mockResolvedValue({
      error: "Safety concerns",
    });

    const response = await controller.handleMessage({
      type: MessageTypes.CHAT_MESSAGE,
      message: "Dangerous prompt",
      model: "gemini-pro",
    });

    expect(response).toEqual({ error: "Safety concerns" });
    
    // History should only contain the user message, not the model error
    const historyCall = vi.mocked(mockLocalStorage.set).mock.calls.find(call => call[0] === StorageKeys.CHAT_HISTORY);
    const savedHistory = historyCall![1] as any[];
    expect(savedHistory).toHaveLength(1);
    expect(savedHistory[0].role).toBe("user");
  });

  it("should handle PIN_TAB failure when no active tab exists", async () => {
    vi.mocked(mockTabService.query).mockResolvedValue([]);

    const response = await controller.handleMessage({ type: MessageTypes.PIN_TAB });

    expect(response).toEqual({ success: false, message: "No active tab found." });
    expect(mockLocalStorage.set).not.toHaveBeenCalledWith(StorageKeys.PINNED_CONTEXTS, expect.any(Array));
  });

  it("should handle PIN_TAB failure for restricted URLs", async () => {
    vi.mocked(mockTabService.query).mockResolvedValue([
      { url: "chrome://settings", title: "Settings" } as any
    ]);

    const response = await controller.handleMessage({ type: MessageTypes.PIN_TAB });

    expect(response).toEqual({ success: false, message: "Cannot pin restricted Chrome pages." });
  });

  it("should handle GET_CONTEXT when there is no active tab", async () => {
    vi.mocked(mockTabService.query).mockResolvedValue([]); // No active tab
    vi.mocked(mockLocalStorage.get).mockImplementation((key) => {
      if (key === StorageKeys.PINNED_CONTEXTS) return Promise.resolve([{ url: "https://p.com", title: "P" }]);
      return Promise.resolve([]);
    });

    const response = await controller.handleMessage({ type: MessageTypes.GET_CONTEXT }) as any;

    expect(response.success).toBeUndefined(); // GetContextResponse doesn't have success field usually, check structure
    expect(response.tab).toBeNull();
    expect(response.pinnedContexts).toHaveLength(1);
  });

  it("should handle REOPEN_TAB failure gracefully", async () => {
    vi.mocked(mockTabService.create).mockResolvedValue({ id: 123 } as any);
    vi.mocked(mockTabService.waitForTabComplete).mockRejectedValue(new Error("Timeout"));

    const response = await controller.handleMessage({
      type: MessageTypes.REOPEN_TAB,
      url: "https://fail.com"
    });

    expect(response).toEqual({ success: false, message: "Timeout" });
  });

  it("should handle SAVE_API_KEY correctly", async () => {
    const response = await controller.handleMessage({
      type: MessageTypes.SAVE_API_KEY,
      apiKey: "new-key",
    });

    expect(response).toEqual({ success: true });
    expect(mockSyncStorage.set).toHaveBeenCalledWith(StorageKeys.API_KEY, "new-key");
  });

  it("should handle GET_HISTORY correctly", async () => {
    const history = [{ role: "user" as const, text: "Hi" }];
    vi.mocked(mockLocalStorage.get).mockResolvedValue(history);

    const response = await controller.handleMessage({
      type: MessageTypes.GET_HISTORY,
    });

    expect(response).toEqual({
      success: true,
      history: history,
    });
  });

  it("should handle CLEAR_CHAT correctly", async () => {
    const response = await controller.handleMessage({
      type: MessageTypes.CLEAR_CHAT,
    });

    expect(response).toEqual({ success: true });
    expect(mockLocalStorage.set).toHaveBeenCalledWith(StorageKeys.CHAT_HISTORY, []);
    expect(mockLocalStorage.set).toHaveBeenCalledWith(StorageKeys.PINNED_CONTEXTS, []);
  });

  it("should handle unknown message types gracefully", async () => {
    const response = await controller.handleMessage({
      type: "UNKNOWN_TYPE" as any,
    });

    expect(response).toEqual({ error: "Unknown message type: UNKNOWN_TYPE" });
  });

  it("should catch and return errors during message handling", async () => {
    vi.mocked(mockLocalStorage.get).mockRejectedValue(new Error("Storage Error"));

    const response = await controller.handleMessage({
      type: MessageTypes.GET_HISTORY,
    });

    expect(response).toEqual({ success: false, error: "Storage Error" });
  });
});
