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
import { ChromeLocalStorageService, ChromeSyncStorageService } from '../../src/scripts/services/storageService';

describe('StorageServices', () => {
  const mockLocalStorage = {
    get: vi.fn(),
    set: vi.fn(),
  };

  const mockSyncStorage = {
    get: vi.fn(),
    set: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      storage: {
        local: mockLocalStorage,
        sync: mockSyncStorage,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('ChromeLocalStorageService', () => {
    const service = new ChromeLocalStorageService();

    it('should get a value specifically from local storage', async () => {
      mockLocalStorage.get.mockImplementation((keys, callback) => {
        callback({ testKey: 'localValue' });
      });

      const value = await service.get('testKey');
      
      expect(mockLocalStorage.get).toHaveBeenCalledWith(['testKey'], expect.any(Function));
      expect(mockSyncStorage.get).not.toHaveBeenCalled();
      expect(value).toBe('localValue');
    });

    it('should reject if runtime.lastError is set during get()', async () => {
      mockLocalStorage.get.mockImplementation((keys, callback) => {
        (chrome.runtime as any).lastError = { message: 'Read failed' };
        callback({});
      });

      await expect(service.get('testKey')).rejects.toThrow('Read failed');
    });

    it('should set a value specifically in local storage', async () => {
      mockLocalStorage.set.mockImplementation((data, callback) => {
        callback();
      });

      await service.set('testKey', 'localValue');

      expect(mockLocalStorage.set).toHaveBeenCalledWith({ testKey: 'localValue' }, expect.any(Function));
      expect(mockSyncStorage.set).not.toHaveBeenCalled();
    });

    it('should reject if runtime.lastError is set during set()', async () => {
      mockLocalStorage.set.mockImplementation((data, callback) => {
        (chrome.runtime as any).lastError = { message: 'Quota exceeded' };
        callback();
      });

      await expect(service.set('key', 'value')).rejects.toThrow('Quota exceeded');
    });

    it('should return undefined when key is missing', async () => {
      mockLocalStorage.get.mockImplementation((keys, callback) => {
        callback({});
      });

      const value = await service.get('missingKey');
      expect(value).toBeUndefined();
    });

    it('should handle storing and retrieving null values', async () => {
      mockLocalStorage.get.mockImplementation((keys, callback) => {
        callback({ nullKey: null });
      });

      const value = await service.get('nullKey');
      expect(value).toBeNull();
    });
  });

  describe('ChromeSyncStorageService', () => {
    const service = new ChromeSyncStorageService();

    it('should get a value specifically from sync storage', async () => {
      mockSyncStorage.get.mockImplementation((keys, callback) => {
        callback({ syncKey: 'syncValue' });
      });

      const value = await service.get('syncKey');

      expect(mockSyncStorage.get).toHaveBeenCalledWith(['syncKey'], expect.any(Function));
      expect(mockLocalStorage.get).not.toHaveBeenCalled();
      expect(value).toBe('syncValue');
    });

    it('should reject if runtime.lastError is set during get()', async () => {
      mockSyncStorage.get.mockImplementation((keys, callback) => {
        (chrome.runtime as any).lastError = { message: 'Sync read failed' };
        callback({});
      });

      await expect(service.get('syncKey')).rejects.toThrow('Sync read failed');
    });

    it('should set a value specifically in sync storage', async () => {
      mockSyncStorage.set.mockImplementation((data, callback) => {
        callback();
      });

      await service.set('syncKey', 'syncValue');

      expect(mockSyncStorage.set).toHaveBeenCalledWith({ syncKey: 'syncValue' }, expect.any(Function));
      expect(mockLocalStorage.set).not.toHaveBeenCalled();
    });

    it('should reject if runtime.lastError is set during set()', async () => {
      mockSyncStorage.set.mockImplementation((data, callback) => {
        (chrome.runtime as any).lastError = { message: 'Sync quota exceeded' };
        callback();
      });

      await expect(service.set('key', 'value')).rejects.toThrow('Sync quota exceeded');
    });

    it('should return undefined when key is missing', async () => {
      mockSyncStorage.get.mockImplementation((keys, callback) => {
        callback({});
      });

      const value = await service.get('missingKey');
      expect(value).toBeUndefined();
    });

    it('should handle storing and retrieving null values', async () => {
      mockSyncStorage.get.mockImplementation((keys, callback) => {
        callback({ nullKey: null });
      });

      const value = await service.get('nullKey');
      expect(value).toBeNull();
    });
  });
});