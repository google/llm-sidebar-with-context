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

import { MessageTypes, StorageKeys } from '../constants';
import { ChatHistory } from '../models/ChatHistory';
import { ContextManager } from '../models/ContextManager';
import { TabContext } from '../models/TabContext';
import { IGeminiService } from '../services/geminiService';
import { ISyncStorageService } from '../services/storageService';
import { ITabService } from '../services/tabService';
import { IMessageService } from '../services/messageService';
import { isRestrictedURL } from '../utils';
import {
  ExtensionMessage,
  ExtensionResponse,
  GetContextResponse,
  SuccessResponse,
  CheckPinnedTabsResponse,
  GetHistoryResponse,
  GeminiResponse,
  ContentPart,
} from '../types';

export class BackgroundController {
  private abortController: AbortController | null = null;

  constructor(
    private chatHistory: ChatHistory,
    private contextManager: ContextManager,
    private syncStorageService: ISyncStorageService,
    private tabService: ITabService,
    private geminiService: IGeminiService,
    private messageService: IMessageService,
  ) {}

  /**
   * Initializes listeners and starts the controller.
   */
  public start() {
    this.setupEventListeners();
    // Initial context update on startup
    this.broadcastCurrentTabInfo();
  }

  private setupEventListeners() {
    // Listen for messages from the sidebar
    this.messageService.onMessage(
      (
        request: ExtensionMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: ExtensionResponse) => void,
      ) => {
        this.handleMessage(request).then(sendResponse);
        return true; // Keep the message channel open for async response
      },
    );

    // Update context when active tab changes
    chrome.tabs.onActivated.addListener(() => this.broadcastCurrentTabInfo());

