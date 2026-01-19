/**
 * Copyright 2025 Google LLC
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

export class BackgroundController {
  private chatHistory: ChatHistory;
  private contextManager: ContextManager;

  constructor() {
    this.chatHistory = new ChatHistory();
    this.contextManager = new ContextManager();
  }

  /**
   * Main entry point for handling messages from the UI.
   */
  async handleMessage(request: any): Promise<any> {
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
        default:
          return { error: `Unknown message type: ${request.type}` };
      }
    } catch (error: any) {
      console.error("BackgroundController error:", error);
      return { success: false, error: error.message };
    }
  }

  private async handleChatMessage(message: string, model: string) {
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

  private async handleGetContext() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return {
      pinnedContexts: this.contextManager.getPinnedTabs(),
      tab: tab ? { title: tab.title, url: tab.url } : null,
    };
  }

  private async handleSaveApiKey(apiKey: string) {
    await chrome.storage.sync.set({ [StorageKeys.API_KEY]: apiKey });
    return { success: true };
  }

  private async handlePinTab() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab || !tab.url) {
        return { success: false, message: "No active tab found." };
    }

    try {
        const newContext = new TabContext(tab.url, tab.title || "Untitled");
        await this.contextManager.addTab(newContext);
        return { success: true };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
  }

  private async handleUnpinTab(url: string) {
    await this.contextManager.removeTab(url);
    return { success: true };
  }

  private async handleCheckPinnedTabs() {
    const openTabs = await chrome.tabs.query({});
    const openTabUrls = new Set(openTabs.map((tab) => tab.url));
    
    const checkedContexts = this.contextManager.getPinnedTabs().map((context) => ({
      url: context.url,
      title: context.title,
      isClosed: !openTabUrls.has(context.url),
    }));

    return { success: true, pinnedContexts: checkedContexts };
  }

  private async handleReopenTab(url: string) {
    const newTab = await chrome.tabs.create({ url: url });
    const tabId = newTab.id;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve({ success: true });
      }, 5000); 

      const listener = (updatedTabId: number, changeInfo: any) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeout);
          resolve({ success: true });
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  private async handleClearChat() {
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
