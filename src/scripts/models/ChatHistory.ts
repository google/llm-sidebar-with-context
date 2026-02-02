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

import { StorageKeys } from '../constants';
import { ILocalStorageService } from '../services/storageService';
import { ChatMessage } from '../types';

export class ChatHistory {
  private messages: ChatMessage[] = [];

  constructor(private localStorageService: ILocalStorageService) {}

  /**
   * Adds a message to the history and saves it.
   */
  async addMessage(message: ChatMessage): Promise<void> {
    this.messages.push(message);
    await this.save();
  }

  /**
   * Removes the last message from the history and saves it.
   */
  async removeLastMessage(): Promise<void> {
    this.messages.pop();
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
   * Loads the history from storage.
   */
  async load(): Promise<void> {
    const history = await this.localStorageService.get<ChatMessage[]>(
      StorageKeys.CHAT_HISTORY,
    );
    if (Array.isArray(history)) {
      this.messages = history;
    }
  }

  /**
   * Saves the history to storage.
   */
  private async save(): Promise<void> {
    await this.localStorageService.set(StorageKeys.CHAT_HISTORY, this.messages);
  }
}
