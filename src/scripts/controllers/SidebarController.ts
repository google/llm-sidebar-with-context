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
import {
  MessageTypes,
  StorageKeys,
  RestrictedURLs,
  Themes,
  SUPPORTED_MODELS,
  DEFAULT_MODEL,
} from '../constants';
import {
  ExtensionMessage,
  ExtensionResponse,
  TabInfo,
  GeminiResponse,
  GetContextResponse,
  SuccessResponse,
  CheckPinnedTabsResponse,
  GetHistoryResponse,
  ListChatsResponse,
  ChatSession,
} from '../types';
import {
  ISyncStorageService,
  ILocalStorageService,
} from '../services/storageService';
import { IMessageService } from '../services/messageService';
import { ICONS } from '../../../third_party/lucide/lucideIcons';
import { DropdownMenu, DropdownItem } from '../components/DropdownMenu';

export class SidebarController {
  private promptForm: HTMLFormElement;
  private promptInput: HTMLInputElement;
  private submitButton: HTMLButtonElement;
  private messagesDiv: HTMLDivElement;
  private settingsView: HTMLDivElement;
  private settingsError: HTMLDivElement;
  private apiKeyInput: HTMLInputElement;
  private saveSettingsButton: HTMLButtonElement;
  private cancelSettingsButton: HTMLButtonElement;
  private pinnedTabsDiv: HTMLDivElement;
  private currentTabDiv: HTMLDivElement;
  private modelSelect!: DropdownMenu;
  private themeSelect!: DropdownMenu;
  private chatHistorySelect!: DropdownMenu;
  private toggleSettingsButton: HTMLButtonElement;
  private newChatButton: HTMLButtonElement;
  private exportChatButton: HTMLButtonElement;
  private voiceButton: HTMLButtonElement;

  private pinnedContexts: TabInfo[] = [];
  private currentTab: TabInfo | null = null;
  private isCurrentTabShared: boolean = true;
  private isGenerating: boolean = false;
  private isSettingsOpen: boolean = false;
  private isSpeaking: boolean = false;
  private initialTheme: string = Themes.SYSTEM;
  private initialApiKey: string = '';

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
    this.settingsView = document.getElementById(
      'settings-view',
    ) as HTMLDivElement;
    this.settingsError = document.getElementById(
      'settings-error',
    ) as HTMLDivElement;
    this.apiKeyInput = document.getElementById(
      'api-key-input',
    ) as HTMLInputElement;
    this.saveSettingsButton = document.getElementById(
      'save-settings-button',
    ) as HTMLButtonElement;
    this.cancelSettingsButton = document.getElementById(
      'cancel-settings-button',
    ) as HTMLButtonElement;
    this.pinnedTabsDiv = document.getElementById(
      'pinned-tabs',
    ) as HTMLDivElement;
    this.currentTabDiv = document.getElementById(
      'current-tab',
    ) as HTMLDivElement;
    // modelSelect and themeSelect are DropdownMenu instances created in start()
    this.toggleSettingsButton = document.getElementById(
      'toggle-settings-button',
    ) as HTMLButtonElement;
    this.newChatButton = document.getElementById(
      'new-chat-button',
    ) as HTMLButtonElement;
    this.exportChatButton = document.getElementById(
      'export-chat-button',
    ) as HTMLButtonElement;
    this.voiceButton = document.getElementById(
      'voice-button',
    ) as HTMLButtonElement;

