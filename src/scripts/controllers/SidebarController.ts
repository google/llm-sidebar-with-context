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

import { marked } from "marked";
import { MessageTypes, StorageKeys } from "../constants";

export class SidebarController {
  private promptForm: HTMLFormElement;
  private promptInput: HTMLInputElement;
  private messagesDiv: HTMLDivElement;
  private apiKeyInput: HTMLInputElement;
  private saveApiKeyButton: HTMLButtonElement;
  private apiKeyContainer: HTMLDivElement;
  private pinnedTabsDiv: HTMLDivElement;
  private currentTabDiv: HTMLDivElement;
  private modelSelect: HTMLSelectElement;
  private editApiKeyButton: HTMLButtonElement;
  private newChatButton: HTMLButtonElement;

  constructor() {
    this.promptForm = document.getElementById("prompt-form") as HTMLFormElement;
    this.promptInput = document.getElementById("prompt-input") as HTMLInputElement;
    this.messagesDiv = document.getElementById("messages") as HTMLDivElement;
    this.apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
    this.saveApiKeyButton = document.getElementById("save-api-key-button") as HTMLButtonElement;
    this.apiKeyContainer = document.getElementById("api-key-container") as HTMLDivElement;
    this.pinnedTabsDiv = document.getElementById("pinned-tabs") as HTMLDivElement;
    this.currentTabDiv = document.getElementById("current-tab") as HTMLDivElement;
    this.modelSelect = document.getElementById("model-select") as HTMLSelectElement;
    this.editApiKeyButton = document.getElementById("edit-api-key-button") as HTMLButtonElement;
    this.newChatButton = document.getElementById("new-chat-button") as HTMLButtonElement;

    this.setupEventListeners();
    this.initialize();
  }

  private setupEventListeners() {
    // Use event delegation for dynamically created buttons
    document.body.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.id === "pin-tab-button") {
        this.pinCurrentTab();
      } else if (target.classList.contains("unpin-button")) {
        this.unpinTab(target.dataset.url!);
      } else if (target.classList.contains("reopen-button")) {
        this.reopenTab(target.dataset.url!);
      }
    });

    this.saveApiKeyButton.addEventListener("click", () => this.saveApiKey());
    this.editApiKeyButton.addEventListener("click", () => {
      this.apiKeyContainer.style.display = "flex";
    });

    this.newChatButton.addEventListener("click", () => {
      this.messagesDiv.innerHTML = ""; // Clear messages in UI
      chrome.runtime.sendMessage({ type: MessageTypes.CLEAR_CHAT }, (response) => {
        if (response && response.success) {
          this.displayPinnedTabs([]); // Clear pinned tabs in UI
        }
      });
    });

    this.modelSelect.addEventListener("change", () => {
      chrome.storage.sync.set({ [StorageKeys.SELECTED_MODEL]: this.modelSelect.value });
    });

    this.promptForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.sendMessage();
    });

    this.promptInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    chrome.runtime.onMessage.addListener((request: any) => {
      if (request.type === MessageTypes.CURRENT_TAB_INFO) {
        this.updateCurrentTabInfo(request.tab);
      }
      if (request.type === MessageTypes.CHECK_PINNED_TABS) {
        this.checkPinnedTabs();
      }
    });
  }

  private async initialize() {
    // Load API Key and Selected Model
    chrome.storage.sync.get(
      [StorageKeys.API_KEY, StorageKeys.SELECTED_MODEL],
      (result) => {
        if (result[StorageKeys.API_KEY]) {
          this.apiKeyContainer.style.display = "none";
        } else {
          this.apiKeyContainer.style.display = "flex";
        }
        if (result.selectedModel) {
          this.modelSelect.value = result.selectedModel as string;
        }
      }
    );

    // Initial context update
    chrome.runtime.sendMessage({ type: MessageTypes.GET_CONTEXT }, (response) => {
      if (response) {
        if (response.pinnedContexts) {
          this.checkPinnedTabs();
        }
        if (response.tab) {
          this.updateCurrentTabInfo(response.tab);
        }
      }
    });

    // Rehydrate History
    await this.loadHistory();
  }

  private async loadHistory() {
    chrome.runtime.sendMessage({ type: MessageTypes.GET_HISTORY }, async (response) => {
      if (response && response.success && response.history) {
        for (const msg of response.history) {
          await this.appendMessage(msg.role, msg.text);
        }
      }
    });
  }

  private saveApiKey() {
    const apiKey = this.apiKeyInput.value;
    if (apiKey.trim() === "") {
      alert("Please enter your Gemini API Key.");
      return;
    }
    chrome.runtime.sendMessage(
      { type: MessageTypes.SAVE_API_KEY, apiKey: apiKey },
      (response) => {
        if (response && response.success) {
          this.apiKeyContainer.style.display = "none";
        } else {
          alert("Failed to save API Key.");
        }
      }
    );
  }

  private sendMessage() {
    const message = this.promptInput.value;
    if (message.trim() === "") return;

    this.appendMessage("user", message);
    this.promptInput.value = "";

    const thinkingMessageElement = this.appendThinkingMessage();

    chrome.runtime.sendMessage(
      {
        type: MessageTypes.CHAT_MESSAGE,
        message: message,
        model: this.modelSelect.value,
      },
      (response) => {
        thinkingMessageElement.remove();
        if (response && response.reply) {
          this.appendMessage("model", response.reply);
        } else if (response && response.error) {
          this.appendMessage("error", `Error: ${response.error}`);
        }
      }
    );
  }

  private appendThinkingMessage(): HTMLDivElement {
    const thinkingMessageElement = document.createElement("div");
    thinkingMessageElement.classList.add("message", "thinking");
    thinkingMessageElement.textContent = "Waiting for model response...";
    this.messagesDiv.appendChild(thinkingMessageElement);
    this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
    return thinkingMessageElement;
  }

  private async appendMessage(sender: string, text: string) {
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", sender);
    if (sender === "model") {
      messageElement.innerHTML = await marked.parse(text);
    } else {
      messageElement.textContent = text;
    }
    this.messagesDiv.appendChild(messageElement);
    this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
  }

  private pinCurrentTab() {
    chrome.runtime.sendMessage({ type: MessageTypes.PIN_TAB }, (response) => {
      if (response && response.success) {
        this.checkPinnedTabs();
      }
    });
  }

  private unpinTab(url: string) {
    chrome.runtime.sendMessage(
      { type: MessageTypes.UNPIN_TAB, url: url },
      (response) => {
        if (response && response.success) {
          this.checkPinnedTabs();
        }
      }
    );
  }

  private reopenTab(url: string) {
    chrome.runtime.sendMessage({ type: MessageTypes.REOPEN_TAB, url: url }, () => {
      this.checkPinnedTabs(); // Refresh pinned tabs after reopening
    });
  }

  private displayPinnedTabs(pinnedContexts: any[]) {
    this.pinnedTabsDiv.innerHTML = "";
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
    this.pinnedTabsDiv.appendChild(ul);
  }

  private checkPinnedTabs() {
    chrome.runtime.sendMessage(
      { type: MessageTypes.CHECK_PINNED_TABS },
      (response) => {
        if (response && response.success) {
          this.displayPinnedTabs(response.pinnedContexts);
        }
      }
    );
  }

  private updateCurrentTabInfo(tab: any) {
    if (tab) {
      this.currentTabDiv.innerHTML = `<span>Current: ${tab.title}</span><button id="pin-tab-button">+</button>`;
    } else {
      this.currentTabDiv.innerHTML = "<span>Current: No active tab found.</span>";
    }
  }
}
