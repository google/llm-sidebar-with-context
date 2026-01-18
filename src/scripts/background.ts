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

// src/scripts/background.js

import { MessageTypes, StorageKeys } from "./constants";
import { callGeminiApi } from "./geminiApiService";
import { getTabContent } from "./tabManager";
import { isRestrictedURL } from "./utils";

interface PinnedContext {
  url: string;
  title: string;
  isClosed?: boolean;
}

let geminiApiKey: string | null = null;
let currentContext = "";
let pinnedContexts: PinnedContext[] = []; // Stores { url, title } of pinned tabs

// Load API key from sync storage on startup
chrome.storage.sync.get([StorageKeys.API_KEY], (result) => {
  if (result.geminiApiKey) {
    geminiApiKey = result.geminiApiKey as string;
    console.log("Background: Gemini API Key loaded.");
  }
});

// Load pinned contexts from local storage on startup
chrome.storage.local.get([StorageKeys.PINNED_CONTEXTS], (result) => {
  if (result.pinnedContexts) {
    pinnedContexts = result.pinnedContexts as PinnedContext[];
    console.log("Background: Pinned contexts loaded.", pinnedContexts);
  }
});

// Function to save pinned contexts to storage
function savePinnedContexts() {
  // Use local storage for pinned contexts to avoid sync storage limits
  chrome.storage.local.set({ [StorageKeys.PINNED_CONTEXTS]: pinnedContexts });
  console.log("Background: Pinned contexts saved.", pinnedContexts);
}

// Listen for messages from the sidebar
chrome.runtime.onMessage.addListener((request: any, sender, sendResponse) => {
  (async () => {
    let response: any = {};
    try {
      switch (request.type) {
        case MessageTypes.CHAT_MESSAGE:
          response = await handleChatMessage(request.message, request.model);
          break;
        case MessageTypes.GET_CONTEXT:
          response = await handleGetContext();
          break;
        case MessageTypes.SAVE_API_KEY:
          response = await handleSaveApiKey(request.apiKey);
          break;
        case MessageTypes.PIN_TAB:
          response = await handlePinTab();
          break;
        case MessageTypes.UNPIN_TAB:
          response = await handleUnpinTab(request.url);
          break;
        case MessageTypes.CHECK_PINNED_TABS:
          response = await handleCheckPinnedTabs();
          break;
        case MessageTypes.REOPEN_TAB:
          response = await handleReopenTab(request.url);
          break;
        case MessageTypes.CLEAR_CHAT:
          response = await handleClearChat();
          break;
      }
    } catch (error) {
      console.error("Background: Unhandled error in background script:", error);
      response = { error: `An unexpected error occurred: ${error.message}` };
    }
    sendResponse(response);
  })();
  return true; // Keep the message channel open for async response
});

async function handleChatMessage(message: string, model: string) {
  if (!geminiApiKey) {
    return {
      error: "Gemini API Key not set. Please set it in the sidebar.",
    };
  }
  await updateContextFromActiveTab();
  let fullContext = currentContext;
  for (const context of pinnedContexts) {
    const content = await getTabContent(context.url);
    fullContext += `\n\n--- Pinned Tab: ${context.title} (${context.url}) ---\n${content}`;
  }
  return await callGeminiApi(geminiApiKey, fullContext, message, model);
}

async function handleGetContext() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return {
    currentContext: currentContext,
    pinnedContexts: pinnedContexts,
    tab: tab ? { title: tab.title, url: tab.url } : null,
  };
}

async function handleSaveApiKey(apiKey: string) {
  geminiApiKey = apiKey;
  await chrome.storage.sync.set({ [StorageKeys.API_KEY]: apiKey });
  return { success: true };
}

async function handlePinTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab && tab.url) {
    if (isRestrictedURL(tab.url)) {
      return {
        success: false,
        message: "Cannot pin restricted Chrome pages.",
      };
    }
    if (!pinnedContexts.some((context) => context.url === tab.url)) {
      pinnedContexts.push({ url: tab.url, title: tab.title });
      savePinnedContexts();
      return { success: true };
    } else {
      return { success: false, message: "Tab already pinned." };
    }
  }
  return { success: false, message: "No active tab found." };
}

async function handleUnpinTab(url: string) {
  const initialLength = pinnedContexts.length;
  pinnedContexts = pinnedContexts.filter((context) => context.url !== url);
  if (pinnedContexts.length < initialLength) {
    savePinnedContexts();
    return { success: true };
  }
  return {
    success: false,
    message: "Tab not found in pinned contexts.",
  };
}

async function handleCheckPinnedTabs() {
  const openTabs = await chrome.tabs.query({});
  const openTabUrls = new Set(openTabs.map((tab) => tab.url));
  const checkedContexts = pinnedContexts.map((context) => ({
    ...context,
    isClosed: !openTabUrls.has(context.url),
  }));
  return { success: true, pinnedContexts: checkedContexts };
}

async function handleReopenTab(url: string) {
  const newTab = await chrome.tabs.create({ url: url });
  const tabId = newTab.id;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.runtime.sendMessage({ type: MessageTypes.CHECK_PINNED_TABS });
      resolve({ success: true });
    }, 5000); // 5 seconds timeout

    const listener = (updatedTabId: number, changeInfo: any, tab: chrome.tabs.Tab) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        chrome.runtime.sendMessage({ type: MessageTypes.CHECK_PINNED_TABS });
        resolve({ success: true });
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function handleClearChat() {
  pinnedContexts = [];
  currentContext = "";
  savePinnedContexts();
  return { success: true };
}

// Function to update context from active tab
async function updateContextFromActiveTab() {
  console.log("Background: Updating context from active tab.");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    chrome.runtime
      .sendMessage({
        type: MessageTypes.CURRENT_TAB_INFO,
        tab: {
          title: tab.title,
          url: tab.url,
        },
      })
      .catch((error) => {
        if (!error.message.includes("Receiving end does not exist.")) {
          console.error("Error sending current tab info:", error);
        }
      });

    const content = await getTabContent(tab.url, tab.id);
    currentContext = `Current tab URL: ${tab.url}\nContent: ${content}`;
  }
}

// Update context when active tab changes
chrome.tabs.onActivated.addListener(updateContextFromActiveTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    updateContextFromActiveTab();
  }
});

chrome.tabs.onRemoved.addListener(() => {
  chrome.runtime.sendMessage({ type: MessageTypes.CHECK_PINNED_TABS });
});

// Initial context update on startup
updateContextFromActiveTab();

// Open the side panel when the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});
