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
import {
  ChromeTabService,
  TimeoutError,
} from '../../src/scripts/services/tabService';

describe('ChromeTabService', () => {
  const mockTabs = {
    query: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  };

  const mockScripting = {
    executeScript: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('chrome', {
      tabs: mockTabs,
      scripting: mockScripting,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const service = new ChromeTabService();

  describe('query', () => {
    it('should query tabs and map them', async () => {
      const rawTab = {
        id: 123,
        url: 'https://example.com',
        title: 'Example',
        status: 'complete',
        active: true,
        windowId: 1,
        extraProperty: 'should be ignored',
      } as any;
      mockTabs.query.mockResolvedValue([rawTab]);

      const result = await service.query({ active: true });

      expect(mockTabs.query).toHaveBeenCalledWith({ active: true });
      expect(result[0]).toEqual({
        id: 123,
        url: 'https://example.com',
        title: 'Example',
        status: 'complete',
        active: true,
        discarded: false,
        windowId: 1,
      });
    });
  });

  describe('getTab', () => {
    it('should get a tab by id and map it', async () => {
      const rawTab = {
        id: 123,
        url: 'https://example.com',
        active: true,
        windowId: 1,
        discarded: true,
      } as any;
      mockTabs.get.mockResolvedValue(rawTab);

      const result = await service.getTab(123);

      expect(mockTabs.get).toHaveBeenCalledWith(123);
      expect(result).toEqual({
        id: 123,
        url: 'https://example.com',
        active: true,
        windowId: 1,
        discarded: true,
        title: undefined,
        status: undefined,
      });
    });

    it('should return undefined if chrome.tabs.get throws', async () => {
      mockTabs.get.mockRejectedValue(new Error('Tab not found'));
      const result = await service.getTab(999);
      expect(result).toBeUndefined();
    });
  });

  describe('executeScript', () => {
    it('should execute script and return the result', async () => {
      mockScripting.executeScript.mockResolvedValue([
        { result: 'scriptResult' },
      ]);

      const func = () => 'test';
      const result = await service.executeScript(123, func);

      expect(mockScripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 123 },
        func,
      });
      expect(result).toBe('scriptResult');
    });

    it('should return null if no result is returned', async () => {
      mockScripting.executeScript.mockResolvedValue([{ result: null }]);
      const result = await service.executeScript(123, () => {});
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a tab and map it', async () => {
      const rawTab = { id: 456, active: true, windowId: 1 } as any;
      mockTabs.create.mockResolvedValue(rawTab);

      const result = await service.create({ url: 'https://google.com' });

      expect(mockTabs.create).toHaveBeenCalledWith({
        url: 'https://google.com',
      });
      expect(result.id).toBe(456);
    });
  });

  describe('waitForTabComplete', () => {
    it('should resolve immediately if tab is already complete', async () => {
      mockTabs.get.mockResolvedValue({ id: 123, status: 'complete' });

      const promise = service.waitForTabComplete(123);

      await expect(promise).resolves.toBeUndefined();
      expect(mockTabs.get).toHaveBeenCalledWith(123);
      // Listener should not even be added if it's already complete
      expect(mockTabs.onUpdated.addListener).not.toHaveBeenCalled();
    });

    it('should resolve when tab status becomes complete', async () => {
      mockTabs.get.mockResolvedValue({ id: 123, status: 'loading' });
      let updateListener: (...args: unknown[]) => void = () => {};
      mockTabs.onUpdated.addListener.mockImplementation((listener) => {
        updateListener = listener;
      });

      const promise = service.waitForTabComplete(123);

      // We need to wait a tick for the async chrome.tabs.get to finish
      await Promise.resolve();

      // Simulate update to a different tab
      updateListener(999, { status: 'complete' });

      // Simulate update to target tab but not complete
      updateListener(123, { title: 'New Title' });

      // Simulate update to target tab complete
      updateListener(123, { status: 'complete' });

      await expect(promise).resolves.toBeUndefined();
      expect(mockTabs.onUpdated.removeListener).toHaveBeenCalled();
    });

    it('should throw TimeoutError if timeout is reached', async () => {
      mockTabs.get.mockResolvedValue({ id: 123, status: 'loading' });
      const promise = service.waitForTabComplete(123, 1000);

      // We need to wait a tick for the async chrome.tabs.get to finish
      await Promise.resolve();

      // Fast-forward time
      vi.advanceTimersByTime(1001);

      await expect(promise).rejects.toThrow(TimeoutError);
      await expect(promise).rejects.toThrow(
        'Timed out waiting for tab 123 to complete',
      );
      expect(mockTabs.onUpdated.removeListener).toHaveBeenCalled();
    });

    it('should use default timeout of 10000ms', async () => {
      mockTabs.get.mockResolvedValue({ id: 123, status: 'loading' });
      const promise = service.waitForTabComplete(123);

      // We need to wait a tick for the async chrome.tabs.get to finish
      await Promise.resolve();

      vi.advanceTimersByTime(9999);
      // Should not have timed out yet (promise still pending)

      vi.advanceTimersByTime(2);
      await expect(promise).rejects.toThrow(TimeoutError);
    });
  });
});
