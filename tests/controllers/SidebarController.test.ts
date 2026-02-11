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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SidebarController } from '../../src/scripts/controllers/SidebarController';
import { ISyncStorageService } from '../../src/scripts/services/storageService';
import { IMessageService } from '../../src/scripts/services/messageService';
import { MessageTypes, StorageKeys } from '../../src/scripts/constants';
import { ExtensionMessage, ExtensionResponse } from '../../src/scripts/types';
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
    // Reset DOM
    document.body.innerHTML = htmlContent;

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
    it('should hide API key container if key exists in storage', async () => {
      vi.mocked(mockSyncStorage.get).mockImplementation(async (key) => {
        if (key === StorageKeys.API_KEY) return 'fake-api-key';
        return undefined;
      });

      await controller.start();

      const container = document.getElementById('settings-panel');
      expect(container?.style.display).toBe('none');
    });

    it('should show API key container if key is missing', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue(undefined);

      await controller.start();

      const container = document.getElementById('settings-panel');
      expect(container?.style.display).toBe('flex');
    });

    it('should load selected model from storage', async () => {
      vi.mocked(mockSyncStorage.get).mockImplementation(async (key) => {
        if (key === StorageKeys.SELECTED_MODEL) return 'gemini-2.5-pro';
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
      expect(select.value).toBe('gemini-2.5-flash-lite');
    });
  });

  describe('API Key Management', () => {
    it("should toggle settings visibility when 'Settings' button is clicked", async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('fake-key');
      await controller.start();

      const container = document.getElementById(
        'settings-panel',
      ) as HTMLElement;
      const settingsButton = document.getElementById(
        'toggle-settings-button',
      ) as HTMLButtonElement;

      expect(container.style.display).toBe('none');
      settingsButton.click();
      expect(container.style.display).toBe('flex');
      settingsButton.click();
      expect(container.style.display).toBe('none');
    });

    it('should populate the API key input with the stored key when loaded', async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue('existing-secret-key');
      await controller.start();

      const apiKeyInput = document.getElementById(
        'api-key-input',
      ) as HTMLInputElement;
      expect(apiKeyInput.value).toBe('existing-secret-key');
    });

    it('should show alert and not send message when attempting to save an empty API key', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const apiKeyInput = document.getElementById(
        'api-key-input',
      ) as HTMLInputElement;
      const saveButton = document.getElementById(
        'save-api-key-button',
      ) as HTMLButtonElement;

      apiKeyInput.value = '   ';
      saveButton.click();

      expect(alertSpy).toHaveBeenCalledWith(
        'Please enter your Gemini API Key.',
      );
      expect(mockMessageService.sendMessage).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('should show alert if API key saving fails', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const apiKeyInput = document.getElementById(
        'api-key-input',
      ) as HTMLInputElement;
      const saveButton = document.getElementById(
        'save-api-key-button',
      ) as HTMLButtonElement;

      apiKeyInput.value = 'new-key';
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue({
        success: false,
      });

      await saveButton.click();

      expect(alertSpy).toHaveBeenCalledWith('Failed to save API Key.');
      alertSpy.mockRestore();
    });

    it('should show alert if API key saving throws error', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const apiKeyInput = document.getElementById(
        'api-key-input',
      ) as HTMLInputElement;
      const saveButton = document.getElementById(
        'save-api-key-button',
      ) as HTMLButtonElement;

      apiKeyInput.value = 'new-key';
      vi.mocked(mockMessageService.sendMessage).mockRejectedValue(
        new Error('Network error'),
      );

      await saveButton.click();

      expect(alertSpy).toHaveBeenCalledWith('Failed to save API Key.');
      alertSpy.mockRestore();
    });
  });

  describe('Tab Context Updates', () => {
    let messageListener: (
      message: ExtensionMessage,
      sender: unknown,
      sendResponse: (response?: ExtensionResponse) => void,
    ) => void;

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
          tab: { id: 1, title: 'First Page', url: 'https://a.com' },
        },
        {},
        vi.fn(),
      );

      const div = document.getElementById('current-tab');
      expect(div?.textContent).toContain('First Page');
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
    it('should display pinned tabs from background', async () => {
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
          return {};
        },
      );

      await controller.start();

      const pinnedDiv = document.getElementById('pinned-tabs');
      expect(pinnedDiv?.textContent).toContain('Pinned 1');
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
});
