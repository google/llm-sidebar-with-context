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

import { MessageTypes } from "./constants";
import { BackgroundController } from "./controllers/BackgroundController";

const controller = new BackgroundController();

// Listen for messages from the sidebar
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  controller.handleMessage(request).then(sendResponse);
  return true; // Keep the message channel open for async response
});

// Broadcast current tab info to the UI
async function broadcastCurrentTabInfo() {
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
        // Ignore error if sidebar is closed
        if (!error.message.includes("Receiving end does not exist.")) {
          console.error("Error sending current tab info:", error);
        }
      });
  }
}

// Update context when active tab changes
chrome.tabs.onActivated.addListener(broadcastCurrentTabInfo);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    broadcastCurrentTabInfo();
  }
});

chrome.tabs.onRemoved.addListener(() => {
  chrome.runtime.sendMessage({ type: MessageTypes.CHECK_PINNED_TABS }).catch(() => {});
});

// Initial context update on startup
broadcastCurrentTabInfo();

// Open the side panel when the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});