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

import { marked } from 'marked';
import { MessageTypes, StorageKeys, RestrictedURLs } from '../constants';
import {
  ExtensionMessage,
  ExtensionResponse,
  TabInfo,
  GeminiResponse,
  GetContextResponse,
  SuccessResponse,
  CheckPinnedTabsResponse,
  GetHistoryResponse,
} from '../types';
import {
  ISyncStorageService,
  ILocalStorageService,
} from '../services/storageService';
import { IMessageService } from '../services/messageService';

const ICONS = {
  PIN: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-pin"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>`,
  PINNED: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check-circle"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
  RESTRICTED: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-slash"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`,
  EYE: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-eye"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  EYE_OFF: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-eye-off"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
  CLOSE: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-x"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  STOP: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-square"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`,
  SEND: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-send"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`,
};

export class SidebarController {
  private promptForm: HTMLFormElement;
  private promptInput: HTMLInputElement;
  private submitButton: HTMLButtonElement;
  private messagesDiv: HTMLDivElement;
  private apiKeyInput: HTMLInputElement;
  private saveApiKeyButton: HTMLButtonElement;
  private apiKeyContainer: HTMLDivElement;
  private pinnedTabsDiv: HTMLDivElement;
  private currentTabDiv: HTMLDivElement;
  private modelSelect: HTMLSelectElement;
  private editApiKeyButton: HTMLButtonElement;
  private newChatButton: HTMLButtonElement;

  private pinnedContexts: TabInfo[] = [];
  private currentTab: TabInfo | null = null;
  private isCurrentTabShared: boolean = true;
  private isGenerating: boolean = false;

