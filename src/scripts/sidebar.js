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

import { MessageTypes, StorageKeys } from "./constants.js";

document.addEventListener("DOMContentLoaded", () => {
  const promptForm = document.getElementById("prompt-form");
  const promptInput = document.getElementById("prompt-input");
  const messagesDiv = document.getElementById("messages");
  const apiKeyInput = document.getElementById("api-key-input");
  const saveApiKeyButton = document.getElementById("save-api-key-button");
  const apiKeyContainer = document.getElementById("api-key-container");
  const pinnedTabsDiv = document.getElementById("pinned-tabs");
  const currentTabDiv = document.getElementById("current-tab");
  const modelSelect = document.getElementById("model-select");
  const editApiKeyButton = document.getElementById("edit-api-key-button");
  const newChatButton = document.getElementById("new-chat-button");

  // Use event delegation for dynamically created buttons
  document.body.addEventListener("click", (e) => {
    if (e.target.id === "pin-tab-button") {
      pinCurrentTab();
    } else if (e.target.classList.contains("unpin-button")) {
      unpinTab(e.target.dataset.url);
    } else if (e.target.classList.contains("reopen-button")) {
      reopenTab(e.target.dataset.url);
    }
  });

  saveApiKeyButton.addEventListener("click", saveApiKey);
  editApiKeyButton.addEventListener("click", () => {
    apiKeyContainer.style.display = "flex";
  });

  newChatButton.addEventListener("click", () => {
    messagesDiv.innerHTML = ""; // Clear messages in UI
    chrome.runtime.sendMessage({ type: MessageTypes.CLEAR_CHAT }, (response) => {
      if (response && response.success) {
        displayPinnedTabs([]); // Clear pinned tabs in UI
      }
    });
  });

  modelSelect.addEventListener("change", () => {
    chrome.storage.sync.set({ [StorageKeys.SELECTED_MODEL]: modelSelect.value });
  });

  promptForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage();
  });

  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  chrome.storage.sync.get(
    [StorageKeys.API_KEY, StorageKeys.SELECTED_MODEL],
    (result) => {
      if (result.geminiApiKey) {
        apiKeyContainer.style.display = "none";
      } else {
        apiKeyContainer.style.display = "flex";
      }
      if (result.selectedModel) {
        modelSelect.value = result.selectedModel;
      }
    }
  );

  function saveApiKey() {
    const apiKey = apiKeyInput.value;
    if (apiKey.trim() === "") {
      alert("Please enter your Gemini API Key.");
      return;
    }
    chrome.runtime.sendMessage(
      { type: MessageTypes.SAVE_API_KEY, apiKey: apiKey },
      (response) => {
        if (response && response.success) {
          apiKeyContainer.style.display = "none";
        } else {
          alert("Failed to save API Key.");
        }
      }
    );
  }

  function sendMessage() {
    const message = promptInput.value;
    if (message.trim() === "") return;

    appendMessage("user", message);
    promptInput.value = "";

    const thinkingMessageElement = appendThinkingMessage();

    chrome.runtime.sendMessage(
      {
        type: MessageTypes.CHAT_MESSAGE,
        message: message,
        model: modelSelect.value,
      },
      (response) => {
        thinkingMessageElement.remove();
        if (response && response.reply) {
          appendMessage("gemini", response.reply);
        } else if (response && response.error) {
          appendMessage("error", `Error: ${response.error}`);
        }
      }
    );
  }

  function appendThinkingMessage() {
    const thinkingMessageElement = document.createElement("div");
    thinkingMessageElement.classList.add("message", "thinking");
    thinkingMessageElement.textContent = "Gemini is thinking...";
    messagesDiv.appendChild(thinkingMessageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return thinkingMessageElement;
  }

  function appendMessage(sender, text) {
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", sender);
    if (sender === "gemini") {
      messageElement.innerHTML = marked.parse(text);
    } else {
      messageElement.textContent = text;
    }
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function pinCurrentTab() {
    chrome.runtime.sendMessage({ type: MessageTypes.PIN_TAB }, (response) => {
      if (response && response.success) {
        checkPinnedTabs();
      }
    });
  }

  function unpinTab(url) {
    chrome.runtime.sendMessage(
      { type: MessageTypes.UNPIN_TAB, url: url },
      (response) => {
        if (response && response.success) {
          checkPinnedTabs();
        }
      }
    );
  }

  function reopenTab(url) {
    chrome.runtime.sendMessage({ type: MessageTypes.REOPEN_TAB, url: url }, () => {
      checkPinnedTabs(); // Refresh pinned tabs after reopening
    });
  }

  function displayPinnedTabs(pinnedContexts) {
    pinnedTabsDiv.innerHTML = "";
    if (!pinnedContexts || pinnedContexts.length === 0) {
      return;
    }
    const ul = document.createElement("ul");
    pinnedContexts.forEach((context) => {
      const li = document.createElement("li");
      li.classList.toggle("closed", context.isClosed);
      let buttons = `<button class="unpin-button" data-url="${context.url}">x</button>`;
      if (context.isClosed) {
        buttons += `<button class="reopen-button" data-url="${context.url}">Reopen</button>`;
      }
      li.innerHTML = `<span>${context.title}</span>${buttons}`;
      ul.appendChild(li);
    });
    pinnedTabsDiv.appendChild(ul);
  }

  function checkPinnedTabs() {
    chrome.runtime.sendMessage(
      { type: MessageTypes.CHECK_PINNED_TABS },
      (response) => {
        if (response && response.success) {
          displayPinnedTabs(response.pinnedContexts);
        }
      }
    );
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === MessageTypes.CURRENT_TAB_INFO) {
      updateCurrentTabInfo(request.tab);
    }
    if (request.type === MessageTypes.CHECK_PINNED_TABS) {
      checkPinnedTabs();
    }
  });

  function updateCurrentTabInfo(tab) {
    if (tab) {
      currentTabDiv.innerHTML = `<span>Current: ${tab.title}</span><button id="pin-tab-button">+</button>`;
    } else {
      currentTabDiv.innerHTML = "<span>Current: No active tab found.</span>";
    }
  }

  chrome.runtime.sendMessage({ type: MessageTypes.GET_CONTEXT }, (response) => {
    if (response) {
      if (response.pinnedContexts) {
        checkPinnedTabs();
      }
      if (response.tab) {
        updateCurrentTabInfo(response.tab);
      }
    }
  });
});
