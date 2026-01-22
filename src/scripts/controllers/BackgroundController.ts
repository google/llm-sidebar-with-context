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

import { MessageTypes, StorageKeys } from "../constants";
import { callGeminiApi } from "../geminiApiService";
import { ChatHistory } from "../models/ChatHistory";
import { ContextManager } from "../models/ContextManager";
import { TabContext } from "../models/TabContext";
import { IStorageService } from "../services/storageService";
import { ITabService } from "../services/tabService";
import {
  ExtensionMessage,
  ExtensionResponse,
  GetContextResponse,
  SuccessResponse,
  CheckPinnedTabsResponse,
  GetHistoryResponse,
  GeminiResponse,
  PinnedContext,
  TabInfo
} from "../types";

export class BackgroundController {
  private chatHistory: ChatHistory;
  private contextManager: ContextManager;

  constructor(
    private storageService: IStorageService,
    private tabService: ITabService
  ) {
    this.chatHistory = new ChatHistory(storageService);
    this.contextManager = new ContextManager(storageService, tabService);
  }

  /**
   * Main entry point for handling messages from the UI.
   */
  async handleMessage(request: ExtensionMessage): Promise<ExtensionResponse> {
    // Just-In-Time Loading to handle Service Worker restarts
    await Promise.all([this.chatHistory.load(), this.contextManager.load()]);

    try {
      switch (request.type) {
        case MessageTypes.CHAT_MESSAGE:
          return await this.handleChatMessage(request.message, request.model);
        case MessageTypes.GET_CONTEXT:
          return await this.handleGetContext();
        case MessageTypes.SAVE_API_KEY:
          return await this.handleSaveApiKey(request.apiKey);
        case MessageTypes.PIN_TAB:
          return await this.handlePinTab();
        case MessageTypes.UNPIN_TAB:
          return await this.handleUnpinTab(request.url);
        case MessageTypes.CHECK_PINNED_TABS:
          return await this.handleCheckPinnedTabs();
        case MessageTypes.REOPEN_TAB:
          return await this.handleReopenTab(request.url);
        case MessageTypes.CLEAR_CHAT:
          return await this.handleClearChat();
        case MessageTypes.GET_HISTORY:
          return await this.handleGetHistory();
        default:
          return { error: `Unknown message type: ${(request as { type: unknown }).type}` };
      }
    } catch (error: unknown) {
      console.error("BackgroundController error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  private async handleGetHistory(): Promise<GetHistoryResponse> {
    return {
      success: true,
      history: this.chatHistory.getMessages(),
    };
  }

  private async handleChatMessage(message: string, model: string): Promise<GeminiResponse> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return {
        error: "Gemini API Key not set. Please set it in the sidebar.",
      };
    }

    // 1. Add User Message to History
    await this.chatHistory.addMessage({ role: "user", text: message });

    // 2. Build Context
    const activeContext = await this.contextManager.getActiveTabContent();
    const pinnedContent = await this.contextManager.getAllContent();
    const fullContext = activeContext + pinnedContent;

    // 3. Send to Gemini
    const response = await callGeminiApi(
      apiKey,
      fullContext,
      this.chatHistory.getMessages(),
      model
    );

    // 4. Add Model Response to History
    if (response.reply) {
      await this.chatHistory.addMessage({ role: "model", text: response.reply });
    }

    return response;
  }

  private async handleGetContext(): Promise<GetContextResponse> {
    const [tab] = await this.tabService.query({
      active: true,
      currentWindow: true,
    });

    const pinnedWithStatus = await this.getPinnedTabsWithStatus();

    return {
      pinnedContexts: pinnedWithStatus,
      tab: tab && tab.url ? { title: tab.title || "Untitled", url: tab.url } : null,
    };
  }

  private async handleSaveApiKey(apiKey: string): Promise<SuccessResponse> {
    await chrome.storage.sync.set({ [StorageKeys.API_KEY]: apiKey });
    return { success: true };
  }

  private async handlePinTab(): Promise<SuccessResponse> {
    const [tab] = await this.tabService.query({
      active: true,
      currentWindow: true,
    });

    if (!tab || !tab.url) {
        return { success: false, message: "No active tab found." };
    }

    try {
        const newContext = new TabContext(tab.url, tab.title || "Untitled", this.tabService);
        await this.contextManager.addTab(newContext);
        return { success: true };
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return { success: false, message: message };
    }
  }

  private async handleUnpinTab(url: string): Promise<SuccessResponse> {
    await this.contextManager.removeTab(url);
    return { success: true };
  }

  private async handleCheckPinnedTabs(): Promise<CheckPinnedTabsResponse> {
    const checkedContexts = await this.getPinnedTabsWithStatus();
    return { success: true, pinnedContexts: checkedContexts };
  }

  private async getPinnedTabsWithStatus(): Promise<PinnedContext[]> {
    const openTabs = await this.tabService.query({});
    const openTabUrls = new Set(openTabs.map((tab) => tab.url));
    
    return this.contextManager.getPinnedTabs().map((context) => ({
      url: context.url,
      title: context.title,
      isClosed: !openTabUrls.has(context.url),
    }));
  }

  private async handleReopenTab(url: string): Promise<SuccessResponse> {
    const newTab = await this.tabService.create({ url: url });
    const tabId = newTab.id;

    if (tabId === undefined) {
      return { success: false, message: "Failed to create tab" };
    }

    try {
      await this.tabService.waitForTabComplete(tabId);
      return { success: true };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  private async handleClearChat(): Promise<SuccessResponse> {
    await this.chatHistory.clear();
    await this.contextManager.clear();
    return { success: true };
  }

  private async getApiKey(): Promise<string | null> {
    return new Promise((resolve) => {
      chrome.storage.sync.get([StorageKeys.API_KEY], (result) => {
        const key = result[StorageKeys.API_KEY];
        resolve(typeof key === "string" ? key : null);
      });
    });
  }
}
