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
import { MessageTypes } from '../../src/scripts/constants';
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

describe('Sidebar Integration: Message Handling', () => {
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
  });

  it('should send a success response when receiving CURRENT_TAB_INFO to prevent port closure errors', () => {
    let capturedListener: (
      message: ExtensionMessage,
      sender: unknown,
      sendResponse: (response?: ExtensionResponse) => void,
    ) => void;
    vi.mocked(mockMessageService.onMessage).mockImplementation((listener) => {
      capturedListener = listener;
    });

    // Initialize controller to attach listeners
    new SidebarController(
      mockSyncStorage,
      mockLocalStorage,
      mockMessageService,
    );

    expect(capturedListener).toBeDefined();

    const sendResponseSpy = vi.fn();
    const message = {
      type: MessageTypes.CURRENT_TAB_INFO,
      tab: { id: 1, title: 'Test Tab', url: 'https://example.com' },
    };
    const sender = {};

    // Simulate incoming message from Background
    capturedListener(message, sender, sendResponseSpy);

    // Expectation: The controller must acknowledge receipt
    expect(sendResponseSpy).toHaveBeenCalledWith({ success: true });
  });

  it('should send a success response when receiving CHECK_PINNED_TABS to prevent port closure errors', () => {
    let capturedListener: (
      message: ExtensionMessage,
      sender: unknown,
      sendResponse: (response?: ExtensionResponse) => void,
    ) => void;
    vi.mocked(mockMessageService.onMessage).mockImplementation((listener) => {
      capturedListener = listener;
    });

    // Initialize controller to attach listeners
    new SidebarController(
      mockSyncStorage,
      mockLocalStorage,
      mockMessageService,
    );

    expect(capturedListener).toBeDefined();

    const sendResponseSpy = vi.fn();
    const message = {
      type: MessageTypes.CHECK_PINNED_TABS,
    };
    const sender = {};

    // Simulate incoming message from Background
    capturedListener(message, sender, sendResponseSpy);

    // Expectation: The controller must acknowledge receipt
    expect(sendResponseSpy).toHaveBeenCalledWith({ success: true });
  });
});
