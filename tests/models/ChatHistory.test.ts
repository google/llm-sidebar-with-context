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
import { ChatHistory } from "../../src/scripts/models/ChatHistory";
import { ILocalStorageService } from "../../src/scripts/services/storageService";
import { StorageKeys } from "../../src/scripts/constants";
import { ChatMessage } from "../../src/scripts/types";

describe("ChatHistory", () => {
  let chatHistory: ChatHistory;
  let mockLocalStorageService: ILocalStorageService;

  beforeEach(() => {
    // Create a mock storage service for each test
    mockLocalStorageService = {
      get: vi.fn(),
      set: vi.fn(),
    };
    chatHistory = new ChatHistory(mockLocalStorageService);
  });

  it("should initialize with an empty history", () => {
    expect(chatHistory.getMessages()).toEqual([]);
  });

  it("should add messages sequentially and persist correctly", async () => {
    const msg1: ChatMessage = { role: "user", text: "Hello" };
    const msg2: ChatMessage = { role: "model", text: "Hi there" };

    // 1. Add first message
    await chatHistory.addMessage(msg1);
    expect(chatHistory.getMessages()).toEqual([msg1]);
    expect(mockLocalStorageService.set).toHaveBeenCalledTimes(1);
    expect(mockLocalStorageService.set).toHaveBeenCalledWith(
      StorageKeys.CHAT_HISTORY,
      [msg1]
    );

    // 2. Add second message
    await chatHistory.addMessage(msg2);
    expect(chatHistory.getMessages()).toEqual([msg1, msg2]);
    expect(mockLocalStorageService.set).toHaveBeenCalledTimes(2);
    expect(mockLocalStorageService.set).toHaveBeenLastCalledWith(
      StorageKeys.CHAT_HISTORY,
      [msg1, msg2]
    );
  });

  it("should load history from storage", async () => {
    const storedMessages: ChatMessage[] = [
      { role: "user", text: "Hi" },
      { role: "model", text: "Hello there" },
    ];
    
    // Mock the storage.get return value
    vi.mocked(mockLocalStorageService.get).mockResolvedValue(storedMessages);

    await chatHistory.load();

    expect(mockLocalStorageService.get).toHaveBeenCalledWith(StorageKeys.CHAT_HISTORY);
    expect(chatHistory.getMessages()).toEqual(storedMessages);
  });

  it("should ignore invalid data in storage", async () => {
    // Mock storage returning a non-array (e.g., corrupted data)
    vi.mocked(mockLocalStorageService.get).mockResolvedValue({ some: "object" });

    await chatHistory.load();

    // Should remain empty (default state), not crash
    expect(chatHistory.getMessages()).toEqual([]);
  });

  it("should handle undefined/null in storage gracefully", async () => {
    vi.mocked(mockLocalStorageService.get).mockResolvedValue(undefined);

    await chatHistory.load();

    expect(chatHistory.getMessages()).toEqual([]);
  });

  it("should clear history and update storage", async () => {
    // Setup some initial state
    await chatHistory.addMessage({ role: "user", text: "Delete me" });
    
    // Clear
    await chatHistory.clear();

    expect(chatHistory.getMessages()).toEqual([]);
    expect(mockLocalStorageService.set).toHaveBeenCalledWith(
      StorageKeys.CHAT_HISTORY,
      []
    );
  });

  it("should return a copy of messages to prevent external mutation", async () => {
    await chatHistory.addMessage({ role: "user", text: "Original" });
    
    const messages = chatHistory.getMessages();
    messages.push({ role: "model", text: "Hacker" }); // Mutate the array

    // The internal state should remain unchanged
    expect(chatHistory.getMessages()).toHaveLength(1);
  });

  it("should remove the last message and update storage", async () => {
    await chatHistory.addMessage({ role: "user", text: "1" });
    await chatHistory.addMessage({ role: "model", text: "2" });

    await chatHistory.removeLastMessage();

    expect(chatHistory.getMessages()).toEqual([{ role: "user", text: "1" }]);
    expect(mockLocalStorageService.set).toHaveBeenLastCalledWith(
      StorageKeys.CHAT_HISTORY,
      [{ role: "user", text: "1" }]
    );
  });

  it("should propagate errors if storage save fails", async () => {
    const error = new Error("Storage quota exceeded");
    vi.mocked(mockLocalStorageService.set).mockRejectedValue(error);

    const message: ChatMessage = { role: "user", text: "Fail me" };

    // Expect the promise to reject with the error
    await expect(chatHistory.addMessage(message)).rejects.toThrow(error);
  });
});
