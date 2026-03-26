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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackgroundController } from '../../src/scripts/controllers/BackgroundController';
import { ISyncStorageService } from '../../src/scripts/services/storageService';
import { ITabService, ChromeTab } from '../../src/scripts/services/tabService';
import { ILLMService } from '../../src/scripts/services/llmService';
import { IMessageService } from '../../src/scripts/services/messageService';
import { ChatHistory } from '../../src/scripts/models/ChatHistory';
import { MemoryPipelineOrchestrator } from '../../src/scripts/memory/MemoryPipelineOrchestrator';
import { ContextManager } from '../../src/scripts/models/ContextManager';
import { MessageTypes, StorageKeys } from '../../src/scripts/constants';
import {
  GetContextResponse,
  CheckPinnedTabsResponse,
  NativeCompanionStatusResponse,
} from '../../src/scripts/types';
import { NativeCompanionService } from '../../src/scripts/nativeCompanion/nativeCompanionService';

describe('BackgroundController', () => {
  let controller: BackgroundController;
  let mockSyncStorage: ISyncStorageService;
  let mockTabService: ITabService;
  let mockGeminiService: ILLMService;
  let mockMessageService: IMessageService;
  let mockChatHistory: ChatHistory;
  let mockMemoryPipeline: MemoryPipelineOrchestrator;
  let mockContextManager: ContextManager;
  let mockNativeCompanionService: NativeCompanionService;

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
      runtime: {
        onInstalled: { addListener: vi.fn() },
        getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
      },
      sidePanel: {
        open: vi.fn(),
      },
    });

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
      removeLastMessage: vi.fn(),
      getMessages: vi.fn(),
      getRecentMessages: vi.fn(),
      clear: vi.fn(),
    } as unknown as ChatHistory;

    mockMemoryPipeline = {
      load: vi.fn(),
      clear: vi.fn(),
      buildContextPart: vi.fn(),
      recordTurn: vi.fn(),
      getEpisodeCount: vi.fn().mockReturnValue(0),
      getRecentEpisodes: vi.fn().mockReturnValue([]),
    } as unknown as MemoryPipelineOrchestrator;

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
      setSummarizationService: vi.fn(),
    } as unknown as ContextManager;

    mockNativeCompanionService = {
      start: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockReturnValue({
        connectionState: 'connected',
        extensionSessionId: 'extension-session',
        reconnectAttempt: 0,
        transport: 'native-messaging',
        hostName: 'com.maceip.native_overlay_companion',
        diagnostics: [],
        overlayStatus: 'running',
        serviceStatus: 'ready',
        supportedFeatures: ['overlay'],
      }),
    } as unknown as NativeCompanionService;

    controller = new BackgroundController(
      mockChatHistory,
      mockMemoryPipeline,
      mockContextManager,
      mockSyncStorage,
      mockTabService,
      mockGeminiService,
      mockMessageService,
      mockNativeCompanionService,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('start()', () => {
    it('should register event listeners and broadcast initial tab info', async () => {
      vi.mocked(mockTabService.query).mockResolvedValue([
        {
          id: 1,
          url: 'https://start.com',
          title: 'Start Page',
          favIconUrl: 'https://start.com/icon.png',
        } as ChromeTab,
      ]);

      await controller.start();

      expect(mockMessageService.onMessage).toHaveBeenCalled();
      expect(chrome.tabs.onActivated.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalled();
      expect(chrome.action.onClicked.addListener).toHaveBeenCalled();
      expect(mockNativeCompanionService.start).toHaveBeenCalled();

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: MessageTypes.CURRENT_TAB_INFO,
        tab: {
          id: 1,
          title: 'Start Page',
          url: 'https://start.com',
          favIconUrl: 'https://start.com/icon.png',
        },
      });
    });

    it('should handle tab activation events', () => {
      controller.start();
      const activationListener = vi.mocked(chrome.tabs.onActivated.addListener)
        .mock.calls[0][0];
      activationListener({
        tabId: 1,
        windowId: 1,
      } as chrome.tabs.TabActiveInfo);
      expect(mockTabService.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
      });
    });

    it('should handle tab updates (URL change)', () => {
      controller.start();
      const updateListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock
        .calls[0][0];
      updateListener(
        1,
        { url: 'https://new.com' } as chrome.tabs.TabChangeInfo,
        { active: true } as ChromeTab,
      );
      expect(mockTabService.query).toHaveBeenCalled();
    });

    it('should handle tab updates (Title change)', () => {
      controller.start();
      const updateListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock
        .calls[0][0];
      updateListener(
        1,
        { title: 'New Title' } as chrome.tabs.TabChangeInfo,
        { active: true } as ChromeTab,
      );
      expect(mockTabService.query).toHaveBeenCalled();
    });

    it('should update pinned tab metadata when it navigates to a new URL', async () => {
      vi.mocked(mockContextManager.isTabPinned).mockReturnValue(true);

      controller.start();
      const updateListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock
        .calls[0][0];

      await updateListener(
        101,
        { url: 'https://new.com' } as chrome.tabs.TabChangeInfo,
        {
          id: 101,
          url: 'https://new.com',
          title: 'New',
          active: true,
        } as ChromeTab,
      );

      expect(mockContextManager.updateTabMetadata).toHaveBeenCalledWith(
        101,
        'https://new.com',
        'New',
        undefined, // favIconUrl is undefined in this mock tab
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: MessageTypes.CHECK_PINNED_TABS,
      });
    });

    it('should ignore tab updates if tab is not active', () => {
      controller.start();
      const updateListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock
        .calls[0][0];
      updateListener(
        1,
        { url: 'https://bg.com' } as chrome.tabs.TabChangeInfo,
        { active: false } as ChromeTab,
      );
      expect(mockTabService.query).toHaveBeenCalledTimes(1);
    });

    it('should handle tab removal events by removing from ContextManager', async () => {
      controller.start();
      const removedListener = vi.mocked(chrome.tabs.onRemoved.addListener).mock
        .calls[0][0];

      await removedListener(123, {} as chrome.tabs.TabRemoveInfo);

      expect(mockContextManager.removeTab).toHaveBeenCalledWith(123);
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: MessageTypes.CHECK_PINNED_TABS,
      });
    });

    it('should open the side panel when the user clicks the extension icon', () => {
      controller.start();
      const clickListener = vi.mocked(chrome.action.onClicked.addListener).mock
        .calls[0][0];

      clickListener({ windowId: 456 } as chrome.tabs.Tab);

      expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 456 });
    });

    it('should log a developer error if the active tab information cannot be retrieved', async () => {
      vi.mocked(mockTabService.query).mockRejectedValue(
        new Error('Query failed'),
      );
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await controller.start();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error sending current tab info:',
        expect.any(Error),
      );
    });

    it('should ignore errors when the sidebar is closed and cannot receive tab updates', async () => {
      vi.mocked(mockTabService.query).mockResolvedValue([
        { id: 1, url: 'https://test.com', title: 'Test' } as ChromeTab,
      ]);
      vi.mocked(mockMessageService.sendMessage).mockRejectedValue(
        new Error(
          'Could not establish connection. Receiving end does not exist.',
        ),
      );
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await controller.start();

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should update the pinned tab name in the sidebar when its title changes, even if it is a background tab', async () => {
      vi.mocked(mockContextManager.isTabPinned).mockReturnValue(true);
      vi.mocked(mockTabService.query).mockResolvedValue([
        { id: 1, url: 'https://active.com', title: 'Active' } as ChromeTab,
      ]);

      await controller.start();
      vi.mocked(mockTabService.query).mockClear();
      vi.mocked(mockMessageService.sendMessage).mockClear();

      const updateListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock
        .calls[0][0];

      await updateListener(
        101,
        { title: 'New Title' } as chrome.tabs.TabChangeInfo,
        {
          id: 101,
          url: 'https://pinned.com',
          title: 'New Title',
          active: false,
        } as ChromeTab,
      );

      expect(mockContextManager.updateTabMetadata).toHaveBeenCalledWith(
        101,
        'https://pinned.com',
        'New Title',
        undefined, // favIconUrl is undefined in this mock tab
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: MessageTypes.CHECK_PINNED_TABS,
      });
      // Should not broadcast current tab info as tab is not active
      expect(mockMessageService.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageTypes.CURRENT_TAB_INFO }),
      );
    });
  });

  describe('handleMessage', () => {
    it('should return an error response if an unknown command is received from the UI', async () => {
      const response = await controller.handleMessage({
        type: 'UNKNOWN_TYPE' as unknown as keyof typeof MessageTypes,
      });

      expect(response).toEqual({ error: 'Unknown message type: UNKNOWN_TYPE' });
    });

    it('should stop generation if the user cancels before context gathering begins', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('fake-api-key');

      // Simulate abort happening immediately after adding message
      vi.mocked(mockChatHistory.addMessage).mockImplementationOnce(async () => {
        await controller.handleMessage({ type: MessageTypes.STOP_GENERATION });
      });

      const response = await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Prompt',
        model: 'gemini-pro',
        includeCurrentTab: true,
      });

      expect(response).toEqual({ aborted: true });
      expect(mockChatHistory.removeLastMessage).toHaveBeenCalled();
      expect(mockContextManager.getActiveTabContent).not.toHaveBeenCalled();
    });

    it('should stop generation if the user cancels during context gathering', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('fake-api-key');

      // Simulate abort happening during active tab context extraction
      vi.mocked(mockContextManager.getActiveTabContent).mockImplementationOnce(
        async () => {
          await controller.handleMessage({
            type: MessageTypes.STOP_GENERATION,
          });
          return [];
        },
      );

      const response = await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Prompt',
        model: 'gemini-pro',
        includeCurrentTab: true,
      });

      expect(response).toEqual({ aborted: true });
      expect(mockChatHistory.removeLastMessage).toHaveBeenCalled();
      expect(mockGeminiService.generateContent).not.toHaveBeenCalled();
    });

    it('should handle CHAT_MESSAGE correctly', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('fake-api-key');
      vi.mocked(mockGeminiService.generateContent).mockResolvedValue({
        reply: 'Hello from Gemini',
      });
      vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue([
        { type: 'text', text: 'Active Content' },
      ]);
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue([
        { type: 'text', text: 'Pinned Content' },
      ]);
      vi.mocked(mockChatHistory.getRecentMessages).mockReturnValue([]);
      vi.mocked(mockMemoryPipeline.buildContextPart).mockResolvedValue(null);

      const response = await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Hi',
        model: 'gemini-pro',
        includeCurrentTab: true,
      });

      expect(response).toEqual({ reply: 'Hello from Gemini' });
      expect(mockGeminiService.generateContent).toHaveBeenCalled();
      expect(mockContextManager.getAllContent).toHaveBeenCalledWith(
        expect.any(AbortSignal),
        'Hi',
      );
      expect(mockChatHistory.addMessage).toHaveBeenCalledWith({
        role: 'user',
        text: 'Hi',
      });
      expect(mockChatHistory.addMessage).toHaveBeenCalledWith({
        role: 'model',
        text: 'Hello from Gemini',
      });
      expect(mockMemoryPipeline.recordTurn).toHaveBeenCalledWith(
        'Hi',
        'Hello from Gemini',
      );
    });

    it('should ensure JIT loading is called on every message', async () => {
      await controller.handleMessage({ type: MessageTypes.GET_HISTORY });

      expect(mockChatHistory.load).toHaveBeenCalled();
      expect(mockMemoryPipeline.load).toHaveBeenCalled();
      expect(mockContextManager.load).toHaveBeenCalled();
    });

    it('should abort generation when STOP_GENERATION message is received', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('fake-key');
      vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue([]);
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue([]);
      vi.mocked(mockChatHistory.getRecentMessages).mockReturnValue([]);
      vi.mocked(mockMemoryPipeline.buildContextPart).mockResolvedValue(null);

      let requestStartedResolve: () => void;
      const requestStartedPromise = new Promise<void>(
        (r) => (requestStartedResolve = r),
      );

      vi.mocked(mockGeminiService.generateContent).mockImplementation(
        async (key, ctx, hist, model, signal) => {
          requestStartedResolve();
          return new Promise((_, reject) => {
            const abortHandler = () =>
              reject(new DOMException('Aborted', 'AbortError'));
            if (signal?.aborted) return abortHandler();
            signal?.addEventListener('abort', abortHandler);
          });
        },
      );

      // Start the request
      const chatPromise = controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Long prompt',
        model: 'gemini-pro',
        includeCurrentTab: false,
      });

      // Wait until we know generateContent has been called
      await requestStartedPromise;

      // Send STOP command
      await controller.handleMessage({ type: MessageTypes.STOP_GENERATION });

      // Verify the chat message returns aborted
      const response = await chatPromise;
      expect(response).toEqual({ aborted: true });
      expect(mockChatHistory.removeLastMessage).toHaveBeenCalled();
    });

    it('should abort generation during context gathering', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('fake-key');
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue([]);
      vi.mocked(mockChatHistory.getRecentMessages).mockReturnValue([]);
      vi.mocked(mockMemoryPipeline.buildContextPart).mockResolvedValue(null);

      let contextGatheringStartedResolve: () => void;
      const contextGatheringStartedPromise = new Promise<void>(
        (r) => (contextGatheringStartedResolve = r),
      );

      // Simulate slow context gathering
      vi.mocked(mockContextManager.getActiveTabContent).mockImplementation(
        async () => {
          contextGatheringStartedResolve();
          // Wait forever (or until aborted, though this mock doesn't handle abort logic itself,
          // the controller checks the signal AFTER this returns)
          // To simulate the "check after return" logic, we just return after a delay.
          await new Promise((r) => setTimeout(r, 50));
          return [];
        },
      );

      // Start the request
      const chatPromise = controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Prompt',
        model: 'gemini-pro',
        includeCurrentTab: true,
      });

      // Wait until context gathering starts
      await contextGatheringStartedPromise;

      // Send STOP command immediately
      await controller.handleMessage({ type: MessageTypes.STOP_GENERATION });

      const response = await chatPromise;
      expect(response).toEqual({ aborted: true });
      expect(mockGeminiService.generateContent).not.toHaveBeenCalled();
      expect(mockChatHistory.removeLastMessage).toHaveBeenCalled();
    });

    it('should handle aborted generation correctly (AbortError exception)', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('fake-key');
      vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue([]);
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue([]);
      vi.mocked(mockGeminiService.generateContent).mockRejectedValue(
        new DOMException('The user aborted a request.', 'AbortError'),
      );
      vi.mocked(mockChatHistory.getRecentMessages).mockReturnValue([]);
      vi.mocked(mockMemoryPipeline.buildContextPart).mockResolvedValue(null);

      const response = await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Prompt',
        model: 'gemini-pro',
        includeCurrentTab: false,
      });

      expect(response).toEqual({ aborted: true });
      expect(mockChatHistory.removeLastMessage).toHaveBeenCalled();
      // Ensure model response was NOT added
      expect(mockChatHistory.addMessage).toHaveBeenCalledTimes(1); // Only user message
      expect(mockChatHistory.addMessage).toHaveBeenCalledWith({
        role: 'user',
        text: 'Prompt',
      });
    });

    it('should handle CHAT_MESSAGE with composed context', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('fake-key');
      vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue([
        { type: 'text', text: 'Active Content' },
      ]);
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue([
        { type: 'text', text: 'Pinned Content' },
      ]);
      vi.mocked(mockChatHistory.getRecentMessages).mockReturnValue([]);
      vi.mocked(mockMemoryPipeline.buildContextPart).mockResolvedValue({
        type: 'text',
        text: 'Memory Context',
      });
      vi.mocked(mockGeminiService.generateContent).mockResolvedValue({
        reply: 'Responded',
      });

      await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Test context',
        model: 'gemini-pro',
        includeCurrentTab: true,
      });

      expect(mockGeminiService.generateContent).toHaveBeenCalledWith(
        'fake-key',
        [
          { type: 'text', text: 'Memory Context' },
          { type: 'text', text: 'Active Content' },
          { type: 'text', text: 'Pinned Content' },
        ],
        expect.any(Array),
        'gemini-pro',
        expect.any(AbortSignal),
      );
    });

    it('should respect includeCurrentTab=false in CHAT_MESSAGE', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('fake-key');
      vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue([
        { type: 'text', text: 'Active Content' },
      ]);
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue([
        { type: 'text', text: 'Pinned Content' },
      ]);
      vi.mocked(mockChatHistory.getRecentMessages).mockReturnValue([]);
      vi.mocked(mockMemoryPipeline.buildContextPart).mockResolvedValue({
        type: 'text',
        text: 'Memory Context',
      });
      vi.mocked(mockGeminiService.generateContent).mockResolvedValue({
        reply: 'Responded',
      });

      await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Test context',
        model: 'gemini-pro',
        includeCurrentTab: false,
      });

      expect(mockGeminiService.generateContent).toHaveBeenCalledWith(
        'fake-key',
        [
          { type: 'text', text: 'Memory Context' },
          { type: 'text', text: 'Pinned Content' },
        ], // Active content should be excluded
        expect.any(Array),
        'gemini-pro',
        expect.any(AbortSignal),
      );
      expect(mockContextManager.getActiveTabContent).not.toHaveBeenCalled();
    });

    it('should not save model response to history if Gemini fails', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('fake-key');
      vi.mocked(mockGeminiService.generateContent).mockResolvedValue({
        error: 'Safety concerns',
      });
      vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue([]);
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue([]);
      vi.mocked(mockChatHistory.getRecentMessages).mockReturnValue([]);
      vi.mocked(mockMemoryPipeline.buildContextPart).mockResolvedValue(null);

      const response = await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Dangerous prompt',
        model: 'gemini-pro',
        includeCurrentTab: true,
      });

      expect(response).toEqual({ error: 'Safety concerns' });
      expect(mockChatHistory.addMessage).toHaveBeenCalledWith({
        role: 'user',
        text: 'Dangerous prompt',
      });
      expect(mockChatHistory.addMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ role: 'model' }),
      );
    });

    it('should handle PIN_TAB failure when no active tab exists', async () => {
      vi.mocked(mockTabService.query).mockResolvedValue([]);
      const response = await controller.handleMessage({
        type: MessageTypes.PIN_TAB,
      });
      expect(response).toEqual({
        success: false,
        message: 'No active tab found.',
      });
    });

    it('should handle PIN_TAB failure for restricted URLs', async () => {
      vi.mocked(mockTabService.query).mockResolvedValue([
        { id: 1, url: 'chrome://settings', title: 'Settings' } as ChromeTab,
      ]);

      const response = await controller.handleMessage({
        type: MessageTypes.PIN_TAB,
      });
      expect(response).toEqual({
        success: false,
        message: 'Cannot pin restricted URL',
      });
    });

    it('should return error message when pinning fails due to an error', async () => {
      vi.mocked(mockContextManager.addTab).mockRejectedValue(
        new Error('Cannot pin a tab with no URL.'),
      );
      // Ensure mockTabService.query returns a valid tab so handlePinTab proceeds to call addTab
      vi.mocked(mockTabService.query).mockResolvedValue([
        { id: 101, url: 'https://pin.com', title: 'Pin Me' } as ChromeTab,
      ]);

      const response = await controller.handleMessage({
        type: MessageTypes.PIN_TAB,
      });

      expect(response).toEqual({
        success: false,
        message: 'Cannot pin a tab with no URL.',
      });
    });

    it('should handle PIN_TAB successfully', async () => {
      vi.mocked(mockTabService.query).mockResolvedValue([
        { id: 101, url: 'https://pin.com', title: 'Pin Me' } as ChromeTab,
      ]);
      const response = await controller.handleMessage({
        type: MessageTypes.PIN_TAB,
      });
      expect(response).toEqual({ success: true });
      expect(mockContextManager.addTab).toHaveBeenCalledWith(
        expect.objectContaining({ tabId: 101 }),
      );
    });

    it('should handle UNPIN_TAB correctly', async () => {
      const response = await controller.handleMessage({
        type: MessageTypes.UNPIN_TAB,
        tabId: 101,
      });

      expect(response).toEqual({ success: true });
      expect(mockContextManager.removeTab).toHaveBeenCalledWith(101);
    });

    it('should handle GET_CONTEXT correctly with mixed favicons', async () => {
      vi.mocked(mockTabService.query).mockResolvedValue([
        {
          id: 1,
          url: 'https://a.com',
          title: 'A',
          favIconUrl: 'https://a.com/favicon.ico',
        } as ChromeTab,
      ]);
      vi.mocked(mockContextManager.getPinnedTabs).mockReturnValue([
        {
          tabId: 101,
          url: 'https://p1.com',
          title: 'P1',
          favIconUrl: 'https://p1.com/icon.png',
        },
        { tabId: 102, url: 'https://p2.com', title: 'P2' },
      ] as unknown as TabContext[]);

      const response = (await controller.handleMessage({
        type: MessageTypes.GET_CONTEXT,
      })) as GetContextResponse;

      expect(response.tab).toEqual({
        id: 1,
        url: 'https://a.com',
        title: 'A',
        favIconUrl: 'https://a.com/favicon.ico',
      });
      expect(response.pinnedContexts).toEqual([
        {
          id: 101,
          url: 'https://p1.com',
          title: 'P1',
          favIconUrl: 'https://p1.com/icon.png',
        },
        { id: 102, url: 'https://p2.com', title: 'P2', favIconUrl: undefined },
      ]);
    });

    it('should handle CHECK_PINNED_TABS correctly', async () => {
      vi.mocked(mockContextManager.getPinnedTabs).mockReturnValue([]);
      const response = (await controller.handleMessage({
        type: MessageTypes.CHECK_PINNED_TABS,
      })) as CheckPinnedTabsResponse;
      expect(response.success).toBe(true);
      expect(response.pinnedContexts).toEqual([]);
    });

    it('should return native companion status', async () => {
      const response = (await controller.handleMessage({
        type: MessageTypes.NATIVE_COMPANION_STATUS,
      })) as NativeCompanionStatusResponse;

      expect(response).toEqual({
        success: true,
        state: {
          connectionState: 'connected',
          extensionSessionId: 'extension-session',
          reconnectAttempt: 0,
          transport: 'native-messaging',
          hostName: 'com.maceip.native_overlay_companion',
          diagnostics: [],
          overlayStatus: 'running',
          serviceStatus: 'ready',
          supportedFeatures: ['overlay'],
        },
      });
    });

    it('should handle SAVE_API_KEY correctly', async () => {
      const response = await controller.handleMessage({
        type: MessageTypes.SAVE_API_KEY,
        apiKey: 'new-key',
      });
      expect(response).toEqual({ success: true });
      expect(mockSyncStorage.set).toHaveBeenCalledWith(
        StorageKeys.API_KEY,
        'new-key',
      );
    });

    it('should handle GET_HISTORY correctly', async () => {
      const history = [{ role: 'user' as const, text: 'Hi' }];
      vi.mocked(mockChatHistory.getMessages).mockReturnValue(history);

      const response = await controller.handleMessage({
        type: MessageTypes.GET_HISTORY,
      });

      expect(response).toEqual({
        success: true,
        history: history,
      });
    });

    it('should handle CLEAR_CHAT correctly', async () => {
      const response = await controller.handleMessage({
        type: MessageTypes.CLEAR_CHAT,
      });
      expect(response).toEqual({ success: true });
      expect(mockChatHistory.clear).toHaveBeenCalled();
      expect(mockMemoryPipeline.clear).toHaveBeenCalled();
      expect(mockContextManager.clear).toHaveBeenCalled();
    });

    it('should handle unknown message types gracefully', async () => {
      const response = await controller.handleMessage({
        type: 'UNKNOWN_TYPE' as unknown as keyof typeof MessageTypes,
      });

      expect(response).toEqual({ error: 'Unknown message type: UNKNOWN_TYPE' });
    });

    it('should catch and return errors during message handling', async () => {
      vi.mocked(mockChatHistory.load).mockRejectedValue(
        new Error('Load Error'),
      );

      const response = await controller.handleMessage({
        type: MessageTypes.GET_HISTORY,
      });

      expect(response).toEqual({ success: false, error: 'Load Error' });
    });
  });
});