  constructor(
    private syncStorageService: ISyncStorageService,
    private localStorageService: ILocalStorageService,
    private messageService: IMessageService,
  ) {
    this.promptForm = document.getElementById('prompt-form') as HTMLFormElement;
    this.promptInput = document.getElementById(
      'prompt-input',
    ) as HTMLInputElement;
    this.submitButton = document.getElementById(
      'send-button',
    ) as HTMLButtonElement;
    this.messagesDiv = document.getElementById('messages') as HTMLDivElement;
    this.apiKeyInput = document.getElementById(
      'api-key-input',
    ) as HTMLInputElement;
    this.saveApiKeyButton = document.getElementById(
      'save-api-key-button',
    ) as HTMLButtonElement;
    this.apiKeyContainer = document.getElementById(
      'api-key-container',
    ) as HTMLDivElement;
    this.pinnedTabsDiv = document.getElementById(
      'pinned-tabs',
    ) as HTMLDivElement;
    this.currentTabDiv = document.getElementById(
      'current-tab',
    ) as HTMLDivElement;
    this.modelSelect = document.getElementById(
      'model-select',
    ) as HTMLSelectElement;
    this.editApiKeyButton = document.getElementById(
      'edit-api-key-button',
    ) as HTMLButtonElement;
    this.newChatButton = document.getElementById(
      'new-chat-button',
    ) as HTMLButtonElement;

    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Use event delegation for dynamically created buttons
    document.body.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('button');
      if (!target) return;

      if (target.id === 'pin-tab-button') {
        if (!this.currentTab) return;
        const isPinned = this.pinnedContexts.some(
          (t) => t.id === this.currentTab!.id,
        );
        if (isPinned) {
          this.unpinTab(this.currentTab.id);
        } else {
          this.pinCurrentTab();
        }
      } else if (target.id === 'toggle-share-button') {
        this.toggleCurrentTabSharing();
      } else if (target.classList.contains('unpin-button')) {
        this.unpinTab(Number(target.dataset.id));
      }
    });

    this.saveApiKeyButton.addEventListener('click', () => this.saveApiKey());
    this.editApiKeyButton.addEventListener('click', () => {
      const isHidden = this.apiKeyContainer.style.display === 'none';
      this.apiKeyContainer.style.display = isHidden ? 'flex' : 'none';
    });

    this.newChatButton.addEventListener('click', async () => {
      this.messagesDiv.innerHTML = ''; // Clear messages in UI
      const response = await this.messageService.sendMessage<SuccessResponse>({
        type: MessageTypes.CLEAR_CHAT,
      });
      if (response && response.success) {
        this.displayPinnedTabs([]); // Clear pinned tabs in UI
      }
    });

    this.modelSelect.addEventListener('change', () => {
      this.syncStorageService.set(
        StorageKeys.SELECTED_MODEL,
        this.modelSelect.value,
      );
    });

    this.promptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.isGenerating) {
        this.stopGeneration();
      } else {
        this.sendMessage();
      }
    });

    this.promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.isGenerating) {
          this.sendMessage();
        }
      }
    });

    this.messageService.onMessage(
      (
        request: ExtensionMessage,
        _sender: unknown,
        sendResponse: (response?: ExtensionResponse) => void,
      ) => {
        if (request.type === MessageTypes.CURRENT_TAB_INFO) {
          this.updateCurrentTabInfo(request.tab);
          sendResponse({ success: true });
        }
        if (request.type === MessageTypes.CHECK_PINNED_TABS) {
          this.checkPinnedTabs();
          sendResponse({ success: true });
        }
      },
    );
  }

  public async start() {
    // Load API Key and Selected Model
    const apiKey = await this.syncStorageService.get<string>(
      StorageKeys.API_KEY,
    );
    const selectedModel = await this.syncStorageService.get<string>(
      StorageKeys.SELECTED_MODEL,
    );

    if (apiKey) {
      this.apiKeyContainer.style.display = 'none';
      this.apiKeyInput.value = apiKey;
    } else {
      this.apiKeyContainer.style.display = 'flex';
    }

    if (selectedModel) {
      this.modelSelect.value = selectedModel;
    }

    // Load Sharing Preference
    const storedSharing = await this.localStorageService.get<boolean>(
      StorageKeys.INCLUDE_CURRENT_TAB,
    );
    if (storedSharing !== undefined) {
      this.isCurrentTabShared = storedSharing;
    }

    // Initial context update
    try {
      const response =
        await this.messageService.sendMessage<GetContextResponse>({
          type: MessageTypes.GET_CONTEXT,
        });
      if (response) {
        if (response.pinnedContexts) {
          this.displayPinnedTabs(response.pinnedContexts);
        }
        this.updateCurrentTabInfo(response.tab as TabInfo); // Always update, even if null
      }
    } catch (error) {
      console.error('Failed to get context:', error);
    }

    // Rehydrate History
    await this.loadHistory();
  }

  private async loadHistory() {
    try {
      const response =
        await this.messageService.sendMessage<GetHistoryResponse>({
          type: MessageTypes.GET_HISTORY,
        });
      if (response && response.success && response.history) {
        for (const msg of response.history) {
          await this.appendMessage(msg.role, msg.text);
        }
      }
    } catch (error) {
      console.error('Failed to load history:', error);
      this.appendMessage(
        'system',
        'System: Failed to load chat history. Try starting a new chat.',
      );
    }
  }

  private async saveApiKey() {
    const apiKey = this.apiKeyInput.value;
    if (apiKey.trim() === '') {
      alert('Please enter your Gemini API Key.');
      return;
    }

    try {
      const response = await this.messageService.sendMessage<SuccessResponse>({
        type: MessageTypes.SAVE_API_KEY,
        apiKey: apiKey,
      });
      if (response && response.success) {
        this.apiKeyContainer.style.display = 'none';
      } else {
        alert('Failed to save API Key.');
      }
    } catch (error) {
      console.error('Failed to save API key:', error);
      alert('Failed to save API Key.');
    }
  }

  private async sendMessage() {
    const message = this.promptInput.value;
    if (message.trim() === '' || this.isGenerating) return;

    this.isGenerating = true;
    this.submitButton.innerHTML = ICONS.STOP;
    this.submitButton.title = 'Stop generation';

    this.appendMessage('user', message);
    this.promptInput.value = '';

    const thinkingMessageElement = this.appendThinkingMessage();

    try {
      const response = await this.messageService.sendMessage<GeminiResponse>({
        type: MessageTypes.CHAT_MESSAGE,
        message: message,
        model: this.modelSelect.value,
        includeCurrentTab: this.isCurrentTabShared,
      });

      thinkingMessageElement.remove();

      if (
        response &&
        (response.aborted ||
          (response.error && response.error.toLowerCase().includes('aborted')))
      ) {
        // Restore message to input if aborted
        this.promptInput.value = message;
        // Remove the user message from UI as well to match history
        const lastMessage = this.messagesDiv.lastElementChild;
        if (lastMessage && lastMessage.classList.contains('user')) {
          lastMessage.remove();
        }
      } else if (response && response.reply) {
        this.appendMessage('model', response.reply);
      } else if (response && response.error) {
        this.appendMessage('error', `Error: ${response.error}`);
      }
    } catch (error) {
      thinkingMessageElement.remove();
      this.appendMessage('error', `Error: ${error}`);
    } finally {
      this.isGenerating = false;
      this.submitButton.innerHTML = ICONS.SEND;
      this.submitButton.title = 'Send prompt';
    }
  }

  private async stopGeneration() {
    try {
      await this.messageService.sendMessage({
        type: MessageTypes.STOP_GENERATION,
      });
    } catch (error) {
      console.error('Failed to stop generation:', error);
    }
  }

  private appendThinkingMessage(): HTMLDivElement {
    const thinkingMessageElement = document.createElement('div');
    thinkingMessageElement.classList.add('message', 'thinking');
    thinkingMessageElement.textContent = 'Waiting for model response...';
    this.messagesDiv.appendChild(thinkingMessageElement);
    this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
    return thinkingMessageElement;
  }

  private async appendMessage(sender: string, text: string) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);
    if (sender === 'model') {
      messageElement.innerHTML = await marked.parse(text);
    } else {
      messageElement.textContent = text;
    }
    this.messagesDiv.appendChild(messageElement);
    this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
  }

  private async pinCurrentTab() {
    try {
      const response = await this.messageService.sendMessage<SuccessResponse>({
        type: MessageTypes.PIN_TAB,
      });
      if (response && response.success) {
        this.checkPinnedTabs();
      } else if (response && response.message) {
        this.appendMessage('system', `System: ${response.message}`);
      }
    } catch (error) {
      console.error('Failed to pin tab:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.appendMessage('system', `System: ${errorMessage}`);
    }
  }

  private async unpinTab(tabId: number) {
    try {
      const response = await this.messageService.sendMessage<SuccessResponse>({
        type: MessageTypes.UNPIN_TAB,
        tabId: tabId,
      });
      if (response && response.success) {
        this.checkPinnedTabs();
      }
    } catch (error) {
      console.error('Failed to unpin tab:', error);
    }
  }

  private displayPinnedTabs(pinnedContexts: TabInfo[]) {
    this.pinnedContexts = pinnedContexts || [];
    this.pinnedTabsDiv.innerHTML = '';

    // Refresh current tab icon as its state might change based on pinned list
    if (this.currentTab) {
      this.updateCurrentTabInfo(this.currentTab);
    }

    if (!this.pinnedContexts || this.pinnedContexts.length === 0) {
      return;
    }
    const ul = document.createElement('ul');
    this.pinnedContexts.forEach((context) => {
      const li = document.createElement('li');
      const buttons = `
        <button class="icon-button unpin-button" data-id="${context.id}" title="Unpin this tab">
          ${ICONS.CLOSE}
        </button>`;
      li.innerHTML = `<span>${context.title}</span>${buttons}`;
      ul.appendChild(li);
    });
    this.pinnedTabsDiv.appendChild(ul);
  }

  private async checkPinnedTabs() {
    try {
      const response =
        await this.messageService.sendMessage<CheckPinnedTabsResponse>({
          type: MessageTypes.CHECK_PINNED_TABS,
        });
      if (response && response.success) {
        this.displayPinnedTabs(response.pinnedContexts);
      }
    } catch (error) {
      console.error('Failed to check pinned tabs:', error);
    }
  }

  private async toggleCurrentTabSharing() {
    this.isCurrentTabShared = !this.isCurrentTabShared;
    await this.localStorageService.set(
      StorageKeys.INCLUDE_CURRENT_TAB,
      this.isCurrentTabShared,
    );
    if (this.currentTab) {
      this.updateCurrentTabInfo(this.currentTab);
    }
  }

  private updateCurrentTabInfo(tab: TabInfo) {
    this.currentTab = tab;

    if (!tab) {
      this.currentTabDiv.innerHTML =
        '<span>Current: No active tab found.</span>';
      return;
    }

    const isPinned = this.pinnedContexts.some((t) => t.id === tab.id);
    const isRestricted = RestrictedURLs.some((url) => tab.url.startsWith(url));

    let pinButtonHtml = '';
    if (isRestricted) {
      // Restricted Icon
      pinButtonHtml = `
        <button id="pin-tab-button" class="icon-button restricted" title="Can't pin restricted tab: ${tab.url}" disabled>
          ${ICONS.RESTRICTED}
        </button>`;
    } else if (isPinned) {
      // Pinned Icon
      pinButtonHtml = `
        <button id="pin-tab-button" class="icon-button pinned" title="Click to unpin current tab">
          ${ICONS.PINNED}
        </button>`;
    } else {
      // Pinnable Icon
      pinButtonHtml = `
        <button id="pin-tab-button" class="icon-button pinnable" title="Click to pin current tab">
          ${ICONS.PIN}
        </button>`;
    }

    const eyeIcon = this.isCurrentTabShared ? ICONS.EYE : ICONS.EYE_OFF;

    const shareButtonHtml = `
      <button id="toggle-share-button" class="icon-button ${this.isCurrentTabShared ? 'active' : ''}" title="${this.isCurrentTabShared ? 'Current tab is being shared. Click to stop sharing current tab' : 'Current tab is NOT being shared. Click to start sharing.'}">
        ${eyeIcon}
      </button>
    `;

    this.currentTabDiv.innerHTML = `${shareButtonHtml}<span>Current: ${tab.title}</span>${pinButtonHtml}`;
  }
}
