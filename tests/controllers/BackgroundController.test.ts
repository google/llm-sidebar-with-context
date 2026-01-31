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
import { BackgroundController } from "../../src/scripts/controllers/BackgroundController";
import { ILocalStorageService, ISyncStorageService } from "../../src/scripts/services/storageService";
import { ITabService } from "../../src/scripts/services/tabService";
import { IGeminiService } from "../../src/scripts/services/geminiService";
import { IMessageService } from "../../src/scripts/services/messageService";
import { ChatHistory } from "../../src/scripts/models/ChatHistory";
import { ContextManager } from "../../src/scripts/models/ContextManager";
import { MessageTypes, StorageKeys } from "../../src/scripts/constants";

describe("BackgroundController", () => {
  let controller: BackgroundController;
  let mockLocalStorage: ILocalStorageService;
  let mockSyncStorage: ISyncStorageService;
  let mockTabService: ITabService;
  let mockGeminiService: IGeminiService;
  let mockMessageService: IMessageService;
  let mockChatHistory: ChatHistory;
  let mockContextManager: ContextManager;

  beforeEach(() => {
    vi.resetAllMocks();
    
    vi.stubGlobal('chrome', {
      tabs: {
        onActivated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
      },
      action: {
        onClicked: { addListener: vi.fn() },
      },
      sidePanel: {
        open: vi.fn(),
      }
    });

    mockLocalStorage = { get: vi.fn(), set: vi.fn() };
    mockSyncStorage = { get: vi.fn(), set: vi.fn() };
    mockTabService = {
      query: vi.fn().mockResolvedValue([]),
      executeScript: vi.fn(),
      create: vi.fn(),
      waitForTabComplete: vi.fn(),
      getTab: vi.fn(),
    };
    mockGeminiService = { generateContent: vi.fn() };
    mockMessageService = {
      sendMessage: vi.fn().mockResolvedValue({}),
      onMessage: vi.fn(),
    };

    // Create mocks for models
    mockChatHistory = {
      load: vi.fn(),
      addMessage: vi.fn(),
      getMessages: vi.fn(),
      clear: vi.fn(),
    } as unknown as ChatHistory;

    mockContextManager = {
      load: vi.fn(),
      getActiveTabContent: vi.fn(),
      getAllContent: vi.fn(),
      getPinnedTabs: vi.fn(),
      addTab: vi.fn(),
      removeTab: vi.fn(),
      clear: vi.fn(),
      isTabPinned: vi.fn(),
      updateTabMetadata: vi.fn(),
    } as unknown as ContextManager;

    controller = new BackgroundController(
      mockChatHistory,
      mockContextManager,
      mockSyncStorage,
      mockTabService,
      mockGeminiService,
      mockMessageService
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("start()", () => {
    it("should register event listeners and broadcast initial tab info", async () => {
      vi.mocked(mockTabService.query).mockResolvedValue([
        { id: 1, url: "https://start.com", title: "Start Page" } as any,
      ]);

      await controller.start();

      expect(mockMessageService.onMessage).toHaveBeenCalled();
      expect(chrome.tabs.onActivated.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalled();
      expect(chrome.action.onClicked.addListener).toHaveBeenCalled();

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: MessageTypes.CURRENT_TAB_INFO,
        tab: { id: 1, title: "Start Page", url: "https://start.com" },
      });
    });

    it("should handle tab activation events", () => {
      controller.start();
      const activationListener = vi.mocked(chrome.tabs.onActivated.addListener).mock.calls[0][0];
      activationListener({ tabId: 1, windowId: 1 } as any);
      expect(mockTabService.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    });

    it("should handle tab updates (URL change)", () => {
      controller.start();
      const updateListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock.calls[0][0];
      updateListener(1, { url: "https://new.com" } as any, { active: true } as any);
      expect(mockTabService.query).toHaveBeenCalled();
    });

    it("should handle tab updates (Title change)", () => {
      controller.start();
      const updateListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock.calls[0][0];
      updateListener(1, { title: "New Title" } as any, { active: true } as any);
      expect(mockTabService.query).toHaveBeenCalled();
    });

    it("should update pinned tab metadata when it navigates to a new URL", async () => {
      vi.mocked(mockContextManager.isTabPinned).mockReturnValue(true);

      controller.start();
      const updateListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock.calls[0][0];
      
      await updateListener(101, { url: "https://new.com" } as any, { id: 101, url: "https://new.com", title: "New", active: true } as any);
      
      expect(mockContextManager.updateTabMetadata).toHaveBeenCalledWith(101, "https://new.com", "New");
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({ type: MessageTypes.CHECK_PINNED_TABS });
    });

    it("should ignore tab updates if tab is not active", () => {
      controller.start();
      const updateListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock.calls[0][0];
      updateListener(1, { url: "https://bg.com" } as any, { active: false } as any);
      expect(mockTabService.query).toHaveBeenCalledTimes(1); 
    });

    it("should handle tab removal events by removing from ContextManager", async () => {
        controller.start();
        const removedListener = vi.mocked(chrome.tabs.onRemoved.addListener).mock.calls[0][0];
        
        await removedListener(123, {} as any);
        
        expect(mockContextManager.removeTab).toHaveBeenCalledWith(123);
        expect(mockMessageService.sendMessage).toHaveBeenCalledWith({ type: MessageTypes.CHECK_PINNED_TABS });
    });
  });

  describe("handleMessage", () => {
    it("should handle CHAT_MESSAGE correctly", async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue("fake-api-key");
      vi.mocked(mockGeminiService.generateContent).mockResolvedValue({
        reply: "Hello from Gemini",
      });
      vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue("Active Content");
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue("Pinned Content");
      vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);

      const response = await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: "Hi",
        model: "gemini-pro",
        includeCurrentTab: true,
      });

      expect(response).toEqual({ reply: "Hello from Gemini" });
      expect(mockGeminiService.generateContent).toHaveBeenCalled();
      expect(mockChatHistory.addMessage).toHaveBeenCalledWith({ role: "user", text: "Hi" });
      expect(mockChatHistory.addMessage).toHaveBeenCalledWith({ role: "model", text: "Hello from Gemini" });
    });

    it("should ensure JIT loading is called on every message", async () => {
      await controller.handleMessage({ type: MessageTypes.GET_HISTORY });
      
      expect(mockChatHistory.load).toHaveBeenCalled();
      expect(mockContextManager.load).toHaveBeenCalled();
    });

    it("should handle CHAT_MESSAGE with composed context", async () => {
        vi.mocked(mockSyncStorage.get).mockResolvedValue("fake-key");
        vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue("Active Content");
        vi.mocked(mockContextManager.getAllContent).mockResolvedValue("Pinned Content");
        vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);
        vi.mocked(mockGeminiService.generateContent).mockResolvedValue({ reply: "Responded" });
    
        await controller.handleMessage({
          type: MessageTypes.CHAT_MESSAGE,
          message: "Test context",
          model: "gemini-pro",
          includeCurrentTab: true,
        });
    
        expect(mockGeminiService.generateContent).toHaveBeenCalledWith(
          "fake-key",
          "Active ContentPinned Content",
          expect.any(Array),
          "gemini-pro"
        );
    });

    it("should respect includeCurrentTab=false in CHAT_MESSAGE", async () => {
        vi.mocked(mockSyncStorage.get).mockResolvedValue("fake-key");
        vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue("Active Content");
        vi.mocked(mockContextManager.getAllContent).mockResolvedValue("Pinned Content");
        vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);
        vi.mocked(mockGeminiService.generateContent).mockResolvedValue({ reply: "Responded" });
    
        await controller.handleMessage({
          type: MessageTypes.CHAT_MESSAGE,
          message: "Test context",
          model: "gemini-pro",
          includeCurrentTab: false,
        });
    
        expect(mockGeminiService.generateContent).toHaveBeenCalledWith(
          "fake-key",
          "Pinned Content", // Active content should be excluded
          expect.any(Array),
          "gemini-pro"
        );
        expect(mockContextManager.getActiveTabContent).not.toHaveBeenCalled();
    });

    it("should not save model response to history if Gemini fails", async () => {
        vi.mocked(mockSyncStorage.get).mockResolvedValue("fake-key");
        vi.mocked(mockGeminiService.generateContent).mockResolvedValue({
          error: "Safety concerns",
        });
        vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue("");
        vi.mocked(mockContextManager.getAllContent).mockResolvedValue("");
        vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);
    
        const response = await controller.handleMessage({
          type: MessageTypes.CHAT_MESSAGE,
          message: "Dangerous prompt",
          model: "gemini-pro",
          includeCurrentTab: true,
        });
    
        expect(response).toEqual({ error: "Safety concerns" });
        expect(mockChatHistory.addMessage).toHaveBeenCalledWith({ role: "user", text: "Dangerous prompt" });
        expect(mockChatHistory.addMessage).not.toHaveBeenCalledWith(expect.objectContaining({ role: "model" }));
    });

    it("should handle PIN_TAB failure when no active tab exists", async () => {
      vi.mocked(mockTabService.query).mockResolvedValue([]);
      const response = await controller.handleMessage({ type: MessageTypes.PIN_TAB });
      expect(response).toEqual({ success: false, message: "No active tab found." });
    });

    it("should handle PIN_TAB failure for restricted URLs", async () => {
      vi.mocked(mockTabService.query).mockResolvedValue([
        { id: 1, url: "chrome://settings", title: "Settings" } as any
      ]);

      const response = await controller.handleMessage({ type: MessageTypes.PIN_TAB });
      expect(response).toEqual({ success: false, message: "Cannot pin restricted URL" });
    });

    it("should handle PIN_TAB successfully", async () => {
        vi.mocked(mockTabService.query).mockResolvedValue([
          { id: 101, url: "https://pin.com", title: "Pin Me" } as any
        ]);
        const response = await controller.handleMessage({ type: MessageTypes.PIN_TAB });
        expect(response).toEqual({ success: true });
        expect(mockContextManager.addTab).toHaveBeenCalledWith(expect.objectContaining({ tabId: 101 }));
    });

    it("should handle UNPIN_TAB correctly", async () => {
        const response = await controller.handleMessage({ type: MessageTypes.UNPIN_TAB, tabId: 101 });

        expect(response).toEqual({ success: true });
        expect(mockContextManager.removeTab).toHaveBeenCalledWith(101);
    });

    it("should handle GET_CONTEXT correctly", async () => {
      vi.mocked(mockTabService.query).mockResolvedValue([{ id: 1, url: "https://a.com", title: "A" } as any]);
      vi.mocked(mockContextManager.getPinnedTabs).mockReturnValue([]);

      const response = await controller.handleMessage({ type: MessageTypes.GET_CONTEXT }) as any;

      expect(response.tab).toEqual({ id: 1, url: "https://a.com", title: "A" });
      expect(response.pinnedContexts).toEqual([]);
    });

    it("should handle CHECK_PINNED_TABS correctly", async () => {
      vi.mocked(mockContextManager.getPinnedTabs).mockReturnValue([]);
      const response = await controller.handleMessage({ type: MessageTypes.CHECK_PINNED_TABS }) as any;
      expect(response.success).toBe(true);
      expect(response.pinnedContexts).toEqual([]);
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
        vi.mocked(mockChatHistory.getMessages).mockReturnValue(history);
    
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
      expect(mockChatHistory.clear).toHaveBeenCalled();
      expect(mockContextManager.clear).toHaveBeenCalled();
    });

    it("should handle unknown message types gracefully", async () => {
        const response = await controller.handleMessage({
          type: "UNKNOWN_TYPE" as any,
        });
    
        expect(response).toEqual({ error: "Unknown message type: UNKNOWN_TYPE" });
    });
    
    it("should catch and return errors during message handling", async () => {
        vi.mocked(mockChatHistory.load).mockRejectedValue(new Error("Load Error"));
    
        const response = await controller.handleMessage({
          type: MessageTypes.GET_HISTORY,
        });
    
        expect(response).toEqual({ success: false, error: "Load Error" });
    });
  });
});
