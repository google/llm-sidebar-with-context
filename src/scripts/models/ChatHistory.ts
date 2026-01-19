/**
 * Copyright 2025 Google LLC
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

import { StorageKeys } from "../constants";

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export class ChatHistory {
  private messages: ChatMessage[] = [];

  constructor() {}

  /**
   * Adds a message to the history and saves it.
   */
  async addMessage(message: ChatMessage): Promise<void> {
    this.messages.push(message);
    await this.save();
  }

  /**
   * Gets all messages in the history.
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Clears the history and saves the empty state.
   */
  async clear(): Promise<void> {
    this.messages = [];
    await this.save();
  }

  /**
   * Loads the history from chrome.storage.local.
   */
  async load(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get([StorageKeys.CHAT_HISTORY], (result) => {
        const history = result[StorageKeys.CHAT_HISTORY];
        if (Array.isArray(history)) {
          this.messages = history as ChatMessage[];
        }
        resolve();
      });
    });
  }

  /**
   * Saves the history to chrome.storage.local.
   */
  private async save(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set(
        { [StorageKeys.CHAT_HISTORY]: this.messages },
        () => {
          resolve();
        }
      );
    });
  }
}
