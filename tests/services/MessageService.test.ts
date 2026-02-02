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
import { ChromeMessageService } from '../../src/scripts/services/messageService';
import { MessageTypes } from '../../src/scripts/constants';
import { ExtensionMessage } from '../../src/scripts/types';

describe('ChromeMessageService', () => {
  let service: ChromeMessageService;
  const mockSendMessage = vi.fn();
  const mockOnMessageAddListener = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();

    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: mockSendMessage,
        onMessage: {
          addListener: mockOnMessageAddListener,
        },
        lastError: undefined,
      },
    });

    service = new ChromeMessageService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('sendMessage', () => {
    it('should send a message and resolve with response', async () => {
      const mockResponse = { success: true };
      mockSendMessage.mockImplementation((message, callback) => {
        callback(mockResponse);
      });

      const message = { type: MessageTypes.GET_CONTEXT };
      const response = await service.sendMessage(message);

      expect(mockSendMessage).toHaveBeenCalledWith(
        message,
        expect.any(Function),
      );
      expect(response).toEqual(mockResponse);
    });

    it('should reject when chrome.runtime.lastError is set', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        (
          chrome.runtime as unknown as { lastError: { message: string } }
        ).lastError = { message: 'Connection failed' };
        callback(undefined);
      });

      const message = { type: MessageTypes.GET_CONTEXT };

      await expect(service.sendMessage(message)).rejects.toThrow(
        'Connection failed',
      );
    });

    it('should resolve with undefined if response is empty (void return)', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        callback(undefined);
      });

      const message = { type: MessageTypes.PING }; // Hypothetical void message
      const response = await service.sendMessage(
        message as unknown as ExtensionMessage,
      );

      expect(response).toBeUndefined();
    });
  });

  describe('onMessage', () => {
    it('should register a message listener', () => {
      const listener = vi.fn();
      service.onMessage(listener);

      expect(mockOnMessageAddListener).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('should allow registering multiple listeners', () => {
      const listenerA = vi.fn();
      const listenerB = vi.fn();

      service.onMessage(listenerA);
      service.onMessage(listenerB);

      expect(mockOnMessageAddListener).toHaveBeenCalledTimes(2);
    });

    it('should trigger the listener when a message is received', () => {
      let registeredListener: (
        message: unknown,
        sender: unknown,
        sendResponse: unknown,
      ) => void;
      mockOnMessageAddListener.mockImplementation((cb) => {
        registeredListener = cb;
      });

      const listener = vi.fn();
      service.onMessage(listener);

      const message = { type: MessageTypes.GET_CONTEXT };
      const sender = { id: 'test' };
      const sendResponse = vi.fn();

      // Simulate Chrome calling the listener
      registeredListener(message, sender, sendResponse);

      expect(listener).toHaveBeenCalledWith(message, sender, sendResponse);
    });
  });
});
