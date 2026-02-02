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

/**
 * Interface for local storage operations.
 */
export interface ILocalStorageService {
  /**
   * Retrieves data from storage.
   * @param key The key to retrieve.
   * @returns A promise that resolves with the data or undefined.
   */
  get<T>(key: string): Promise<T | undefined>;

  /**
   * Saves data to storage.
   * @param key The key to save.
   * @param value The value to save.
   * @returns A promise that resolves when the save is complete.
   */
  set<T>(key: string, value: T): Promise<void>;
}

/**
 * Interface for sync storage operations.
 */
export interface ISyncStorageService {
  /**
   * Retrieves data from storage.
   * @param key The key to retrieve.
   * @returns A promise that resolves with the data or undefined.
   */
  get<T>(key: string): Promise<T | undefined>;

  /**
   * Saves data to storage.
   * @param key The key to save.
   * @param value The value to save.
   * @returns A promise that resolves when the save is complete.
   */
  set<T>(key: string, value: T): Promise<void>;
}

/**
 * Concrete implementation of ILocalStorageService using chrome.storage.local.
 */
export class ChromeLocalStorageService implements ILocalStorageService {
  async get<T>(key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        try {
          resolve(result ? (result[key] as T | undefined) : undefined);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * Concrete implementation of ISyncStorageService using chrome.storage.sync.
 */
export class ChromeSyncStorageService implements ISyncStorageService {
  async get<T>(key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        try {
          resolve(result ? (result[key] as T | undefined) : undefined);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }
}