    // Update context when tab URL or Title changes
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (
        changeInfo.url ||
        changeInfo.title ||
        changeInfo.status === 'complete'
      ) {
        // If the tab is pinned, update its metadata
        if (this.contextManager.isTabPinned(tabId)) {
          await this.contextManager.updateTabMetadata(
            tabId,
            tab.url || '',
            tab.title || 'Untitled',
          );
          this.messageService
            .sendMessage({ type: MessageTypes.CHECK_PINNED_TABS })
            .catch(() => {});
        }

        if (tab.active) {
          this.broadcastCurrentTabInfo();
        }
      }
    });

    // Update pinned tabs status when a tab is closed
    chrome.tabs.onRemoved.addListener(async (tabId) => {
      await this.contextManager.removeTab(tabId);
      this.messageService
        .sendMessage({ type: MessageTypes.CHECK_PINNED_TABS })
        .catch(() => {});
    });

    // Open the side panel when the extension icon is clicked
    chrome.action.onClicked.addListener(async (tab) => {
      if (tab.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    });
  }

  private async broadcastCurrentTabInfo() {
    try {
      const [tab] = await this.tabService.query({
        active: true,
        currentWindow: true,
      });
      if (tab && tab.url && tab.id !== undefined) {
        await this.messageService.sendMessage({
          type: MessageTypes.CURRENT_TAB_INFO,
          tab: {
            id: tab.id,
            title: tab.title || 'Untitled',
            url: tab.url,
          },
        });
      }
    } catch (error: unknown) {
      const err = error as Error;
      // Ignore error if sidebar is closed (receiving end does not exist)
      if (
        err.message &&
        !err.message.includes('Receiving end does not exist.')
      ) {
        console.error('Error sending current tab info:', error);
      }
    }
  }

  /**
   * Main entry point for handling messages from the UI.
   */
  async handleMessage(request: ExtensionMessage): Promise<ExtensionResponse> {
    try {
      // Just-In-Time Loading to handle Service Worker restarts
      await Promise.all([this.chatHistory.load(), this.contextManager.load()]);

      switch (request.type) {
        case MessageTypes.CHAT_MESSAGE:
          return await this.handleChatMessage(
            request.message,
            request.model,
            request.includeCurrentTab,
          );
        case MessageTypes.GET_CONTEXT:
          return await this.handleGetContext();
        case MessageTypes.SAVE_API_KEY:
          return await this.handleSaveApiKey(request.apiKey);
        case MessageTypes.PIN_TAB:
          return await this.handlePinTab();
        case MessageTypes.UNPIN_TAB:
          return await this.handleUnpinTab(request.tabId);
        case MessageTypes.CHECK_PINNED_TABS:
          return await this.handleCheckPinnedTabs();
        case MessageTypes.CLEAR_CHAT:
          return await this.handleClearChat();
        case MessageTypes.GET_HISTORY:
          return await this.handleGetHistory();
        case MessageTypes.STOP_GENERATION:
          if (this.abortController) {
            this.abortController.abort();
          }
          return { success: true };
        default:
          return {
            error: `Unknown message type: ${(request as { type: unknown }).type}`,
          };
      }
    } catch (error: unknown) {
      console.error('BackgroundController error:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  private async handleGetHistory(): Promise<GetHistoryResponse> {
    return {
      success: true,
      history: this.chatHistory.getMessages(),
    };
  }

  private async handleChatMessage(
    message: string,
    model: string,
    includeCurrentTab: boolean,
  ): Promise<GeminiResponse> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return {
        error: 'Gemini API Key not set. Please set it in the sidebar.',
      };
    }

    this.abortController = new AbortController();

    try {
      // 1. Add User Message to History
      await this.chatHistory.addMessage({ role: 'user', text: message });

      if (this.abortController.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // 2. Build Context
      let activeContext: ContentPart[] = [];
      if (includeCurrentTab) {
        activeContext = await this.contextManager.getActiveTabContent();
      }

      if (this.abortController.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const pinnedContent = await this.contextManager.getAllContent();
      const fullContext = [...activeContext, ...pinnedContent];

      // 3. Send to Gemini
      const response = await this.geminiService.generateContent(
        apiKey,
        fullContext,
        this.chatHistory.getMessages(),
        model,
        this.abortController.signal,
      );

      // 4. Add Model Response to History
      if (response.reply) {
        await this.chatHistory.addMessage({
          role: 'model',
          text: response.reply,
        });
      }

      return response;
    } catch (error: unknown) {
      const err = error as Error;
      const isAbort =
        err.name === 'AbortError' ||
        (err.message &&
          typeof err.message === 'string' &&
          err.message.toLowerCase().includes('aborted'));

      if (isAbort) {
        // Remove the user's message from history so it can be restored to the input
        await this.chatHistory.removeLastMessage();
        return { aborted: true };
      }
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  private async handleGetContext(): Promise<GetContextResponse> {
    const [tab] = await this.tabService.query({
      active: true,
      currentWindow: true,
    });

    const pinnedContexts = this.contextManager
      .getPinnedTabs()
      .map((context) => ({
        id: context.tabId,
        url: context.url,
        title: context.title,
      }));

    return {
      pinnedContexts: pinnedContexts,
      tab:
        tab && tab.url && tab.id
          ? { id: tab.id, title: tab.title || 'Untitled', url: tab.url }
          : null,
    };
  }

  private async handleSaveApiKey(apiKey: string): Promise<SuccessResponse> {
    await this.syncStorageService.set(StorageKeys.API_KEY, apiKey);
    return { success: true };
  }

  private async handlePinTab(): Promise<SuccessResponse> {
    const [tab] = await this.tabService.query({
      active: true,
      currentWindow: true,
    });

    if (!tab || !tab.url || tab.id === undefined) {
      return { success: false, message: 'No active tab found.' };
    }

    if (isRestrictedURL(tab.url)) {
      return { success: false, message: 'Cannot pin restricted URL' };
    }

    try {
      const newContext = new TabContext(
        tab.id,
        tab.url,
        tab.title || 'Untitled',
        this.tabService,
      );
      await this.contextManager.addTab(newContext);
      return { success: true };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { success: false, message: message };
    }
  }

  private async handleUnpinTab(tabId: number): Promise<SuccessResponse> {
    await this.contextManager.removeTab(tabId);
    return { success: true };
  }

  private async handleCheckPinnedTabs(): Promise<CheckPinnedTabsResponse> {
    const pinnedContexts = this.contextManager
      .getPinnedTabs()
      .map((context) => ({
        id: context.tabId,
        url: context.url,
        title: context.title,
      }));
    return { success: true, pinnedContexts };
  }

  private async handleClearChat(): Promise<SuccessResponse> {
    await this.chatHistory.clear();
    await this.contextManager.clear();
    return { success: true };
  }

  private async getApiKey(): Promise<string | null> {
    const apiKey = await this.syncStorageService.get<string>(
      StorageKeys.API_KEY,
    );
    return apiKey || null;
  }
}
