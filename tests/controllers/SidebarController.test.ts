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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SidebarController } from '../../src/scripts/controllers/SidebarController';
import { ISyncStorageService } from '../../src/scripts/services/storageService';
import { IMessageService } from '../../src/scripts/services/messageService';
import {
  MessageTypes,
  StorageKeys,
  DEFAULT_MODEL,
  Providers,
} from '../../src/scripts/constants';
import {
  ExtensionMessage,
  ExtensionResponse,
  GetHistoryResponse,
  SuccessResponse,
} from '../../src/scripts/types';
import fs from 'fs';
import path from 'path';

// Mock marked to avoid issues in Node environment
vi.mock('marked', () => ({
  marked: {
    parse: vi.fn((text) => Promise.resolve(`<p>${text}</p>`)),
  },
}));

const htmlContent = fs.readFileSync(
  path.resolve(__dirname, '../../src/pages/sidebar.html'),
  'utf8',
);

describe('SidebarController', () => {
  let controller: SidebarController;
  let mockSyncStorage: ISyncStorageService;
  let mockLocalStorage: ISyncStorageService;
  let mockMessageService: IMessageService;

  beforeEach(() => {
    vi.unstubAllGlobals();
    // Reset DOM
    document.body.innerHTML = htmlContent;
    document.documentElement.removeAttribute('data-theme');

    mockSyncStorage = {
      get: vi.fn(),
      set: vi.fn(),
    };
    mockLocalStorage = {
      get: vi.fn(),
      set: vi.fn(),
    };
    mockMessageService = {
      sendMessage: vi.fn().mockResolvedValue({}),
      onMessage: vi.fn(),
    };

    controller = new SidebarController(
      mockSyncStorage,
      mockLocalStorage,
      mockMessageService,
    );
  });

  describe('Initialization', () => {
    it('should hide settings-view and show messages if API key exists in storage', async () => {
      vi.mocked(mockSyncStorage.get).mockImplementation(async (key) => {
        if (key === StorageKeys.API_KEY) return 'fake-api-key';
        return undefined;
      });

      await controller.start();

      const settingsView = document.getElementById('settings-view');
      const messages = document.getElementById('messages');
      const promptForm = document.getElementById('prompt-form');
      expect(settingsView?.classList.contains('hidden')).toBe(true);
      expect(messages?.classList.contains('hidden')).toBe(false);
      expect(promptForm?.classList.contains('hidden')).toBe(false);
    });

    it('should show settings-view and hide messages and the bottom panel if API key is missing', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue(undefined);

      await controller.start();

      const settingsView = document.getElementById('settings-view');
      const messages = document.getElementById('messages');
      const bottomPanel = document.getElementById('bottom-panel');
      expect(settingsView?.classList.contains('hidden')).toBe(false);
      expect(messages?.classList.contains('hidden')).toBe(true);
      expect(bottomPanel?.classList.contains('hidden')).toBe(true);
    });

    it('should load selected model from storage', async () => {
      vi.mocked(mockSyncStorage.get).mockImplementation(async (key) => {
        if (key === StorageKeys.GEMINI_MODEL) return 'gemini-2.5-pro';
        return undefined;
      });

      await controller.start();

      const select = document.getElementById(
        'model-select',
      ) as HTMLSelectElement;
      expect(select.value).toBe('gemini-2.5-pro');
    });

    it('should use default model if none is found in storage', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue(undefined);

      await controller.start();

      const select = document.getElementById(
        'model-select',
      ) as HTMLSelectElement;
      expect(select.value).toBe(DEFAULT_MODEL);
    });

    it('should fallback to default model if an unsupported model is found in storage', async () => {
      vi.mocked(mockSyncStorage.get).mockImplementation(async (key) => {
        if (key === StorageKeys.GEMINI_MODEL) return 'gemini-2.5-flash-lite';
        return undefined;
      });

      await controller.start();

      const select = document.getElementById(
        'model-select',
      ) as HTMLSelectElement;
      expect(select.value).toBe(DEFAULT_MODEL);
    });
  });

  describe('Settings UI Overhaul', () => {
    it('should show settings-view and hide messages and the whole bottom panel when settings button is clicked', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('fake-key');
      await controller.start();

      const settingsView = document.getElementById(
        'settings-view',
      ) as HTMLElement;
      const messages = document.getElementById('messages') as HTMLElement;
      const bottomPanel = document.getElementById(
        'bottom-panel',
      ) as HTMLElement;
      const settingsButton = document.getElementById(
        'toggle-settings-button',
      ) as HTMLButtonElement;

      expect(settingsView.classList.contains('hidden')).toBe(true);
      expect(messages.classList.contains('hidden')).toBe(false);
      expect(bottomPanel.classList.contains('hidden')).toBe(false);

      settingsButton.click();

      expect(settingsView.classList.contains('hidden')).toBe(false);
      expect(messages.classList.contains('hidden')).toBe(true);
      // The whole bottom panel (current tab, provider/model controls, prompt
      // form) is hidden so nothing outside the settings view is interactive.
      expect(bottomPanel.classList.contains('hidden')).toBe(true);
    });

    it('should stay in settings-view when settings button is clicked twice', async () => {
      await controller.start();
      const settingsView = document.getElementById(
        'settings-view',
      ) as HTMLElement;
      const settingsButton = document.getElementById(
        'toggle-settings-button',
      ) as HTMLButtonElement;

      settingsButton.click();
      expect(settingsView.classList.contains('hidden')).toBe(false);

      settingsButton.click();
      expect(settingsView.classList.contains('hidden')).toBe(false); // Should still be open
    });

    it('should apply theme preview immediately on change but not save to storage', async () => {
      vi.mocked(mockSyncStorage.get).mockImplementation(async (key) => {
        if (key === StorageKeys.THEME) return 'light';
        return undefined;
      });
      await controller.start();

      const themeSelect = document.getElementById(
        'theme-select',
      ) as HTMLSelectElement;
      const settingsButton = document.getElementById(
        'toggle-settings-button',
      ) as HTMLButtonElement;

      settingsButton.click();

      themeSelect.value = 'dark';
      themeSelect.dispatchEvent(new Event('change'));

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(mockSyncStorage.set).not.toHaveBeenCalledWith(
        StorageKeys.THEME,
        'dark',
      );
    });

    it('should persist API key and theme to storage when Save is clicked', async () => {
      vi.mocked(mockSyncStorage.get).mockImplementation(async (key) => {
        if (key === StorageKeys.THEME) return 'light';
        if (key === StorageKeys.API_KEY) return 'old-key';
        return undefined;
      });
      await controller.start();

      const settingsButton = document.getElementById(
        'toggle-settings-button',
      ) as HTMLButtonElement;
      settingsButton.click();

      const apiKeyInput = document.getElementById(
        'api-key-input',
      ) as HTMLInputElement;
      const themeSelect = document.getElementById(
        'theme-select',
      ) as HTMLSelectElement;
      const saveButton = document.getElementById(
        'save-settings-button',
      ) as HTMLButtonElement;

      apiKeyInput.value = 'new-key';
      themeSelect.value = 'dark';
      themeSelect.dispatchEvent(new Event('change'));

      saveButton.click();

      await vi.waitFor(() => {
        expect(mockSyncStorage.set).toHaveBeenCalledWith(
          StorageKeys.API_KEY,
          'new-key',
        );
        expect(mockSyncStorage.set).toHaveBeenCalledWith(
          StorageKeys.THEME,
          'dark',
        );
        const settingsView = document.getElementById(
          'settings-view',
        ) as HTMLElement;
        const promptForm = document.getElementById(
          'prompt-form',
        ) as HTMLElement;
        expect(settingsView.classList.contains('hidden')).toBe(true);
        expect(promptForm.classList.contains('hidden')).toBe(false);
      });
    });

    it('should revert theme and not save when Cancel is clicked, and restore UI', async () => {
      vi.mocked(mockSyncStorage.get).mockImplementation(async (key) => {
        if (key === StorageKeys.THEME) return 'light';
        return undefined;
      });
      await controller.start();

      const settingsButton = document.getElementById(
        'toggle-settings-button',
      ) as HTMLButtonElement;
      settingsButton.click();

      const themeSelect = document.getElementById(
        'theme-select',
      ) as HTMLSelectElement;
      const cancelButton = document.getElementById(
        'cancel-settings-button',
      ) as HTMLButtonElement;

      themeSelect.value = 'dark';
      themeSelect.dispatchEvent(new Event('change'));
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      // Only writes from the cancel action itself matter below.
      vi.mocked(mockSyncStorage.set).mockClear();

      cancelButton.click();

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(mockSyncStorage.set).not.toHaveBeenCalled();

      const settingsView = document.getElementById(
        'settings-view',
      ) as HTMLElement;
      const promptForm = document.getElementById('prompt-form') as HTMLElement;
      expect(settingsView.classList.contains('hidden')).toBe(true);
      expect(promptForm.classList.contains('hidden')).toBe(false);
    });

    it('should show inline error and not save if API key is empty', async () => {
      await controller.start();

      const settingsButton = document.getElementById(
        'toggle-settings-button',
      ) as HTMLButtonElement;
      settingsButton.click();

      const apiKeyInput = document.getElementById(
        'api-key-input',
      ) as HTMLInputElement;
      const saveButton = document.getElementById(
        'save-settings-button',
      ) as HTMLButtonElement;
      const settingsError = document.getElementById(
        'settings-error',
      ) as HTMLDivElement;

      apiKeyInput.value = '   ';
      // Only writes from the failed save attempt itself matter below.
      vi.mocked(mockSyncStorage.set).mockClear();
      await saveButton.click();

      expect(settingsError.textContent).toBe(
        'Please enter your Gemini API Key.',
      );
      expect(settingsError.classList.contains('hidden')).toBe(false);
      expect(apiKeyInput.classList.contains('input-error')).toBe(true);
      expect(document.activeElement).toBe(apiKeyInput);
      expect(mockSyncStorage.set).not.toHaveBeenCalled();
    });

    it('should show inline error if saving settings fails, and verify focus', async () => {
      await controller.start();

      const settingsButton = document.getElementById(
        'toggle-settings-button',
      ) as HTMLButtonElement;
      settingsButton.click();

      const apiKeyInput = document.getElementById(
        'api-key-input',
      ) as HTMLInputElement;
      apiKeyInput.value = 'valid-key-to-avoid-empty-check';

      const saveButton = document.getElementById(
        'save-settings-button',
      ) as HTMLButtonElement;
      const settingsError = document.getElementById(
        'settings-error',
      ) as HTMLDivElement;

      // Mock storage.set to throw
      vi.mocked(mockSyncStorage.set).mockRejectedValue(
        new Error('Quota exceeded'),
      );

      await saveButton.click();

      expect(settingsError.textContent).toBe('Failed to save settings.');
      expect(settingsError.classList.contains('hidden')).toBe(false);
    });

    it('should clear error state when re-opening settings', async () => {
      await controller.start();

      const settingsButton = document.getElementById(
        'toggle-settings-button',
      ) as HTMLButtonElement;
      settingsButton.click();

      const apiKeyInput = document.getElementById(
        'api-key-input',
      ) as HTMLInputElement;
      const saveButton = document.getElementById(
        'save-settings-button',
      ) as HTMLButtonElement;
      const settingsError = document.getElementById(
        'settings-error',
      ) as HTMLDivElement;

      // Trigger error
      apiKeyInput.value = '';
      await saveButton.click();
      expect(settingsError.classList.contains('hidden')).toBe(false);

      // Click cancel (which should clear error)
      const cancelButton = document.getElementById(
        'cancel-settings-button',
      ) as HTMLButtonElement;
      cancelButton.click();

      // Re-open
      settingsButton.click();
      expect(settingsError.classList.contains('hidden')).toBe(true);
      expect(apiKeyInput.classList.contains('input-error')).toBe(false);
    });

    it('should manage focus correctly when navigating settings', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('fake-key');
      await controller.start();

      const settingsButton = document.getElementById(
        'toggle-settings-button',
      ) as HTMLButtonElement;
      const apiKeyInput = document.getElementById(
        'api-key-input',
      ) as HTMLInputElement;

      // Open settings
      settingsButton.click();
      expect(document.activeElement).toBe(apiKeyInput);

      // Cancel
      const cancelButton = document.getElementById(
        'cancel-settings-button',
      ) as HTMLButtonElement;
      cancelButton.click();
      expect(document.activeElement).toBe(settingsButton);

      // Open again
      settingsButton.click();
      expect(document.activeElement).toBe(apiKeyInput);

      // Save
      const saveButton = document.getElementById(
        'save-settings-button',
      ) as HTMLButtonElement;
      saveButton.click();
      await vi.waitFor(() => {
        expect(document.activeElement).toBe(settingsButton);
      });
    });
  });

  describe('Tab Context Updates', () => {
    let messageListener: Parameters<IMessageService['onMessage']>[0];

    beforeEach(() => {
      vi.mocked(mockMessageService.onMessage).mockImplementation((listener) => {
        messageListener = listener;
      });
      controller = new SidebarController(
        mockSyncStorage,
        mockLocalStorage,
        mockMessageService,
      );
    });

    it('should update current tab info when receiving a message', () => {
      messageListener(
        {
          type: MessageTypes.CURRENT_TAB_INFO,
          tab: {
            id: 1,
            title: 'First Page',
            url: 'https://a.com',
            favIconUrl: 'https://a.com/favicon.ico',
          },
        },
        {},
        vi.fn(),
      );

      const div = document.getElementById('current-tab');
      expect(div?.textContent).toContain('First Page');
      const img = div?.querySelector('img.favicon') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toBe('https://a.com/favicon.ico');
      expect(img.alt).toBe('First Page');
    });

    it('should NOT render favicon for current tab if favIconUrl is missing', () => {
      messageListener(
        {
          type: MessageTypes.CURRENT_TAB_INFO,
          tab: {
            id: 1,
            title: 'No Favicon Page',
            url: 'https://b.com',
            // favIconUrl missing
          },
        },
        {},
        vi.fn(),
      );

      const div = document.getElementById('current-tab');
      expect(div?.textContent).toContain('No Favicon Page');
      const img = div?.querySelector('img.favicon');
      expect(img).toBeNull();
    });

    it('should update title correctly when switching tabs', () => {
      const div = document.getElementById('current-tab');

      messageListener(
        {
          type: MessageTypes.CURRENT_TAB_INFO,
          tab: { id: 1, title: 'Tab 1', url: 'https://1.com' },
        },
        {},
        vi.fn(),
      );
      expect(div?.textContent).toContain('Tab 1');

      messageListener(
        {
          type: MessageTypes.CURRENT_TAB_INFO,
          tab: { id: 2, title: 'Tab 2', url: 'https://2.com' },
        },
        {},
        vi.fn(),
      );
      expect(div?.textContent).toContain('Tab 2');
      expect(div?.textContent).not.toContain('Tab 1');
    });

    it('should handle delayed title updates (loading -> complete)', () => {
      const div = document.getElementById('current-tab');

      messageListener(
        {
          type: MessageTypes.CURRENT_TAB_INFO,
          tab: {
            id: 1,
            title: 'https://google.com',
            url: 'https://google.com',
          },
        },
        {},
        vi.fn(),
      );
      expect(div?.textContent).toContain('https://google.com');

      messageListener(
        {
          type: MessageTypes.CURRENT_TAB_INFO,
          tab: { id: 1, title: 'Google Search', url: 'https://google.com' },
        },
        {},
        vi.fn(),
      );

      expect(div?.textContent).toContain('Google Search');
      expect(div?.textContent).not.toContain('https://google.comGoogle Search');
    });
  });

  describe('Pinned Tabs', () => {
    it('should display pinned tabs with and without favicons', async () => {
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_CONTEXT) {
            return {
              pinnedContexts: [
                {
                  id: 101,
                  title: 'With Icon',
                  url: 'https://p1.com',
                  favIconUrl: 'https://p1.com/icon.png',
                },
                { id: 102, title: 'No Icon', url: 'https://p2.com' },
              ],
            };
          }
          return {};
        },
      );

      await controller.start();

      const pinnedDiv = document.getElementById('pinned-tabs');
      const items = pinnedDiv?.querySelectorAll('li');
      expect(items?.length).toBe(2);

      // Item 1: With Icon
      expect(items?.[0].textContent).toContain('With Icon');
      const img1 = items?.[0].querySelector('img.favicon') as HTMLImageElement;
      expect(img1).toBeTruthy();
      expect(img1.src).toBe('https://p1.com/icon.png');
      expect(img1.alt).toBe('With Icon');

      // Item 2: No Icon
      expect(items?.[1].textContent).toContain('No Icon');
      const img2 = items?.[1].querySelector('img.favicon');
      expect(img2).toBeNull();
    });

    it('should unpin a tab when x button is clicked', async () => {
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_CONTEXT) {
            return {
              pinnedContexts: [
                { id: 101, title: 'Pinned 1', url: 'https://p1.com' },
              ],
            };
          }
          if (msg.type === MessageTypes.CHECK_PINNED_TABS) {
            return {
              success: true,
              pinnedContexts: [
                { id: 101, title: 'Pinned 1', url: 'https://p1.com' },
              ],
            };
          }
          return { success: true };
        },
      );

      await controller.start();

      const unpinButton = document.querySelector(
        '.unpin-button',
      ) as HTMLButtonElement;
      expect(unpinButton.dataset.id).toBe('101');

      unpinButton.click();

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: MessageTypes.UNPIN_TAB,
        tabId: 101,
      });
    });
  });

  describe('Chat Interaction', () => {
    it('should send message and display response', async () => {
      const promptInput = document.getElementById(
        'prompt-input',
      ) as HTMLInputElement;
      const promptForm = document.getElementById(
        'prompt-form',
      ) as HTMLFormElement;
      const messagesDiv = document.getElementById('messages') as HTMLDivElement;

      promptInput.value = 'Hello';
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue({
        reply: 'Hi User',
      });

      promptForm.dispatchEvent(new Event('submit'));

      expect(messagesDiv.textContent).toContain('Hello');
      await vi.waitFor(() => {
        expect(messagesDiv.innerHTML).toContain('Hi User');
      });

      const modelMsg = messagesDiv.querySelector('.message.model');
      expect(modelMsg?.querySelector('.message-footer')).toBeTruthy();
      expect(modelMsg?.querySelector('.copy-button')).toBeTruthy();
    });

    it('should copy text to clipboard and show success state when copy button is clicked', async () => {
      vi.useFakeTimers();
      // Mock clipboard API
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
      };
      Object.assign(navigator, { clipboard: mockClipboard });

      const promptInput = document.getElementById(
        'prompt-input',
      ) as HTMLInputElement;
      const promptForm = document.getElementById(
        'prompt-form',
      ) as HTMLFormElement;
      const messagesDiv = document.getElementById('messages') as HTMLDivElement;

      promptInput.value = 'Hello';
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue({
        reply: 'Response to copy',
      });

      promptForm.dispatchEvent(new Event('submit'));

      await vi.waitFor(() => {
        expect(messagesDiv.textContent).toContain('Response to copy');
      });

      const copyBtn = messagesDiv.querySelector(
        '.copy-button',
      ) as HTMLButtonElement;
      expect(copyBtn).toBeTruthy();

      await copyBtn.click();

      expect(mockClipboard.writeText).toHaveBeenCalledWith('Response to copy');
      expect(copyBtn.classList.contains('success')).toBe(true);
      expect(copyBtn.textContent).toContain('Copied markdown to clipboard');

      // Verify it resets after timeout
      vi.advanceTimersByTime(2100);
      expect(copyBtn.classList.contains('success')).toBe(false);
      expect(copyBtn.textContent).not.toContain('Copied markdown to clipboard');

      vi.useRealTimers();
    });

    it('should display error message if backend returns an error', async () => {
      const promptInput = document.getElementById(
        'prompt-input',
      ) as HTMLInputElement;
      const promptForm = document.getElementById(
        'prompt-form',
      ) as HTMLFormElement;
      const messagesDiv = document.getElementById('messages') as HTMLDivElement;

      promptInput.value = 'Hello';
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue({
        error: 'API Quota Exceeded',
      });

      promptForm.dispatchEvent(new Event('submit'));

      await vi.waitFor(() => {
        const errorMsg = messagesDiv.querySelector('.message.error');
        expect(errorMsg?.textContent).toContain('Error: API Quota Exceeded');
      });
    });

    it('should display error message if sending message throws exception', async () => {
      const promptInput = document.getElementById(
        'prompt-input',
      ) as HTMLInputElement;
      const promptForm = document.getElementById(
        'prompt-form',
      ) as HTMLFormElement;
      const messagesDiv = document.getElementById('messages') as HTMLDivElement;

      promptInput.value = 'Hello';
      vi.mocked(mockMessageService.sendMessage).mockRejectedValue(
        new Error('Network Failure'),
      );

      promptForm.dispatchEvent(new Event('submit'));

      await vi.waitFor(() => {
        const errorMsg = messagesDiv.querySelector('.message.error');
        expect(errorMsg?.textContent).toContain(
          'Error: Error: Network Failure',
        );
      });
    });

    it('should handle context invalidation error by reloading the page', async () => {
      vi.useFakeTimers();
      // Mock window.location.reload
      const mockReload = vi.fn();
      vi.stubGlobal('location', {
        ...window.location,
        reload: mockReload,
      });

      const promptInput = document.getElementById(
        'prompt-input',
      ) as HTMLInputElement;
      const promptForm = document.getElementById(
        'prompt-form',
      ) as HTMLFormElement;
      const messagesDiv = document.getElementById('messages') as HTMLDivElement;

      promptInput.value = 'Hello';
      vi.mocked(mockMessageService.sendMessage).mockRejectedValue(
        new Error('Extension context invalidated.'),
      );

      promptForm.dispatchEvent(new Event('submit'));

      await vi.waitFor(() => {
        const systemMsg = messagesDiv.querySelector('.message.system');
        expect(systemMsg?.textContent).toContain(
          'Extension updated. Reloading to reconnect...',
        );
      });

      // Wait for the reload to be called (it's inside a setTimeout)
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockReload).toHaveBeenCalled();
    });

    it('should show Stop button during generation and send STOP message on click', async () => {
      const promptInput = document.getElementById(
        'prompt-input',
      ) as HTMLInputElement;
      const promptForm = document.getElementById(
        'prompt-form',
      ) as HTMLFormElement;
      const sendButton = document.getElementById(
        'send-button',
      ) as HTMLButtonElement;

      promptInput.value = 'Long running task';

      // Create a promise to control when sendMessage resolves
      let resolveMessage: (val: ExtensionResponse) => void;
      const messagePromise = new Promise<ExtensionResponse>((resolve) => {
        resolveMessage = resolve;
      });

      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.CHAT_MESSAGE) {
            return messagePromise;
          }
          if (msg.type === MessageTypes.STOP_GENERATION) {
            return { success: true };
          }
          return {};
        },
      );

      // 1. Submit form to start generation
      promptForm.dispatchEvent(new Event('submit'));

      // Verify button changed to Stop
      expect(sendButton.title).toBe('Stop generation');
      expect(sendButton.innerHTML).toContain('rect'); // Basic check for stop icon svg

      // 2. Click Stop button (triggers submit)
      promptForm.dispatchEvent(new Event('submit'));

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: MessageTypes.STOP_GENERATION,
      });

      // 3. Resolve the original message as aborted
      resolveMessage!({ aborted: true });

      // 4. Verify button resets
      await vi.waitFor(() => {
        expect(sendButton.title).toBe('Send prompt');
      });
    });

    it('should restore input and remove message bubble when aborted', async () => {
      const promptInput = document.getElementById(
        'prompt-input',
      ) as HTMLInputElement;
      const promptForm = document.getElementById(
        'prompt-form',
      ) as HTMLFormElement;
      const messagesDiv = document.getElementById('messages') as HTMLDivElement;

      promptInput.value = 'Cancelled message';
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue({
        aborted: true,
      });

      promptForm.dispatchEvent(new Event('submit'));

      // Input should be restored
      await vi.waitFor(() => {
        expect(promptInput.value).toBe('Cancelled message');
        // User message bubble should be gone
        expect(messagesDiv.textContent).not.toContain('Cancelled message');
      });
    });

    it('should handle aborts reported as generic errors (fallback logic)', async () => {
      const promptInput = document.getElementById(
        'prompt-input',
      ) as HTMLInputElement;
      const promptForm = document.getElementById(
        'prompt-form',
      ) as HTMLFormElement;
      const messagesDiv = document.getElementById('messages') as HTMLDivElement;

      promptInput.value = 'Cancelled message';
      // Simulate the backend failing to catch the abort correctly and returning it as an error string
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue({
        error: 'Error: signal is aborted without reason',
      });

      promptForm.dispatchEvent(new Event('submit'));

      // Input should be restored because the error string contains "aborted"
      await vi.waitFor(() => {
        expect(promptInput.value).toBe('Cancelled message');
        // User message bubble should be gone
        expect(messagesDiv.textContent).not.toContain('Cancelled message');
        // Should NOT show the error message
        expect(messagesDiv.textContent).not.toContain('signal is aborted');
      });
    });
  });

  describe('Icon Logic', () => {
    it('should render PIN icon and call PIN_TAB when tab is pinnable', async () => {
      const currentTab = {
        id: 101,
        title: 'Google',
        url: 'https://google.com',
      };
      vi.mocked(mockSyncStorage.get).mockResolvedValue('test-api-key');
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_CONTEXT) {
            return { pinnedContexts: [], tab: currentTab };
          }
          return { success: true };
        },
      );

      await controller.start();

      const pinButton = document.getElementById(
        'pin-tab-button',
      ) as HTMLButtonElement;
      expect(pinButton).toBeTruthy();
      expect(pinButton.className).toContain('pinnable');
      expect(pinButton.disabled).toBe(false);

      pinButton.click();
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: MessageTypes.PIN_TAB,
      });
    });

    it('should render UNPIN icon and call UNPIN_TAB when tab is already pinned', async () => {
      const currentTab = {
        id: 101,
        title: 'Google',
        url: 'https://google.com',
      };
      const pinnedContexts = [currentTab];

      vi.mocked(mockSyncStorage.get).mockResolvedValue('test-api-key');
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_CONTEXT) {
            return { pinnedContexts, tab: currentTab };
          }
          return { success: true };
        },
      );

      await controller.start();

      const pinButton = document.getElementById(
        'pin-tab-button',
      ) as HTMLButtonElement;
      expect(pinButton).toBeTruthy();
      expect(pinButton.className).toContain('pinned');
      expect(pinButton.title).toContain('unpin');

      pinButton.click();
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: MessageTypes.UNPIN_TAB,
        tabId: 101,
      });
    });

    it('should render RESTRICTED icon and be disabled when URL is restricted', async () => {
      const currentTab = {
        id: 102,
        title: 'Settings',
        url: 'chrome://settings',
      };

      vi.mocked(mockSyncStorage.get).mockResolvedValue('test-api-key');
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_CONTEXT) {
            return { pinnedContexts: [], tab: currentTab };
          }
          return { success: true };
        },
      );

      await controller.start();

      const pinButton = document.getElementById(
        'pin-tab-button',
      ) as HTMLButtonElement;
      expect(pinButton).toBeTruthy();
      expect(pinButton.className).toContain('restricted');
      expect(pinButton.disabled).toBe(true);
      expect(pinButton.title).toContain('restricted');
    });

    it('should display a system message if pinning fails', async () => {
      const currentTab = {
        id: 101,
        title: 'Google',
        url: 'https://google.com',
      };
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_CONTEXT) {
            return { pinnedContexts: [], tab: currentTab };
          }
          if (msg.type === MessageTypes.PIN_TAB) {
            return { success: false, message: 'Cannot pin restricted URL' };
          }
          return { success: true };
        },
      );

      await controller.start();

      const pinButton = document.getElementById(
        'pin-tab-button',
      ) as HTMLButtonElement;
      pinButton.click();

      await vi.waitFor(() => {
        const messagesDiv = document.getElementById(
          'messages',
        ) as HTMLDivElement;
        const systemMsg = messagesDiv.querySelector('.message.system');
        expect(systemMsg?.textContent).toBe(
          'System: Cannot pin restricted URL',
        );
      });
    });

    it('should display system message when pinning limit is reached', async () => {
      const currentTab = {
        id: 101,
        title: 'Google',
        url: 'https://google.com',
      };
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_CONTEXT) {
            return { pinnedContexts: [], tab: currentTab };
          }
          if (msg.type === MessageTypes.PIN_TAB) {
            return {
              success: false,
              message: 'You can only pin up to 6 tabs.',
            };
          }
          return { success: true };
        },
      );

      await controller.start();

      const pinButton = document.getElementById(
        'pin-tab-button',
      ) as HTMLButtonElement;
      pinButton.click();

      await vi.waitFor(() => {
        const messagesDiv = document.getElementById(
          'messages',
        ) as HTMLDivElement;
        const systemMsg = messagesDiv.querySelector('.message.system');
        expect(systemMsg?.textContent).toBe(
          'System: You can only pin up to 6 tabs.',
        );
      });
    });
  });

  describe('History Rehydration Error Handling', () => {
    it('should display a system message if history loading throws an error', async () => {
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_HISTORY) {
            throw new Error('Storage failure');
          }
          return { success: true };
        },
      );

      await controller.start();

      const messagesDiv = document.getElementById('messages') as HTMLDivElement;
      const systemMsg = messagesDiv.querySelector('.message.system');
      expect(systemMsg?.textContent).toBe(
        'System: Failed to load chat history. Try starting a new chat.',
      );
    });
  });

  describe('Sharing Toggle', () => {
    beforeEach(() => {
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_CONTEXT) {
            return {
              pinnedContexts: [],
              tab: { id: 1, title: 'Test Tab', url: 'https://test.com' },
            };
          }
          return { success: true };
        },
      );
    });

    it('should load sharing preference from localStorage on start', async () => {
      vi.mocked(mockLocalStorage.get).mockImplementation(async (key) => {
        if (key === StorageKeys.INCLUDE_CURRENT_TAB) return false;
        return undefined;
      });

      await controller.start();

      const toggleButton = document.getElementById(
        'toggle-share-button',
      ) as HTMLButtonElement;
      expect(toggleButton).not.toBeNull();
      expect(toggleButton.className).not.toContain('active');
      expect(toggleButton.title).toContain('start sharing');
    });

    it('should toggle sharing state and save to localStorage when clicked', async () => {
      vi.mocked(mockLocalStorage.get).mockResolvedValue(true);
      await controller.start();

      let toggleButton = document.getElementById(
        'toggle-share-button',
      ) as HTMLButtonElement;
      expect(toggleButton.className).toContain('active');

      toggleButton.click();

      expect(mockLocalStorage.set).toHaveBeenCalledWith(
        StorageKeys.INCLUDE_CURRENT_TAB,
        false,
      );

      // Wait for UI to update using waitFor
      await vi.waitFor(() => {
        toggleButton = document.getElementById(
          'toggle-share-button',
        ) as HTMLButtonElement;
        expect(toggleButton.className).not.toContain('active');
      });
    });

    it('should pass includeCurrentTab=false in CHAT_MESSAGE when sharing is disabled', async () => {
      vi.mocked(mockLocalStorage.get).mockResolvedValue(false);
      await controller.start();

      const promptForm = document.getElementById(
        'prompt-form',
      ) as HTMLFormElement;
      const promptInput = document.getElementById(
        'prompt-input',
      ) as HTMLInputElement;
      promptInput.value = 'Test message';

      promptForm.dispatchEvent(new Event('submit'));

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageTypes.CHAT_MESSAGE,
          includeCurrentTab: false,
        }),
      );
    });

    it('should handle the case where no active tab is found (no toggle rendered)', async () => {
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_CONTEXT) {
            return { pinnedContexts: [], tab: null };
          }
          return { success: true };
        },
      );

      await controller.start();

      const currentTabDiv = document.getElementById('current-tab');
      expect(currentTabDiv?.textContent).toContain('No active tab found.');

      const toggleButton = document.getElementById('toggle-share-button');
      expect(toggleButton).toBeNull();
    });
  });

  describe('Welcome Message', () => {
    it('should show welcome message if history is empty on start', async () => {
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_HISTORY) {
            return { success: true, history: [] };
          }
          return { success: true };
        },
      );

      await controller.start();

      const messagesDiv = document.getElementById('messages') as HTMLDivElement;
      expect(messagesDiv.querySelector('.welcome-container')).not.toBeNull();
      expect(messagesDiv.textContent).toContain(
        'Welcome to LLM Sidebar with Context',
      );
    });

    it('should show welcome message after clicking New Chat', async () => {
      // Start with some history
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_HISTORY) {
            return {
              success: true,
              history: [{ role: 'user', text: 'Hello' }],
            };
          }
          if (msg.type === MessageTypes.CLEAR_CHAT) {
            return { success: true };
          }
          return { success: true };
        },
      );

      await controller.start();

      const messagesDiv = document.getElementById('messages') as HTMLDivElement;
      expect(messagesDiv.textContent).toContain('Hello');
      expect(messagesDiv.querySelector('.welcome-container')).toBeNull();

      const newChatButton = document.getElementById(
        'new-chat-button',
      ) as HTMLButtonElement;
      await newChatButton.click();

      expect(messagesDiv.querySelector('.welcome-container')).not.toBeNull();
      expect(messagesDiv.textContent).not.toContain('Hello');
    });

    it('should hide welcome message when a prompt is sent', async () => {
      // Start with empty history (welcome shown)
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_HISTORY) {
            return { success: true, history: [] };
          }
          if (msg.type === MessageTypes.CHAT_MESSAGE) {
            return { reply: 'Response' };
          }
          return { success: true };
        },
      );

      await controller.start();

      const messagesDiv = document.getElementById('messages') as HTMLDivElement;
      expect(messagesDiv.querySelector('.welcome-container')).not.toBeNull();

      const promptInput = document.getElementById(
        'prompt-input',
      ) as HTMLInputElement;
      const promptForm = document.getElementById(
        'prompt-form',
      ) as HTMLFormElement;

      promptInput.value = 'First prompt';
      promptForm.dispatchEvent(new Event('submit'));

      expect(messagesDiv.querySelector('.welcome-container')).toBeNull();
      expect(messagesDiv.textContent).toContain('First prompt');
    });
  });

  describe('Response Timer', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should show live timer updates in thinking message', async () => {
      const promptInput = document.getElementById(
        'prompt-input',
      ) as HTMLInputElement;
      const promptForm = document.getElementById(
        'prompt-form',
      ) as HTMLFormElement;
      const messagesDiv = document.getElementById('messages') as HTMLDivElement;

      promptInput.value = 'Hello';

      let resolveMessage: (val: ExtensionResponse) => void;
      const messagePromise = new Promise<ExtensionResponse>((resolve) => {
        resolveMessage = resolve;
      });

      vi.mocked(mockMessageService.sendMessage).mockReturnValue(messagePromise);

      promptForm.dispatchEvent(new Event('submit'));

      // Advance time by 1.5 seconds
      await vi.advanceTimersByTimeAsync(1500);

      const thinkingMsg = messagesDiv.querySelector('.message.thinking');
      // Allow for small variations in timing (1.4s, 1.5s, or 1.6s)
      expect(thinkingMsg?.textContent).toMatch(
        /Waiting for model response... \(1\.[4-6]s\)/,
      );

      // Resolve message
      resolveMessage!({ reply: 'Response' });

      await vi.waitFor(() => {
        expect(messagesDiv.querySelector('.message.thinking')).toBeNull();
      });
    });

    it('should display final duration in message footer', async () => {
      const promptInput = document.getElementById(
        'prompt-input',
      ) as HTMLInputElement;
      const promptForm = document.getElementById(
        'prompt-form',
      ) as HTMLFormElement;
      const messagesDiv = document.getElementById('messages') as HTMLDivElement;

      promptInput.value = 'Hello';

      vi.mocked(mockMessageService.sendMessage).mockImplementation(async () => {
        await vi.advanceTimersByTimeAsync(2300);
        return { reply: 'Response' };
      });

      promptForm.dispatchEvent(new Event('submit'));

      await vi.waitFor(() => {
        const durationSpan = messagesDiv.querySelector('.response-duration');
        // Allow for small variations in timing (2.2s, 2.3s, or 2.4s)
        expect(durationSpan?.textContent).toMatch(/2\.[234]s/);
      });
    });

    it('should not display duration for history messages', async () => {
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (msg.type === MessageTypes.GET_HISTORY) {
            return {
              success: true,
              history: [{ role: 'model', text: 'Old message' }],
            } as GetHistoryResponse;
          }
          return { success: true } as SuccessResponse;
        },
      );

      await controller.start();

      const messagesDiv = document.getElementById('messages') as HTMLDivElement;
      const durationSpan = messagesDiv.querySelector('.response-duration');
      expect(durationSpan).toBeNull();
    });
  });

  describe('Provider settings (Gemini + Ollama)', () => {
    function el<T extends HTMLElement>(id: string): T {
      return document.getElementById(id) as T;
    }

    function stubStorage(values: Record<string, unknown>) {
      vi.mocked(mockSyncStorage.get).mockImplementation(
        async (key: string) => values[key],
      );
    }

    function stubOllamaMessages(models: string[] | null) {
      vi.mocked(mockMessageService.sendMessage).mockImplementation(
        async (msg: ExtensionMessage) => {
          if (
            msg.type === MessageTypes.OLLAMA_LIST_MODELS ||
            msg.type === MessageTypes.OLLAMA_TEST_CONNECTION
          ) {
            return models
              ? { success: true, models }
              : { success: false, models: [], error: 'unreachable' };
          }
          return { success: true, history: [] };
        },
      );
    }

    const savedOllama = {
      enabled: true,
      host: 'http://localhost:9999',
      numCtx: '8192',
      keepAlive: '10m',
    };

    describe('panel collapse', () => {
      it('should collapse a provider panel body when its toggle is off', async () => {
        stubStorage({ [StorageKeys.API_KEY]: 'key' });
        await controller.start();

        const geminiBody = el<HTMLDivElement>('gemini-panel-body');
        const ollamaBody = el<HTMLDivElement>('ollama-panel-body');
        // Gemini defaults to enabled; Ollama defaults to disabled.
        expect(geminiBody.classList.contains('hidden')).toBe(false);
        expect(ollamaBody.classList.contains('hidden')).toBe(true);

        const geminiToggle = el<HTMLInputElement>('gemini-enabled-toggle');
        geminiToggle.checked = false;
        geminiToggle.dispatchEvent(new Event('change'));
        expect(geminiBody.classList.contains('hidden')).toBe(true);

        const ollamaToggle = el<HTMLInputElement>('ollama-enabled-toggle');
        ollamaToggle.checked = true;
        ollamaToggle.dispatchEvent(new Event('change'));
        expect(ollamaBody.classList.contains('hidden')).toBe(false);
      });

      it('should disable Save iff both providers are off', async () => {
        stubStorage({ [StorageKeys.API_KEY]: 'key' });
        await controller.start();

        const geminiToggle = el<HTMLInputElement>('gemini-enabled-toggle');
        const ollamaToggle = el<HTMLInputElement>('ollama-enabled-toggle');
        const saveButton = el<HTMLButtonElement>('save-settings-button');

        expect(saveButton.disabled).toBe(false);

        geminiToggle.checked = false;
        geminiToggle.dispatchEvent(new Event('change'));
        expect(saveButton.disabled).toBe(true);

        ollamaToggle.checked = true;
        ollamaToggle.dispatchEvent(new Event('change'));
        expect(saveButton.disabled).toBe(false);
      });
    });

    describe('saving', () => {
      it('should save with an empty API key when only Ollama is enabled, wiping the key', async () => {
        stubStorage({ [StorageKeys.API_KEY]: 'old-key' });
        stubOllamaMessages(['llama3.1:8b']);
        await controller.start();

        el<HTMLButtonElement>('toggle-settings-button').click();
        el<HTMLInputElement>('api-key-input').value = '';
        const geminiToggle = el<HTMLInputElement>('gemini-enabled-toggle');
        geminiToggle.checked = false;
        geminiToggle.dispatchEvent(new Event('change'));
        const ollamaToggle = el<HTMLInputElement>('ollama-enabled-toggle');
        ollamaToggle.checked = true;
        ollamaToggle.dispatchEvent(new Event('change'));

        el<HTMLButtonElement>('save-settings-button').click();

        // The settings view closing is the last step of a successful save.
        await vi.waitFor(() => {
          expect(
            el<HTMLDivElement>('settings-view').classList.contains('hidden'),
          ).toBe(true);
        });
        expect(mockSyncStorage.set).toHaveBeenCalledWith(
          StorageKeys.API_KEY,
          '',
        );
        expect(mockSyncStorage.set).toHaveBeenCalledWith(
          StorageKeys.GEMINI_ENABLED,
          false,
        );
        expect(mockSyncStorage.set).toHaveBeenCalledWith(
          StorageKeys.OLLAMA_SETTINGS,
          { enabled: true, host: '', numCtx: '', keepAlive: '' },
        );
      });

      it('should block saving when Ollama is enabled with an invalid host', async () => {
        stubStorage({ [StorageKeys.API_KEY]: 'key' });
        await controller.start();

        el<HTMLButtonElement>('toggle-settings-button').click();
        const ollamaToggle = el<HTMLInputElement>('ollama-enabled-toggle');
        ollamaToggle.checked = true;
        ollamaToggle.dispatchEvent(new Event('change'));
        el<HTMLInputElement>('ollama-host-input').value = 'not a url';

        vi.mocked(mockSyncStorage.set).mockClear();
        el<HTMLButtonElement>('save-settings-button').click();

        await vi.waitFor(() => {
          expect(el<HTMLDivElement>('settings-error').textContent).toBe(
            'Please enter a valid Ollama host URL.',
          );
        });
        expect(mockSyncStorage.set).not.toHaveBeenCalled();
      });

      it('should block saving when Ollama is enabled with a non-numeric num_ctx', async () => {
        stubStorage({ [StorageKeys.API_KEY]: 'key' });
        await controller.start();

        el<HTMLButtonElement>('toggle-settings-button').click();
        const ollamaToggle = el<HTMLInputElement>('ollama-enabled-toggle');
        ollamaToggle.checked = true;
        ollamaToggle.dispatchEvent(new Event('change'));
        el<HTMLInputElement>('ollama-num-ctx-input').value = '-42';

        vi.mocked(mockSyncStorage.set).mockClear();
        el<HTMLButtonElement>('save-settings-button').click();

        await vi.waitFor(() => {
          expect(el<HTMLDivElement>('settings-error').textContent).toBe(
            'num_ctx must be a positive whole number.',
          );
        });
        expect(mockSyncStorage.set).not.toHaveBeenCalled();
      });

      it('should expand the collapsed advanced section when num_ctx is invalid', async () => {
        // Regression: an invalid num_ctx saved while Ollama was disabled, and
        // the advanced section collapsed — the validation error must reveal
        // the offending field, not point at a hidden input.
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: {
            enabled: false,
            host: '',
            numCtx: 'notavalid',
            keepAlive: '',
          },
        });
        await controller.start();

        el<HTMLButtonElement>('toggle-settings-button').click();
        const advanced = el<HTMLDetailsElement>('ollama-advanced');
        advanced.open = false;
        const ollamaToggle = el<HTMLInputElement>('ollama-enabled-toggle');
        ollamaToggle.checked = true;
        ollamaToggle.dispatchEvent(new Event('change'));

        el<HTMLButtonElement>('save-settings-button').click();

        await vi.waitFor(() => {
          expect(el<HTMLDivElement>('settings-error').textContent).toBe(
            'num_ctx must be a positive whole number.',
          );
        });
        expect(advanced.open).toBe(true);
        expect(
          el<HTMLInputElement>('ollama-num-ctx-input').classList.contains(
            'input-error',
          ),
        ).toBe(true);
      });

      it('should accept empty host and num_ctx when Ollama is enabled (defaults apply)', async () => {
        stubStorage({ [StorageKeys.API_KEY]: 'key' });
        stubOllamaMessages(['llama3.1:8b']);
        await controller.start();

        el<HTMLButtonElement>('toggle-settings-button').click();
        const ollamaToggle = el<HTMLInputElement>('ollama-enabled-toggle');
        ollamaToggle.checked = true;
        ollamaToggle.dispatchEvent(new Event('change'));

        el<HTMLButtonElement>('save-settings-button').click();

        await vi.waitFor(() => {
          expect(mockSyncStorage.set).toHaveBeenCalledWith(
            StorageKeys.OLLAMA_SETTINGS,
            { enabled: true, host: '', numCtx: '', keepAlive: '' },
          );
        });
      });

      it('should save disabled-provider fields verbatim, even garbage', async () => {
        stubStorage({ [StorageKeys.API_KEY]: 'key' });
        await controller.start();

        el<HTMLButtonElement>('toggle-settings-button').click();
        // Ollama stays disabled; type garbage into its fields.
        el<HTMLInputElement>('ollama-host-input').value = 'not a url';
        el<HTMLInputElement>('ollama-num-ctx-input').value = 'many';

        el<HTMLButtonElement>('save-settings-button').click();

        await vi.waitFor(() => {
          expect(mockSyncStorage.set).toHaveBeenCalledWith(
            StorageKeys.OLLAMA_SETTINGS,
            {
              enabled: false,
              host: 'not a url',
              numCtx: 'many',
              keepAlive: '',
            },
          );
        });
      });
    });

    describe('cancel and reset', () => {
      it('should restore provider fields on Cancel', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
        });
        stubOllamaMessages(['llama3.1:8b']);
        await controller.start();

        el<HTMLButtonElement>('toggle-settings-button').click();
        const geminiToggle = el<HTMLInputElement>('gemini-enabled-toggle');
        geminiToggle.checked = false;
        geminiToggle.dispatchEvent(new Event('change'));
        el<HTMLInputElement>('ollama-host-input').value = 'edited:1234';
        el<HTMLInputElement>('ollama-num-ctx-input').value = '1';

        el<HTMLButtonElement>('cancel-settings-button').click();

        expect(el<HTMLInputElement>('gemini-enabled-toggle').checked).toBe(
          true,
        );
        expect(el<HTMLInputElement>('ollama-host-input').value).toBe(
          'http://localhost:9999',
        );
        expect(el<HTMLInputElement>('ollama-num-ctx-input').value).toBe('8192');
        expect(el<HTMLInputElement>('ollama-keep-alive-input').value).toBe(
          '10m',
        );
      });

      it('should clear Ollama fields on Reset Defaults after confirmation', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
        });
        stubOllamaMessages(['llama3.1:8b']);
        await controller.start();

        el<HTMLButtonElement>('toggle-settings-button').click();
        el<HTMLButtonElement>('ollama-reset-button').click();

        // The in-page confirmation dialog opens.
        const overlay = el<HTMLDivElement>('confirm-overlay');
        expect(overlay.classList.contains('hidden')).toBe(false);
        expect(el<HTMLParagraphElement>('confirm-message').textContent).toBe(
          'Reset Ollama settings to defaults?',
        );

        el<HTMLButtonElement>('confirm-ok-button').click();

        await vi.waitFor(() => {
          expect(overlay.classList.contains('hidden')).toBe(true);
          expect(el<HTMLInputElement>('ollama-host-input').value).toBe('');
        });
        expect(el<HTMLInputElement>('ollama-num-ctx-input').value).toBe('');
        expect(el<HTMLInputElement>('ollama-keep-alive-input').value).toBe('');
      });

      it('should keep Ollama fields when Reset Defaults is not confirmed', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
        });
        stubOllamaMessages(['llama3.1:8b']);
        await controller.start();

        el<HTMLButtonElement>('toggle-settings-button').click();
        el<HTMLButtonElement>('ollama-reset-button').click();

        const overlay = el<HTMLDivElement>('confirm-overlay');
        expect(overlay.classList.contains('hidden')).toBe(false);

        el<HTMLButtonElement>('confirm-cancel-button').click();

        await vi.waitFor(() => {
          expect(overlay.classList.contains('hidden')).toBe(true);
        });
        expect(el<HTMLInputElement>('ollama-host-input').value).toBe(
          'http://localhost:9999',
        );
      });
    });

    describe('connection status', () => {
      it('should auto-ping Ollama when settings open and show success', async () => {
        stubStorage({ [StorageKeys.API_KEY]: 'key' });
        stubOllamaMessages(['a', 'b', 'c']);
        await controller.start();

        el<HTMLButtonElement>('toggle-settings-button').click();

        await vi.waitFor(() => {
          const status = el<HTMLDivElement>('ollama-status');
          expect(status.textContent).toBe('● Ollama is online (3 models)');
          expect(status.classList.contains('success')).toBe(true);
          expect(status.classList.contains('hidden')).toBe(false);
        });
      });

      it('should show a failure status when Ollama is unreachable', async () => {
        stubStorage({ [StorageKeys.API_KEY]: 'key' });
        stubOllamaMessages(null);
        await controller.start();

        el<HTMLButtonElement>('toggle-settings-button').click();

        await vi.waitFor(() => {
          const status = el<HTMLDivElement>('ollama-status');
          expect(status.textContent).toBe('● Ollama not found');
          expect(status.classList.contains('error')).toBe(true);
        });
      });

      it('should test the unsaved host value without caching its models', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
        });
        stubOllamaMessages(['m1']);
        await controller.start();

        el<HTMLButtonElement>('toggle-settings-button').click();
        // Wait for the auto-ping to finish (it disables the Test button).
        await vi.waitFor(() => {
          expect(el<HTMLButtonElement>('ollama-test-button').disabled).toBe(
            false,
          );
          expect(
            el<HTMLDivElement>('ollama-status').classList.contains('hidden'),
          ).toBe(false);
        });
        // Manual test of an arbitrary unsaved host must not touch the cache
        // that backs the saved host's model list.
        vi.mocked(mockLocalStorage.set).mockClear();
        el<HTMLInputElement>('ollama-host-input').value = 'other-host:1234';
        el<HTMLButtonElement>('ollama-test-button').click();

        await vi.waitFor(() => {
          expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
            type: MessageTypes.OLLAMA_TEST_CONNECTION,
            host: 'other-host:1234',
          });
        });
        expect(mockLocalStorage.set).not.toHaveBeenCalledWith(
          StorageKeys.OLLAMA_MODELS_CACHE,
          ['m1'],
        );
      });
    });

    describe('provider and model dropdowns', () => {
      function providerOptions(): string[] {
        return Array.from(el<HTMLSelectElement>('provider-select').options).map(
          (o) => o.value,
        );
      }

      function modelOptions(): string[] {
        return Array.from(el<HTMLSelectElement>('model-select').options).map(
          (o) => o.value,
        );
      }

      it('should list both providers without an Add Provider entry when both are enabled', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
        });
        stubOllamaMessages(['llama3.1:8b', 'qwen3:4b']);
        await controller.start();

        expect(providerOptions()).toEqual([
          Providers.GOOGLE_GEMINI,
          Providers.OLLAMA,
        ]);
        // Gemini is the default provider, so the models are Gemini's.
        expect(el<HTMLSelectElement>('model-select').value).toBe(DEFAULT_MODEL);
      });

      it('should offer Add Provider when exactly one provider is enabled', async () => {
        stubStorage({ [StorageKeys.API_KEY]: 'key' });
        await controller.start();

        expect(providerOptions()).toEqual([
          Providers.GOOGLE_GEMINI,
          'add-provider',
        ]);
      });

      it('should open the settings when Add Provider is chosen and revert the selection', async () => {
        stubStorage({ [StorageKeys.API_KEY]: 'key' });
        await controller.start();

        const providerSelect = el<HTMLSelectElement>('provider-select');
        providerSelect.value = 'add-provider';
        providerSelect.dispatchEvent(new Event('change'));

        expect(providerSelect.value).toBe(Providers.GOOGLE_GEMINI);
        expect(
          el<HTMLDivElement>('settings-view').classList.contains('hidden'),
        ).toBe(false);
      });

      it('should only list Ollama (plus Add Provider) when Gemini is disabled', async () => {
        stubStorage({
          [StorageKeys.GEMINI_ENABLED]: false,
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
        });
        stubOllamaMessages(['llama3.1:8b']);
        await controller.start();

        expect(providerOptions()).toEqual([Providers.OLLAMA, 'add-provider']);
        expect(modelOptions()).toEqual(['llama3.1:8b']);
      });

      it('should fall back to cached models from the same host when the fetch fails', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
          [StorageKeys.SELECTED_PROVIDER]: Providers.OLLAMA,
        });
        stubOllamaMessages(null);
        vi.mocked(mockLocalStorage.get).mockImplementation(
          async (key: string) =>
            key === StorageKeys.OLLAMA_MODELS_CACHE
              ? { host: savedOllama.host, models: ['cached-model'] }
              : undefined,
        );
        await controller.start();

        expect(modelOptions()).toEqual(['cached-model']);
      });

      it('should ignore cached models fetched from a different host', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
          [StorageKeys.SELECTED_PROVIDER]: Providers.OLLAMA,
        });
        stubOllamaMessages(null);
        vi.mocked(mockLocalStorage.get).mockImplementation(
          async (key: string) =>
            key === StorageKeys.OLLAMA_MODELS_CACHE
              ? { host: 'http://other-host:1234', models: ['foreign-model'] }
              : undefined,
        );
        await controller.start();

        const modelSelect = el<HTMLSelectElement>('model-select');
        expect(modelSelect.options.length).toBe(1);
        expect(modelSelect.options[0].disabled).toBe(true);
      });

      it('should ignore a legacy plain-array cache', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
          [StorageKeys.SELECTED_PROVIDER]: Providers.OLLAMA,
        });
        stubOllamaMessages(null);
        vi.mocked(mockLocalStorage.get).mockImplementation(
          async (key: string) =>
            key === StorageKeys.OLLAMA_MODELS_CACHE
              ? ['legacy-model']
              : undefined,
        );
        await controller.start();

        const modelSelect = el<HTMLSelectElement>('model-select');
        expect(modelSelect.options.length).toBe(1);
        expect(modelSelect.options[0].disabled).toBe(true);
      });

      it('should accept an empty successful model list and overwrite the cache', async () => {
        // Regression: after `ollama rm` removes the last model, the server's
        // truthful empty answer must not be masked by a stale cache — not
        // even via the refresh button.
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
          [StorageKeys.SELECTED_PROVIDER]: Providers.OLLAMA,
        });
        stubOllamaMessages([]);
        vi.mocked(mockLocalStorage.get).mockImplementation(
          async (key: string) =>
            key === StorageKeys.OLLAMA_MODELS_CACHE
              ? { host: savedOllama.host, models: ['removed-model'] }
              : undefined,
        );
        await controller.start();

        const modelSelect = el<HTMLSelectElement>('model-select');
        expect(modelOptions()).not.toContain('removed-model');
        expect(modelSelect.options[0].disabled).toBe(true);
        expect(modelSelect.options[0].textContent).toContain(
          'No models installed',
        );
        expect(mockLocalStorage.set).toHaveBeenCalledWith(
          StorageKeys.OLLAMA_MODELS_CACHE,
          { host: savedOllama.host, models: [] },
        );

        // The refresh button goes through the same authoritative path.
        vi.mocked(mockLocalStorage.set).mockClear();
        el<HTMLButtonElement>('refresh-models-button').click();
        await vi.waitFor(() => {
          expect(mockLocalStorage.set).toHaveBeenCalledWith(
            StorageKeys.OLLAMA_MODELS_CACHE,
            { host: savedOllama.host, models: [] },
          );
        });
        expect(modelOptions()).not.toContain('removed-model');
      });

      it('should not persist the displayed fallback when the stored model is missing', async () => {
        // Regression: a transiently missing model (e.g. stale cache) must not
        // overwrite the user's stored choice; only a user's pick persists.
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
          [StorageKeys.SELECTED_PROVIDER]: Providers.OLLAMA,
          [StorageKeys.OLLAMA_MODEL]: 'qwen3:4b',
        });
        stubOllamaMessages(['llama3.1:8b']);
        await controller.start();

        expect(el<HTMLSelectElement>('model-select').value).toBe('llama3.1:8b');
        expect(mockSyncStorage.set).not.toHaveBeenCalledWith(
          StorageKeys.OLLAMA_MODEL,
          expect.anything(),
        );
      });

      it('should show a disabled placeholder when no Ollama models are available', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
          [StorageKeys.SELECTED_PROVIDER]: Providers.OLLAMA,
        });
        stubOllamaMessages(null); // fetch fails
        vi.mocked(mockLocalStorage.get).mockResolvedValue(undefined); // no cache
        await controller.start();

        const modelSelect = el<HTMLSelectElement>('model-select');
        expect(modelSelect.options.length).toBe(1);
        expect(modelSelect.options[0].disabled).toBe(true);
        expect(modelSelect.options[0].textContent).toContain('No models found');
        // The placeholder must never be persisted as a model choice.
        expect(mockSyncStorage.set).not.toHaveBeenCalledWith(
          StorageKeys.OLLAMA_MODEL,
          expect.anything(),
        );
      });

      it('should restore a persisted Ollama selection and show the refresh button', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
          [StorageKeys.SELECTED_PROVIDER]: Providers.OLLAMA,
          [StorageKeys.OLLAMA_MODEL]: 'qwen3:4b',
        });
        stubOllamaMessages(['llama3.1:8b', 'qwen3:4b']);
        await controller.start();

        expect(el<HTMLSelectElement>('provider-select').value).toBe(
          Providers.OLLAMA,
        );
        expect(el<HTMLSelectElement>('model-select').value).toBe('qwen3:4b');
        expect(
          el<HTMLButtonElement>('refresh-models-button').classList.contains(
            'hidden',
          ),
        ).toBe(false);
      });

      it('should repopulate models and persist the provider when switching providers', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
        });
        stubOllamaMessages(['llama3.1:8b']);
        await controller.start();

        const providerSelect = el<HTMLSelectElement>('provider-select');
        const refresh = el<HTMLButtonElement>('refresh-models-button');
        expect(providerSelect.value).toBe(Providers.GOOGLE_GEMINI);
        expect(refresh.classList.contains('hidden')).toBe(true);

        providerSelect.value = Providers.OLLAMA;
        providerSelect.dispatchEvent(new Event('change'));

        await vi.waitFor(() => {
          expect(modelOptions()).toEqual(['llama3.1:8b']);
        });
        expect(refresh.classList.contains('hidden')).toBe(false);
        expect(mockSyncStorage.set).toHaveBeenCalledWith(
          StorageKeys.SELECTED_PROVIDER,
          Providers.OLLAMA,
        );
      });

      it('should persist the model for the selected provider on model change', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
          [StorageKeys.SELECTED_PROVIDER]: Providers.OLLAMA,
        });
        stubOllamaMessages(['llama3.1:8b', 'qwen3:4b']);
        await controller.start();

        const modelSelect = el<HTMLSelectElement>('model-select');
        modelSelect.value = 'qwen3:4b';
        modelSelect.dispatchEvent(new Event('change'));

        expect(mockSyncStorage.set).toHaveBeenCalledWith(
          StorageKeys.OLLAMA_MODEL,
          'qwen3:4b',
        );
      });

      it('should include the provider when sending a chat message', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: savedOllama,
          [StorageKeys.SELECTED_PROVIDER]: Providers.OLLAMA,
          [StorageKeys.OLLAMA_MODEL]: 'llama3.1:8b',
        });
        stubOllamaMessages(['llama3.1:8b']);
        await controller.start();

        el<HTMLInputElement>('prompt-input').value = 'Hello';
        el<HTMLFormElement>('prompt-form').dispatchEvent(new Event('submit'));

        await vi.waitFor(() => {
          expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
            type: MessageTypes.CHAT_MESSAGE,
            message: 'Hello',
            model: 'llama3.1:8b',
            includeCurrentTab: true,
            provider: Providers.OLLAMA,
          });
        });
      });
    });

    describe('startup', () => {
      it('should not force-open settings when only Ollama is configured', async () => {
        stubStorage({ [StorageKeys.OLLAMA_SETTINGS]: savedOllama });
        stubOllamaMessages(['llama3.1:8b']);
        await controller.start();

        expect(
          el<HTMLDivElement>('settings-view').classList.contains('hidden'),
        ).toBe(true);
      });

      it('should force-open settings when the key exists but Gemini is disabled and Ollama is off', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.GEMINI_ENABLED]: false,
        });
        await controller.start();

        expect(
          el<HTMLDivElement>('settings-view').classList.contains('hidden'),
        ).toBe(false);
      });

      it('should display raw stored Ollama values in the settings fields', async () => {
        stubStorage({
          [StorageKeys.API_KEY]: 'key',
          [StorageKeys.OLLAMA_SETTINGS]: {
            enabled: false,
            host: 'not a url',
            numCtx: 'garbage',
            keepAlive: 42,
          },
        });
        await controller.start();

        expect(el<HTMLInputElement>('ollama-host-input').value).toBe(
          'not a url',
        );
        expect(el<HTMLInputElement>('ollama-num-ctx-input').value).toBe(
          'garbage',
        );
        // Non-string values fall back to empty (placeholder shows).
        expect(el<HTMLInputElement>('ollama-keep-alive-input').value).toBe('');
      });
    });
  });
});
