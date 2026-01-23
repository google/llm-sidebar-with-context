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

import { marked } from "marked";
import { MessageTypes, StorageKeys } from "../constants";
import {
  ExtensionMessage,
  PinnedContext,
  TabInfo,
  GeminiResponse,
  GetContextResponse,
  SuccessResponse,
  CheckPinnedTabsResponse,
  GetHistoryResponse
} from "../types";
import { IStorageService } from "../services/storageService";
import { IMessageService } from "../services/messageService";

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

  constructor(
    private syncStorageService: IStorageService,
    private messageService: IMessageService
  ) {
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

    this.newChatButton.addEventListener("click", async () => {
      this.messagesDiv.innerHTML = ""; // Clear messages in UI
      const response = await this.messageService.sendMessage<SuccessResponse>({ type: MessageTypes.CLEAR_CHAT });
      if (response && response.success) {
        this.displayPinnedTabs([]); // Clear pinned tabs in UI
      }
    });

    this.modelSelect.addEventListener("change", () => {
      this.syncStorageService.set(StorageKeys.SELECTED_MODEL, this.modelSelect.value);
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

    this.messageService.onMessage((request: ExtensionMessage) => {
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
    const apiKey = await this.syncStorageService.get<string>(StorageKeys.API_KEY);
    const selectedModel = await this.syncStorageService.get<string>(StorageKeys.SELECTED_MODEL);

    if (apiKey) {
      this.apiKeyContainer.style.display = "none";
    } else {
      this.apiKeyContainer.style.display = "flex";
    }

    if (selectedModel) {
      this.modelSelect.value = selectedModel;
    }

    // Initial context update
    try {
      const response = await this.messageService.sendMessage<GetContextResponse>({ type: MessageTypes.GET_CONTEXT });
      if (response) {
        if (response.pinnedContexts) {
          this.checkPinnedTabs();
        }
        if (response.tab) {
          this.updateCurrentTabInfo(response.tab);
        }
      }
    } catch (error) {
      console.error("Failed to get context:", error);
    }

    // Rehydrate History
    await this.loadHistory();
  }

  private async loadHistory() {
    try {
      const response = await this.messageService.sendMessage<GetHistoryResponse>({ type: MessageTypes.GET_HISTORY });
      if (response && response.success && response.history) {
        for (const msg of response.history) {
          await this.appendMessage(msg.role, msg.text);
        }
      }
    } catch (error) {
      console.error("Failed to load history:", error);
    }
  }

  private async saveApiKey() {
    const apiKey = this.apiKeyInput.value;
    if (apiKey.trim() === "") {
      alert("Please enter your Gemini API Key.");
      return;
    }
    
    try {
      const response = await this.messageService.sendMessage<SuccessResponse>({ type: MessageTypes.SAVE_API_KEY, apiKey: apiKey });
      if (response && response.success) {
        this.apiKeyContainer.style.display = "none";
      } else {
        alert("Failed to save API Key.");
      }
    } catch (error) {
      console.error("Failed to save API key:", error);
      alert("Failed to save API Key.");
    }
  }

  private async sendMessage() {
    const message = this.promptInput.value;
    if (message.trim() === "") return;

    this.appendMessage("user", message);
    this.promptInput.value = "";

    const thinkingMessageElement = this.appendThinkingMessage();

    try {
      const response = await this.messageService.sendMessage<GeminiResponse>({
        type: MessageTypes.CHAT_MESSAGE,
        message: message,
        model: this.modelSelect.value,
      });

      thinkingMessageElement.remove();
      if (response && response.reply) {
        this.appendMessage("model", response.reply);
      } else if (response && response.error) {
        this.appendMessage("error", `Error: ${response.error}`);
      }
    } catch (error) {
      thinkingMessageElement.remove();
      this.appendMessage("error", `Error: ${error}`);
    }
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

  private async pinCurrentTab() {
    try {
      const response = await this.messageService.sendMessage<SuccessResponse>({ type: MessageTypes.PIN_TAB });
      if (response && response.success) {
        this.checkPinnedTabs();
      }
    } catch (error) {
      console.error("Failed to pin tab:", error);
    }
  }

  private async unpinTab(url: string) {
    try {
      const response = await this.messageService.sendMessage<SuccessResponse>({ type: MessageTypes.UNPIN_TAB, url: url });
      if (response && response.success) {
        this.checkPinnedTabs();
      }
    } catch (error) {
      console.error("Failed to unpin tab:", error);
    }
  }

  private async reopenTab(url: string) {
    try {
      await this.messageService.sendMessage({ type: MessageTypes.REOPEN_TAB, url: url });
      this.checkPinnedTabs(); // Refresh pinned tabs after reopening
    } catch (error) {
      console.error("Failed to reopen tab:", error);
    }
  }

  private displayPinnedTabs(pinnedContexts: PinnedContext[]) {
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

  private async checkPinnedTabs() {
    try {
      const response = await this.messageService.sendMessage<CheckPinnedTabsResponse>({ type: MessageTypes.CHECK_PINNED_TABS });
      if (response && response.success) {
        this.displayPinnedTabs(response.pinnedContexts);
      }
    } catch (error) {
      console.error("Failed to check pinned tabs:", error);
    }
  }

  private updateCurrentTabInfo(tab: TabInfo) {
    if (tab) {
      this.currentTabDiv.innerHTML = `<span>Current: ${tab.title}</span><button id="pin-tab-button">+</button>`;
    } else {
      this.currentTabDiv.innerHTML = "<span>Current: No active tab found.</span>";
    }
  }
}
