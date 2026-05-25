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
import { ChatMessage, ChatSession } from '../types';

interface ChatHistoryData {
  activeId: string;
  chats: Record<string, ChatSession>;
}

export class ChatHistory {
  private activeId: string = '';
  private chats: Record<string, ChatSession> = {};

  constructor(private localStorageService: ILocalStorageService) {
    // Generate a default active ID on construction
    this.activeId = crypto.randomUUID();
  }

  /**
   * Creates a new chat session and sets it as active.
   * Returns the new chat ID.
   */
  async createChat(): Promise<string> {
    const id = crypto.randomUUID();
    this.chats[id] = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
    };
    this.activeId = id;
    await this.save();
    return id;
  }

  /**
   * Switches to an existing chat by ID.
   */
  async switchChat(chatId: string): Promise<void> {
    if (!this.chats[chatId]) {
      throw new Error(`Chat ${chatId} not found`);
    }
    this.activeId = chatId;
    await this.save();
  }

  /**
   * Returns the active chat ID.
   */
  getActiveId(): string {
    return this.activeId;
  }

  /**
   * Lists all chat sessions sorted by creation date (newest first).
   */
  listChats(): ChatSession[] {
    return Object.values(this.chats).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Deletes a chat session by ID.
   * If the active chat is deleted, creates a new one.
   */
  async deleteChat(chatId: string): Promise<void> {
    if (!this.chats[chatId]) return;

    delete this.chats[chatId];

    if (this.activeId === chatId) {
      const remaining = Object.keys(this.chats);
      if (remaining.length > 0) {
        this.activeId = remaining[0];
      } else {
        await this.createChat();
        return;
      }
    }

    await this.save();
  }

  /**
   * Adds a message to the active chat's history and saves it.
   */
  async addMessage(message: ChatMessage): Promise<void> {
    const chat = this.chats[this.activeId];
    if (!chat) {
      // Chat was deleted — create a new one
      await this.createChat();
    }
    this.chats[this.activeId].messages.push(message);

    // Auto-generate title from first user message
    const msgs = this.chats[this.activeId].messages;
    if (msgs.length === 1 && message.role === 'user') {
      this.chats[this.activeId].title =
        message.text.substring(0, 40) + (message.text.length > 40 ? '...' : '');
    }

    await this.save();
  }

  /**
   * Removes the last message from the active chat and saves it.
   */
  async removeLastMessage(): Promise<void> {
    const chat = this.chats[this.activeId];
    if (chat && chat.messages.length > 0) {
      chat.messages.pop();
      await this.save();
    }
  }

  /**
   * Gets all messages from the active chat.
   */
  getMessages(): ChatMessage[] {
    const chat = this.chats[this.activeId];
    return chat ? [...chat.messages] : [];
  }

  /**
   * Clears messages from the active chat (keeps the session).
   */
  async clear(): Promise<void> {
    const chat = this.chats[this.activeId];
    if (chat) {
      chat.messages = [];
      chat.title = 'New Chat';
    }
    await this.save();
  }

  /**
   * Loads the history from storage.
   * Supports migration from the old single-array format.
   */
  async load(): Promise<void> {
    const raw = await this.localStorageService.get<unknown>(
      StorageKeys.CHAT_HISTORY,
    );

    if (!raw) {
      // First run — create a default chat
      await this.createChat();
      return;
    }

    // Migration: old format stored a plain ChatMessage[] array
    if (Array.isArray(raw)) {
      const id = crypto.randomUUID();
      this.chats = {
        [id]: {
          id,
          title: 'Chat',
          messages: raw as ChatMessage[],
          createdAt: Date.now(),
        },
      };
      this.activeId = id;
      await this.save();
      return;
    }

    // New format: { activeId, chats }
    const data = raw as ChatHistoryData;
    if (data.chats && typeof data.chats === 'object') {
      this.chats = data.chats;
      // Verify activeId exists; fall back to first chat if not
      if (data.activeId && this.chats[data.activeId]) {
        this.activeId = data.activeId;
      } else {
        const ids = Object.keys(this.chats);
        this.activeId = ids.length > 0 ? ids[0] : crypto.randomUUID();
        if (ids.length === 0) {
          await this.createChat();
        }
      }
    } else {
      // Corrupt data — start fresh
      await this.createChat();
    }
  }

  /**
   * Saves the full chat data to storage.
   */
  private async save(): Promise<void> {
    const data: ChatHistoryData = {
      activeId: this.activeId,
      chats: this.chats,
    };
    await this.localStorageService.set(StorageKeys.CHAT_HISTORY, data);
  }
}