    // Set initial icon content
    this.submitButton.innerHTML = ICONS.SEND;
    this.voiceButton.innerHTML = ICONS.MIC;

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
      // Suggestion card clicks
      else if (target.dataset.prompt) {
        this.promptInput.value = target.dataset.prompt;
        this.promptInput.dispatchEvent(new Event('input'));
        this.setSendButtonActive();
        this.promptInput.focus();
      }
      // Message action buttons (delegated)
      else if (
        target.classList.contains('action-btn') &&
        target.dataset.action
      ) {
        this.handleActionButton(target);
      }
    });

    this.saveSettingsButton.addEventListener('click', () =>
      this.saveSettings(),
    );
    this.cancelSettingsButton.addEventListener('click', () =>
      this.cancelSettings(),
    );

    this.toggleSettingsButton.addEventListener('click', () => {
      if (!this.isSettingsOpen) {
        this.openSettings();
      }
    });

    this.newChatButton.addEventListener('click', async () => {
      this.messagesDiv.innerHTML = '';
      try {
        const response = await this.messageService.sendMessage<SuccessResponse>(
          {
            type: MessageTypes.CREATE_CHAT,
          },
        );
        if (response && response.success) {
          this.showWelcomeMessage();
          await this.refreshChatHistoryDropdown();
        }
      } catch (error) {
        console.error('Failed to create chat:', error);
      }
    });

    this.exportChatButton.addEventListener('click', () => this.exportChat());

    this.voiceButton.addEventListener('click', () => {
      // Voice input — placeholder for future implementation
      console.log('Voice input not yet implemented');
    });

    this.promptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.isGenerating) {
        this.stopGeneration();
      } else {
        this.sendMessage();
      }
    });

    this.promptInput.addEventListener('input', () => {
      this.setSendButtonActive();
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

  /** Returns the currently selected model value. Used by tests. */
  getSelectedModel(): string {
    return this.modelSelect.value;
  }

  /** Programmatically selects a theme in the dropdown. Used by tests. */
  selectTheme(theme: string): void {
    this.themeSelect.select(theme);
  }

  public async start() {
    // Load preferences first
    const apiKey = await this.syncStorageService.get<string>(
      StorageKeys.API_KEY,
    );
    const selectedModel = await this.syncStorageService.get<string>(
      StorageKeys.SELECTED_MODEL,
    );
    const theme = await this.syncStorageService.get<string>(StorageKeys.THEME);

    const validThemes = Object.values(Themes);
    const effectiveTheme =
      theme && validThemes.includes(theme) ? theme : Themes.SYSTEM;

    const effectiveModel =
      selectedModel &&
      Object.prototype.hasOwnProperty.call(SUPPORTED_MODELS, selectedModel)
        ? selectedModel
        : DEFAULT_MODEL;

    // Create dropdowns with correct initial values
    this.initModelSelect(effectiveModel);
    this.initThemeSelect(effectiveTheme);
    this.initChatHistorySelect();
    this.applyTheme(effectiveTheme);

    if (apiKey) {
      this.apiKeyInput.value = apiKey;
      this.toggleSettingsView(false);
    } else {
      this.openSettings();
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

  private initModelSelect(initialValue: string) {
    const container = document.getElementById('model-select') as HTMLDivElement;
    const items: DropdownItem[] = (
      Object.entries(SUPPORTED_MODELS) as [string, string][]
    ).map(([id, label]) => ({
      value: id,
      label: label,
      description: id,
    }));
    this.modelSelect = new DropdownMenu(
      container,
      items,
      initialValue,
      (value) => {
        this.syncStorageService.set(StorageKeys.SELECTED_MODEL, value);
      },
    );
  }

  private initThemeSelect(initialValue: string) {
    const container = document.getElementById('theme-select') as HTMLDivElement;
    const items: DropdownItem[] = [
      { value: 'system', label: 'Default (System)', description: 'Auto' },
      { value: 'light', label: 'Light', description: 'Light mode' },
      { value: 'dark', label: 'Dark', description: 'Dark mode' },
    ];
    this.themeSelect = new DropdownMenu(
      container,
      items,
      initialValue,
      (value) => {
        this.applyTheme(value);
      },
    );
  }

  /**
   * Formats a Unix timestamp (ms) into a short, human-readable date string.
   */
  private formatChatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Initializes the chat history dropdown in the sidebar header.
   * Lists all saved chat sessions and allows switching between them.
   */
  private async initChatHistorySelect() {
    const container = document.getElementById(
      'chat-history-select',
    ) as HTMLDivElement;
    if (!container) return;

    const defaultItems: DropdownItem[] = [
      { value: '', label: 'Chats', description: 'Loading...' },
    ];

    this.chatHistorySelect = new DropdownMenu(
      container,
      defaultItems,
      '',
      async (chatId) => {
        if (!chatId) return;
        await this.loadChatById(chatId);
      },
      { triggerIcon: ICONS.HISTORY },
    );

    await this.refreshChatHistoryDropdown();
  }

  /**
   * Refreshes the chat history dropdown items from the background.
   */
  private async refreshChatHistoryDropdown() {
    try {
      const response = await this.messageService.sendMessage<ListChatsResponse>(
        {
          type: MessageTypes.LIST_CHATS,
        },
      );

      if (!response || !response.success || !response.chats) return;

      const items: DropdownItem[] = response.chats.map((chat: ChatSession) => ({
        value: chat.id,
        label: chat.title || 'New Chat',
        description: this.formatChatDate(chat.createdAt),
      }));

      this.chatHistorySelect.refreshItems(items);

      // If the active chat exists in the list, select it
      if (response.activeChatId) {
        const exists = items.some((i) => i.value === response.activeChatId);
        if (exists) {
          this.chatHistorySelect.value = response.activeChatId;
        }
      }
    } catch (error) {
      console.error('Failed to refresh chat history dropdown:', error);
    }
  }

  /**
   * Switches to a chat by ID and loads its messages into the UI.
   */
  private async loadChatById(chatId: string) {
    try {
      const response = await this.messageService.sendMessage<SuccessResponse>({
        type: MessageTypes.LOAD_CHAT,
        chatId,
      });

      if (!response || !response.success) return;

      // Clear UI and reload messages for the active chat
      this.messagesDiv.innerHTML = '';
      await this.loadHistory();
    } catch (error) {
      console.error('Failed to load chat:', error);
    }
  }

  private openSettings() {
    this.clearError();
    this.initialTheme = this.themeSelect.value;
    this.initialApiKey = this.apiKeyInput.value;
    this.isSettingsOpen = true;
    this.toggleSettingsView(true);
    this.apiKeyInput.focus();
  }

  private async saveSettings() {
    this.clearError();
    const apiKey = this.apiKeyInput.value;
    if (!apiKey || apiKey.trim() === '') {
      this.showError('Please enter your Gemini API Key.', this.apiKeyInput);
      return;
    }

    try {
      await this.syncStorageService.set(StorageKeys.API_KEY, apiKey);
      await this.syncStorageService.set(
        StorageKeys.THEME,
        this.themeSelect.value,
      );
      this.isSettingsOpen = false;
      this.toggleSettingsView(false);
      this.toggleSettingsButton.focus();
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showError('Failed to save settings.');
    }
  }

  private cancelSettings() {
    this.clearError();
    this.applyTheme(this.initialTheme);
    this.themeSelect.value = this.initialTheme;
    this.apiKeyInput.value = this.initialApiKey;
    this.isSettingsOpen = false;
    this.toggleSettingsView(false);
    this.toggleSettingsButton.focus();
  }

  private showError(message: string, errorElement?: HTMLElement) {
    this.settingsError.textContent = message;
    this.settingsError.classList.remove('hidden');
    if (errorElement) {
      errorElement.classList.add('input-error');
      errorElement.focus();
    }
  }

  private clearError() {
    this.settingsError.textContent = '';
    this.settingsError.classList.add('hidden');
    this.settingsView.querySelectorAll('.input-error').forEach((el) => {
      el.classList.remove('input-error');
    });
  }

  private toggleSettingsView(show: boolean) {
    if (show) {
      this.settingsView.classList.remove('hidden');
      this.messagesDiv.classList.add('hidden');
      this.promptForm.classList.add('hidden');
    } else {
      this.settingsView.classList.add('hidden');
      this.messagesDiv.classList.remove('hidden');
      this.promptForm.classList.remove('hidden');
    }
  }

  private applyTheme(theme: string) {
    if (theme === Themes.SYSTEM) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  /** Toggle the send button active state based on input content. */
  private setSendButtonActive() {
    const hasContent = this.promptInput.value.trim().length > 0;
    this.submitButton.classList.toggle(
      'active',
      hasContent && !this.isGenerating,
    );
  }

  /** Dispatches delegated message action button clicks. */
  private handleActionButton(btn: HTMLButtonElement) {
    const action = btn.dataset.action;
    const msgDiv = btn.closest('.message') as HTMLDivElement;
    if (!msgDiv) return;

    switch (action) {
      case 'copy':
        this.copyMessage(msgDiv, btn);
        break;
      case 'redo':
        this.regenerateMessage(msgDiv);
        break;
      case 'speak':
        this.speakMessage(msgDiv);
        break;
      case 'edit':
        this.editMessage(msgDiv);
        break;
    }
  }

  /** Copies the model message text to clipboard. */
  private async copyMessage(msgDiv: HTMLDivElement, btn: HTMLButtonElement) {
    const contentDiv = msgDiv.querySelector(
      '.ai-content',
    ) as HTMLDivElement | null;
    const text = contentDiv ? contentDiv.textContent || '' : '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add('copied');
      btn.title = 'Copied';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.title = 'Copy';
      }, 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
    }
  }

  /** Speaks or stops the model message using the Web Speech API. */
  private speakMessage(msgDiv: HTMLDivElement) {
    // If already speaking, stop and reset
    if (this.isSpeaking) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
      // Remove active state from all speak buttons
      this.messagesDiv
        .querySelectorAll('.action-btn[data-action="speak"]')
        .forEach((b) => b.classList.remove('active'));
      return;
    }

    const contentDiv = msgDiv.querySelector(
      '.ai-content',
    ) as HTMLDivElement | null;
    const text = contentDiv ? contentDiv.textContent || '' : '';
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => {
      this.isSpeaking = false;
      this.messagesDiv
        .querySelectorAll('.action-btn[data-action="speak"]')
        .forEach((b) => b.classList.remove('active'));
    };
    utterance.onerror = () => {
      this.isSpeaking = false;
      this.messagesDiv
        .querySelectorAll('.action-btn[data-action="speak"]')
        .forEach((b) => b.classList.remove('active'));
    };

    this.isSpeaking = true;
    // Highlight the triggering speak button
    const speakBtn = msgDiv.querySelector(
      '.action-btn[data-action="speak"]',
    ) as HTMLButtonElement | null;
    if (speakBtn) speakBtn.classList.add('active');
    window.speechSynthesis.speak(utterance);
  }

  /** Regenerates a model response by re-sending the prior user message. */
  private async regenerateMessage(msgDiv: HTMLDivElement) {
    if (this.isGenerating) return;

    // Find the user message preceding this model message
    const messages = Array.from(this.messagesDiv.querySelectorAll('.message'));
    const idx = messages.indexOf(msgDiv);
    if (idx <= 0) return;

    const prevMsg = messages[idx - 1];
    if (!prevMsg.classList.contains('user')) return;
    const prevBubble = prevMsg.querySelector('.bubble');
    const userText = prevBubble
      ? prevBubble.textContent || ''
      : prevMsg.textContent || '';
    if (!userText) return;

    // Remove this model message and all after it, then re-send
    for (let i = messages.length - 1; i >= idx; i--) {
      messages[i].remove();
    }

    await this.messageService.sendMessage({
      type: MessageTypes.STOP_GENERATION,
    });

    this.promptInput.value = userText;
    this.setSendButtonActive();
    await this.sendMessage();
  }

  /** Edits a user message inline, then resubmits. */
  private editMessage(msgDiv: HTMLDivElement) {
    if (this.isGenerating) return;

    const originalText =
      msgDiv.querySelector('.bubble')?.textContent || msgDiv.textContent || '';
    const container = document.createElement('div');
    container.style.cssText =
      'display:flex;flex-direction:column;gap:8px;max-width:92%;';
    const textarea = document.createElement('textarea');
    textarea.value = originalText;
    textarea.style.cssText =
      'width:100%;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-family:inherit;font-size:var(--text-sm);resize:vertical;min-height:60px;outline:none;background:var(--bg-main);color:var(--text-main);';
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save & Send';
    saveBtn.style.cssText =
      'padding:6px 14px;background:var(--primary);color:var(--primary-foreground);border:none;border-radius:6px;cursor:pointer;font-size:var(--text-xs);font-weight:600;';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText =
      'padding:6px 14px;background:transparent;color:var(--text-muted);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:var(--text-xs);';
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    container.appendChild(textarea);
    container.appendChild(btnRow);
    msgDiv.replaceWith(container);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const save = async () => {
      const newText = textarea.value.trim();
      if (!newText) return;
      // Remove all messages from the edited one onward
      const nextSibling = container.nextElementSibling;
      while (container.nextElementSibling) {
        container.nextElementSibling.remove();
      }
      if (nextSibling) {
        nextSibling.remove();
      }
      container.remove();
      // Re-send the edited message
      await this.messageService.sendMessage({
        type: MessageTypes.STOP_GENERATION,
      });
      this.promptInput.value = newText;
      this.setSendButtonActive();
      await this.sendMessage();
    };

    const cancel = () => {
      const newBubble = document.createElement('div');
      newBubble.className = msgDiv.classList.contains('bubble')
        ? 'bubble'
        : 'message user';
      if (msgDiv.classList.contains('user')) {
        newBubble.className = 'message user';
        const innerBubble = document.createElement('div');
        innerBubble.className = 'bubble';
        innerBubble.textContent = originalText;
        newBubble.appendChild(innerBubble);
      } else {
        newBubble.textContent = originalText;
      }
      container.replaceWith(newBubble);
    };

    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', cancel);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        save();
      }
      if (e.key === 'Escape') cancel();
    });
  }

  private async loadHistory() {
    try {
      const response =
        await this.messageService.sendMessage<GetHistoryResponse>({
          type: MessageTypes.GET_HISTORY,
        });
      if (response && response.success && response.history) {
        if (response.history.length === 0) {
          this.showWelcomeMessage();
          return;
        }
        for (const msg of response.history) {
          await this.appendMessage(msg.role, msg.text);
        }
      } else {
        this.showWelcomeMessage();
      }
    } catch (error) {
      console.error('Failed to load history:', error);
      this.appendMessage(
        'system',
        'System: Failed to load chat history. Try starting a new chat.',
      );
    }
  }

  private showWelcomeMessage() {
    this.messagesDiv.innerHTML = `
      <div class="welcome-container">
        <h1>Hello!</h1>
        <p>How can I help you today?</p>
        <div class="suggestion-grid">
          <button class="suggestion-card" data-prompt="Summarize the key points from the current page.">
            <span class="suggestion-card__title">Summarize</span>
            <span class="suggestion-card__subtitle">Extract key points from this page</span>
          </button>
          <button class="suggestion-card" data-prompt="Explain the code on this page in simple terms.">
            <span class="suggestion-card__title">Explain Code</span>
            <span class="suggestion-card__subtitle">Break down code snippets clearly</span>
          </button>
          <button class="suggestion-card" data-prompt="Compare the information across my open tabs.">
            <span class="suggestion-card__title">Compare Tabs</span>
            <span class="suggestion-card__subtitle">Cross-reference pinned pages</span>
          </button>
          <button class="suggestion-card" data-prompt="Research this topic and find recent news about it.">
            <span class="suggestion-card__title">Research</span>
            <span class="suggestion-card__subtitle">Search and find relevant info</span>
          </button>
        </div>
      </div>
    `;
  }

  private async sendMessage() {
    const message = this.promptInput.value;
    if (message.trim() === '' || this.isGenerating) return;

    // Remove welcome message if it exists
    const welcome = this.messagesDiv.querySelector('.welcome-container');
    if (welcome) {
      this.messagesDiv.innerHTML = '';
    }

    this.isGenerating = true;
    this.submitButton.innerHTML = ICONS.STOP;
    this.submitButton.title = 'Stop generation';
    // Stop button is always visible when generating
    this.submitButton.classList.remove('active');

    this.appendMessage('user', message);
    this.promptInput.value = '';
    this.promptInput.style.height = 'auto';
    this.setSendButtonActive();

    const thinkingMessageElement = this.appendThinkingMessage();
    const startTime = Date.now();

    try {
      const response = await this.messageService.sendMessage<GeminiResponse>({
        type: MessageTypes.CHAT_MESSAGE,
        message: message,
        model: this.modelSelect.value,
        includeCurrentTab: this.isCurrentTabShared,
      });

      thinkingMessageElement.remove();
      const duration = (Date.now() - startTime) / 1000;

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
        // If we removed the only message, show welcome back
        if (this.messagesDiv.children.length === 0) {
          this.showWelcomeMessage();
        }
      } else if (response && response.reply) {
        this.appendMessage('model', response.reply, duration);
      } else if (response && response.error) {
        this.appendMessage('error', `Error: ${response.error}`);
      }
    } catch (error: unknown) {
      thinkingMessageElement.remove();
      const err = error as Error;
      if (
        err.message &&
        err.message.includes('Extension context invalidated.')
      ) {
        this.appendMessage(
          'system',
          'System: Extension updated. Reloading to reconnect...',
        );
        setTimeout(() => window.location.reload(), 1000);
      } else {
        this.appendMessage('error', `Error: ${error}`);
      }
    } finally {
      this.isGenerating = false;
      this.submitButton.innerHTML = ICONS.SEND;
      this.submitButton.title = 'Send prompt';
      this.setSendButtonActive();
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
    const wrapper = document.createElement('div');
    wrapper.classList.add('message', 'thinking');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing';
    typingDiv.innerHTML =
      '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
    wrapper.appendChild(typingDiv);
    this.messagesDiv.appendChild(wrapper);
    this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
    return wrapper;
  }

  private async appendMessage(sender: string, text: string, duration?: number) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);
    if (sender === 'model') {
      const contentDiv = document.createElement('div');
      contentDiv.className = 'ai-content';
      contentDiv.innerHTML = await marked.parse(text);
      messageElement.appendChild(contentDiv);

      // Footer with duration
      if (typeof duration === 'number') {
        const footer = document.createElement('div');
        footer.className = 'message-footer';
        const durationSpan = document.createElement('span');
        durationSpan.className = 'response-duration';
        durationSpan.textContent = `${duration.toFixed(1)}s`;
        footer.appendChild(durationSpan);
        messageElement.appendChild(footer);
      }

      // Action bar: copy, redo, speak
      const actions = document.createElement('div');
      actions.className = 'message-actions';
      actions.innerHTML = `
        <button class="action-btn" data-action="copy" title="Copy">
          <span class="copy-icon">${ICONS.COPY}</span>
          <span class="check-icon">${ICONS.CHECK}</span>
        </button>
        <button class="action-btn" data-action="redo" title="Regenerate">
          ${ICONS.REDO}
        </button>
        <button class="action-btn" data-action="speak" title="Read aloud">
          ${ICONS.SPEAK}
        </button>
      `;
      messageElement.appendChild(actions);
    } else if (sender === 'user') {
      // User message — bubble style
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = text;
      messageElement.appendChild(bubble);

      // Edit button
      const actions = document.createElement('div');
      actions.className = 'message-actions';
      actions.innerHTML = `
        <button class="action-btn" data-action="edit" title="Edit message">
          ${ICONS.EDIT}
        </button>
      `;
      messageElement.appendChild(actions);
    } else {
      // System, error, or thinking — plain text, no actions
      messageElement.textContent = text;
    }
    this.messagesDiv.appendChild(messageElement);
    this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
  }

  private async exportChat() {
    try {
      const response =
        await this.messageService.sendMessage<GetHistoryResponse>({
          type: MessageTypes.GET_HISTORY,
        });
      if (!response || !response.success || !Array.isArray(response.history)) {
        this.appendMessage(
          'error',
          'Export failed: no chat history to export.',
        );
        return;
      }

      const lines: string[] = [];
      for (const msg of response.history) {
        const label = msg.role === 'user' ? 'You' : 'Gemini';
        lines.push(`${label}\n${msg.text}\n`);
      }
      const markdown = lines.join('\n');

      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `chat-export-${date}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export chat:', error);
      this.appendMessage('error', 'Export failed. Please try again.');
    }
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
      const faviconHtml = context.favIconUrl
        ? `<img src="${context.favIconUrl}" class="favicon" alt="${context.title}" />`
        : '';
      const buttons = `
        <button class="icon-button unpin-button" data-id="${context.id}" title="Unpin this tab">
          ${ICONS.CLOSE}
        </button>`;
      li.innerHTML = `${faviconHtml}<span>${context.title}</span>${buttons}`;
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

    const faviconHtml = tab.favIconUrl
      ? `<img src="${tab.favIconUrl}" class="favicon" alt="${tab.title}" />`
      : '';

    this.currentTabDiv.innerHTML = `${shareButtonHtml}${faviconHtml}<span>Current: ${tab.title}</span>${pinButtonHtml}`;
  }
}
