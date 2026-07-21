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
import { IGeminiService } from '../../src/scripts/services/geminiService';
import { IOllamaService } from '../../src/scripts/services/ollamaService';
import { IDNRService } from '../../src/scripts/services/dnrService';
import { GoogleGeminiChatProvider } from '../../src/scripts/services/googleGeminiChatProvider';
import { OllamaChatProvider } from '../../src/scripts/services/ollamaChatProvider';
import { IMessageService } from '../../src/scripts/services/messageService';
import { ChatHistory } from '../../src/scripts/models/ChatHistory';
import { ContextManager } from '../../src/scripts/models/ContextManager';
import {
  MessageTypes,
  StorageKeys,
  DEFAULT_MODEL,
  Providers,
} from '../../src/scripts/constants';
import {
  ExtensionMessage,
  GetContextResponse,
  CheckPinnedTabsResponse,
} from '../../src/scripts/types';
import { TabContext } from '../../src/scripts/models/TabContext';

describe('BackgroundController', () => {
  let controller: BackgroundController;
  let mockSyncStorage: ISyncStorageService;
  let mockTabService: ITabService;
  let mockGeminiService: IGeminiService;
  let mockOllamaService: IOllamaService;
  let mockDNRService: IDNRService;
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
      windows: {
        onFocusChanged: { addListener: vi.fn() },
        WINDOW_ID_NONE: -1,
      },
      action: {
        onClicked: { addListener: vi.fn() },
      },
      runtime: {
        onInstalled: { addListener: vi.fn() },
      },
      sidePanel: {
        open: vi.fn(),
      },
    });

    mockSyncStorage = { get: vi.fn(), set: vi.fn() };
    mockTabService = {
      query: vi.fn().mockResolvedValue([]),
      executeScript: vi.fn(),
      executeScriptFile: vi.fn(),
      create: vi.fn(),
      waitForTabComplete: vi.fn(),
      getTab: vi.fn(),
    };
    mockGeminiService = { generateContent: vi.fn() };
    mockOllamaService = { listModels: vi.fn(), generateContent: vi.fn() };
    mockDNRService = {
      ensureRule: vi.fn(),
      setTestRule: vi.fn(),
      removeTestRule: vi.fn(),
    };
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
      clear: vi.fn(),
    } as unknown as ChatHistory;

    mockContextManager = {
      load: vi.fn(),
      getActiveTabContent: vi.fn(),
      getAllContent: vi.fn(),
      getPinnedTabs: vi.fn().mockReturnValue([]),
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
      mockMessageService,
      {
        [Providers.GOOGLE_GEMINI]: new GoogleGeminiChatProvider(
          mockGeminiService,
          mockSyncStorage,
        ),
        [Providers.OLLAMA]: new OllamaChatProvider(
          mockOllamaService,
          mockDNRService,
          mockSyncStorage,
        ),
      },
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
      expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();

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
      } as chrome.tabs.OnActivatedInfo);
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
        { url: 'https://new.com' } as chrome.tabs.OnUpdatedInfo,
        { active: true } as unknown as chrome.tabs.Tab,
      );
      expect(mockTabService.query).toHaveBeenCalled();
    });

    it('should handle tab updates (Title change)', () => {
      controller.start();
      const updateListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock
        .calls[0][0];
      updateListener(
        1,
        { title: 'New Title' } as chrome.tabs.OnUpdatedInfo,
        { active: true } as unknown as chrome.tabs.Tab,
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
        { url: 'https://new.com' } as chrome.tabs.OnUpdatedInfo,
        {
          id: 101,
          url: 'https://new.com',
          title: 'New',
          active: true,
        } as unknown as chrome.tabs.Tab,
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
        { url: 'https://bg.com' } as chrome.tabs.OnUpdatedInfo,
        { active: false } as unknown as chrome.tabs.Tab,
      );
      expect(mockTabService.query).toHaveBeenCalledTimes(1);
    });

    it('should handle tab removal events by removing from ContextManager', async () => {
      controller.start();
      const removedListener = vi.mocked(chrome.tabs.onRemoved.addListener).mock
        .calls[0][0];

      await removedListener(123, {} as chrome.tabs.OnRemovedInfo);

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
        { title: 'New Title' } as chrome.tabs.OnUpdatedInfo,
        {
          id: 101,
          url: 'https://pinned.com',
          title: 'New Title',
          active: false,
        } as unknown as chrome.tabs.Tab,
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

    it('should initialize default model on install if not present', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue(undefined);

      controller.start();
      const installListener = vi.mocked(chrome.runtime.onInstalled.addListener)
        .mock.calls[0][0];

      await installListener({
        reason: 'install',
      } as chrome.runtime.InstalledDetails);

      expect(mockSyncStorage.set).toHaveBeenCalledWith(
        StorageKeys.GEMINI_MODEL,
        DEFAULT_MODEL,
      );
    });

    it('should not overwrite existing model choice on update', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('gemini-2.5-pro');

      controller.start();
      const installListener = vi.mocked(chrome.runtime.onInstalled.addListener)
        .mock.calls[0][0];

      await installListener({
        reason: 'update',
      } as chrome.runtime.InstalledDetails);

      expect(mockSyncStorage.set).not.toHaveBeenCalledWith(
        StorageKeys.GEMINI_MODEL,
        expect.any(String),
      );
    });

    it('should reset to default if the saved model is no longer supported', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('gemini-2.5-flash-lite');

      controller.start();
      const installListener = vi.mocked(chrome.runtime.onInstalled.addListener)
        .mock.calls[0][0];

      await installListener({
        reason: 'update',
      } as chrome.runtime.InstalledDetails);

      expect(mockSyncStorage.set).toHaveBeenCalledWith(
        StorageKeys.GEMINI_MODEL,
        DEFAULT_MODEL,
      );
    });
  });

  describe('multi-window current tab tracking', () => {
    it('should show the focused window tab again after switching back from another window', async () => {
      // Fake browser: two windows, one active tab each, plus which window
      // currently has focus. query() answers the way Chrome does from a
      // service worker: currentWindow/lastFocusedWindow resolve to the
      // window that has focus.
      const tabA = {
        id: 1,
        windowId: 1,
        active: true,
        url: 'https://tab-a.com',
        title: 'Tab A',
      };
      const tabB = {
        id: 2,
        windowId: 2,
        active: true,
        url: 'https://tab-b.com',
        title: 'Tab B',
      };
      const world = { focusedWindowId: 1, tabs: [tabA] };

      vi.mocked(mockTabService.query).mockImplementation(
        async (queryInfo: chrome.tabs.QueryInfo) => {
          let result = world.tabs;
          if (queryInfo.active) {
            result = result.filter((t) => t.active);
          }
          if (queryInfo.currentWindow || queryInfo.lastFocusedWindow) {
            result = result.filter((t) => t.windowId === world.focusedWindowId);
          }
          return result as ChromeTab[];
        },
      );

      const dispatchActivated = async (info: chrome.tabs.OnActivatedInfo) => {
        for (const [listener] of vi.mocked(chrome.tabs.onActivated.addListener)
          .mock.calls) {
          await listener(info);
        }
      };
      const dispatchWindowFocusChanged = async (windowId: number) => {
        for (const [listener] of vi.mocked(
          chrome.windows.onFocusChanged.addListener,
        ).mock.calls) {
          await listener(windowId);
        }
      };

      // Window A is open with Tab A; the sidebar is opened there.
      await controller.start();

      // User opens Window B with Tab B: Tab B activates and Window B
      // takes focus.
      world.tabs.push(tabB);
      world.focusedWindowId = 2;
      await dispatchActivated({ tabId: tabB.id, windowId: tabB.windowId });
      await dispatchWindowFocusChanged(2);

      // User clicks back into Window A. Chrome fires only a window focus
      // change — no tab activation, since Tab A was already active in
      // its window.
      world.focusedWindowId = 1;
      await dispatchWindowFocusChanged(1);

      // The sidebar in Window A should show Tab A, the active tab of the
      // now-focused window.
      const currentTabMessages = vi
        .mocked(mockMessageService.sendMessage)
        .mock.calls.map(([message]) => message)
        .filter((message) => message.type === MessageTypes.CURRENT_TAB_INFO);
      const lastBroadcast = currentTabMessages.at(-1);
      expect(lastBroadcast).toMatchObject({
        tab: { id: tabA.id, url: tabA.url, title: tabA.title },
      });
    });
  });

  describe('handleMessage', () => {
    it('should return an error response if an unknown command is received from the UI', async () => {
      const response = await controller.handleMessage({
        type: 'UNKNOWN_TYPE',
      } as unknown as ExtensionMessage);

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
      vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);

      const response = await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Hi',
        model: 'gemini-pro',
        includeCurrentTab: true,
      });

      expect(response).toEqual({ reply: 'Hello from Gemini' });
      expect(mockGeminiService.generateContent).toHaveBeenCalled();
      expect(mockChatHistory.addMessage).toHaveBeenCalledWith({
        role: 'user',
        text: 'Hi',
      });
      expect(mockChatHistory.addMessage).toHaveBeenCalledWith({
        role: 'model',
        text: 'Hello from Gemini',
      });
    });

    it('should ensure JIT loading is called on every message', async () => {
      await controller.handleMessage({ type: MessageTypes.GET_HISTORY });

      expect(mockChatHistory.load).toHaveBeenCalled();
      expect(mockContextManager.load).toHaveBeenCalled();
    });

    it('should abort generation when STOP_GENERATION message is received', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('fake-key');
      vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue([]);
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue([]);

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
      vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);

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
      vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);
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
      vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);
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
        [{ type: 'text', text: 'Pinned Content' }], // Active content should be excluded
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
      vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);

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

    it('should return error message when pinning fails due to limit', async () => {
      vi.mocked(mockContextManager.addTab).mockRejectedValue(
        new Error('You can only pin up to 6 tabs.'),
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
        message: 'You can only pin up to 6 tabs.',
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
      expect(mockContextManager.clear).toHaveBeenCalled();
    });

    it('should handle unknown message types gracefully', async () => {
      const response = await controller.handleMessage({
        type: 'UNKNOWN_TYPE',
      } as unknown as ExtensionMessage);

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

  describe('Ollama', () => {
    const enabledSettings = {
      enabled: true,
      host: 'http://127.0.0.1:11434',
      numCtx: '8192',
      keepAlive: '10m',
    };

    function stubStorage(values: Record<string, unknown>) {
      vi.mocked(mockSyncStorage.get).mockImplementation(
        async (key: string) => values[key],
      );
    }

    it('should route CHAT_MESSAGE to Ollama without requiring an API key', async () => {
      stubStorage({ [StorageKeys.OLLAMA_SETTINGS]: enabledSettings });
      vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue([]);
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue([]);
      vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);
      vi.mocked(mockOllamaService.generateContent).mockResolvedValue({
        reply: 'Hello from Ollama',
      });

      const response = await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Hi',
        model: 'llama3.1:8b',
        includeCurrentTab: false,
        provider: Providers.OLLAMA,
      });

      expect(response).toEqual({ reply: 'Hello from Ollama' });
      expect(mockDNRService.ensureRule).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          host: 'http://127.0.0.1:11434',
        }),
      );
      expect(mockOllamaService.generateContent).toHaveBeenCalledWith(
        'http://127.0.0.1:11434',
        'llama3.1:8b',
        [],
        expect.any(Array),
        { numCtx: 8192, keepAlive: '10m' },
        expect.any(AbortSignal),
      );
      expect(mockGeminiService.generateContent).not.toHaveBeenCalled();
    });

    it('should return an error for Ollama chat when Ollama is disabled', async () => {
      stubStorage({
        [StorageKeys.OLLAMA_SETTINGS]: { ...enabledSettings, enabled: false },
      });

      const response = await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Hi',
        model: 'llama3.1:8b',
        includeCurrentTab: false,
        provider: Providers.OLLAMA,
      });

      expect(response).toEqual({
        error: 'Ollama is not enabled. Please enable it in the Settings.',
      });
      expect(mockOllamaService.generateContent).not.toHaveBeenCalled();
    });

    it('should compute the per-tab char limit from num_ctx and tab count', async () => {
      stubStorage({ [StorageKeys.OLLAMA_SETTINGS]: enabledSettings });
      vi.mocked(mockContextManager.getPinnedTabs).mockReturnValue([
        { tabId: 1 },
      ] as unknown as TabContext[]);
      vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue([]);
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue([]);
      vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);
      vi.mocked(mockOllamaService.generateContent).mockResolvedValue({
        reply: 'ok',
      });

      await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Hi',
        model: 'llama3.1:8b',
        includeCurrentTab: true,
        provider: Providers.OLLAMA,
      });

      // ((8192 - 1024 reserved) * 0.75 * 3) / 2 tabs = 8064 chars per tab
      expect(mockContextManager.getActiveTabContent).toHaveBeenCalledWith(8064);
      expect(mockContextManager.getAllContent).toHaveBeenCalledWith(8064);
    });

    it('should not double-count the current tab when it is already pinned', async () => {
      stubStorage({ [StorageKeys.OLLAMA_SETTINGS]: enabledSettings });
      vi.mocked(mockContextManager.getPinnedTabs).mockReturnValue([
        { tabId: 1 },
      ] as unknown as TabContext[]);
      vi.mocked(mockTabService.query).mockResolvedValue([
        { id: 1, url: 'https://pinned.com', active: true },
      ] as ChromeTab[]);
      vi.mocked(mockContextManager.isTabPinned).mockReturnValue(true);
      vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue([]);
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue([]);
      vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);
      vi.mocked(mockOllamaService.generateContent).mockResolvedValue({
        reply: 'ok',
      });

      await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Hi',
        model: 'llama3.1:8b',
        includeCurrentTab: true,
        provider: Providers.OLLAMA,
      });

      // The pinned active tab contributes only a placeholder, so the budget
      // is for 1 tab: (8192 - 1024) * 0.75 * 3 = 16128
      expect(mockContextManager.getAllContent).toHaveBeenCalledWith(16128);
    });

    it('should omit num_ctx and budget with the assumed window when unset', async () => {
      stubStorage({
        [StorageKeys.OLLAMA_SETTINGS]: { ...enabledSettings, numCtx: '' },
      });
      vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue([]);
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue([]);
      vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);
      vi.mocked(mockOllamaService.generateContent).mockResolvedValue({
        reply: 'ok',
      });

      await controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Hi',
        model: 'llama3.1:8b',
        includeCurrentTab: true,
        provider: Providers.OLLAMA,
      });

      // Budget assumes a 4096 window: ((4096 - 1024) * 0.75 * 3) / 1 tab = 6912
      expect(mockContextManager.getActiveTabContent).toHaveBeenCalledWith(6912);
      expect(mockOllamaService.generateContent).toHaveBeenCalledWith(
        'http://127.0.0.1:11434',
        'llama3.1:8b',
        [],
        expect.any(Array),
        { numCtx: undefined, keepAlive: '10m' },
        expect.any(AbortSignal),
      );
    });

    it('should handle OLLAMA_LIST_MODELS when enabled', async () => {
      stubStorage({ [StorageKeys.OLLAMA_SETTINGS]: enabledSettings });
      vi.mocked(mockOllamaService.listModels).mockResolvedValue({
        models: ['llama3.1:8b', 'qwen3:4b'],
      });

      const response = await controller.handleMessage({
        type: MessageTypes.OLLAMA_LIST_MODELS,
      });

      expect(response).toEqual({
        success: true,
        models: ['llama3.1:8b', 'qwen3:4b'],
      });
      expect(mockDNRService.ensureRule).toHaveBeenCalled();
    });

    it('should fail OLLAMA_LIST_MODELS when disabled', async () => {
      stubStorage({
        [StorageKeys.OLLAMA_SETTINGS]: { ...enabledSettings, enabled: false },
      });

      const response = await controller.handleMessage({
        type: MessageTypes.OLLAMA_LIST_MODELS,
      });

      expect(response).toEqual({
        success: false,
        models: [],
        error: 'Ollama is not enabled.',
      });
      expect(mockOllamaService.listModels).not.toHaveBeenCalled();
    });

    it('should test connection against the provided (unsaved) host via the test rule', async () => {
      stubStorage({
        [StorageKeys.OLLAMA_SETTINGS]: { ...enabledSettings, enabled: false },
      });
      vi.mocked(mockOllamaService.listModels).mockResolvedValue({
        models: ['llama3.1:8b'],
      });

      const response = await controller.handleMessage({
        type: MessageTypes.OLLAMA_TEST_CONNECTION,
        host: 'localhost:9999',
      });

      expect(response).toEqual({ success: true, models: ['llama3.1:8b'] });
      expect(mockOllamaService.listModels).toHaveBeenCalledWith(
        'http://localhost:9999',
      );
      // The test uses its own temporary rule and cleans it up afterwards.
      expect(mockDNRService.setTestRule).toHaveBeenCalledWith(
        'http://localhost:9999',
      );
      expect(mockDNRService.removeTestRule).toHaveBeenCalled();
      // The main rule — and any chat relying on it — is never touched.
      expect(mockDNRService.ensureRule).not.toHaveBeenCalled();
    });

    it('should not mask the test result when removing the test rule fails', async () => {
      stubStorage({
        [StorageKeys.OLLAMA_SETTINGS]: { ...enabledSettings, enabled: false },
      });
      vi.mocked(mockOllamaService.listModels).mockResolvedValue({
        models: ['llama3.1:8b'],
      });
      vi.mocked(mockDNRService.removeTestRule).mockRejectedValue(
        new Error('DNR update failed'),
      );

      const response = await controller.handleMessage({
        type: MessageTypes.OLLAMA_TEST_CONNECTION,
        host: 'localhost:9999',
      });

      expect(response).toEqual({ success: true, models: ['llama3.1:8b'] });
    });

    it('should remove the test rule even when the probe fails', async () => {
      stubStorage({
        [StorageKeys.OLLAMA_SETTINGS]: { ...enabledSettings, enabled: false },
      });
      vi.mocked(mockOllamaService.listModels).mockResolvedValue({
        error: 'connection refused',
      });

      const response = await controller.handleMessage({
        type: MessageTypes.OLLAMA_TEST_CONNECTION,
        host: 'localhost:9999',
      });

      expect(response).toEqual({
        success: false,
        models: [],
        error: 'connection refused',
      });
      expect(mockDNRService.removeTestRule).toHaveBeenCalled();
    });

    it('should default to the standard host when testing with an empty host', async () => {
      stubStorage({});
      vi.mocked(mockOllamaService.listModels).mockResolvedValue({ models: [] });

      const response = await controller.handleMessage({
        type: MessageTypes.OLLAMA_TEST_CONNECTION,
        host: '   ',
      });

      expect(response).toEqual({ success: true, models: [] });
      expect(mockOllamaService.listModels).toHaveBeenCalledWith(
        'http://127.0.0.1:11434',
      );
    });

    it('should reject an invalid host in OLLAMA_TEST_CONNECTION', async () => {
      const response = await controller.handleMessage({
        type: MessageTypes.OLLAMA_TEST_CONNECTION,
        host: 'not a url',
      });

      expect(response).toEqual({
        success: false,
        models: [],
        error: 'Invalid Ollama host URL.',
      });
      expect(mockOllamaService.listModels).not.toHaveBeenCalled();
    });

    it('should reconcile the DNR rules on start()', async () => {
      stubStorage({ [StorageKeys.OLLAMA_SETTINGS]: enabledSettings });

      controller.start();

      await vi.waitFor(() => {
        expect(mockDNRService.ensureRule).toHaveBeenCalledWith(
          expect.objectContaining({
            enabled: true,
            host: 'http://127.0.0.1:11434',
          }),
        );
        // A test rule left behind by an interrupted test is also dropped.
        expect(mockDNRService.removeTestRule).toHaveBeenCalled();
      });
    });

    it('should honor a STOP_GENERATION that arrives during session setup', async () => {
      // Hold the Ollama settings read open so the stop lands while
      // startSession() is still awaiting storage.
      let resolveSettings!: (value: unknown) => void;
      vi.mocked(mockSyncStorage.get).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSettings = resolve;
        }),
      );
      vi.mocked(mockContextManager.getActiveTabContent).mockResolvedValue([]);
      vi.mocked(mockContextManager.getAllContent).mockResolvedValue([]);
      vi.mocked(mockChatHistory.getMessages).mockReturnValue([]);

      const chatPromise = controller.handleMessage({
        type: MessageTypes.CHAT_MESSAGE,
        message: 'Hi',
        model: 'llama3.1:8b',
        includeCurrentTab: false,
        provider: Providers.OLLAMA,
      });
      // Let the chat message reach the pending settings read.
      await new Promise((resolve) => setTimeout(resolve, 0));

      await controller.handleMessage({ type: MessageTypes.STOP_GENERATION });
      resolveSettings(enabledSettings);

      const response = await chatPromise;
      expect(response).toEqual({ aborted: true });
      expect(mockOllamaService.generateContent).not.toHaveBeenCalled();
      expect(mockChatHistory.removeLastMessage).toHaveBeenCalled();
    });
  });
});
