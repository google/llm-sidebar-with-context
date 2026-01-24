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

import { ExtensionMessage } from "../types";

export interface IMessageService {
  /**
   * Sends a message to the extension backend.
   */
  sendMessage<T>(message: ExtensionMessage): Promise<T>;

  /**
   * Listens for messages from the extension backend.
   */
  onMessage(listener: (message: ExtensionMessage, sender: any, sendResponse: (response?: any) => void) => boolean | void): void;
}

export class ChromeMessageService implements IMessageService {
  sendMessage<T>(message: ExtensionMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  onMessage(listener: (message: ExtensionMessage, sender: any, sendResponse: (response?: any) => void) => boolean | void): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      return listener(message, sender, sendResponse);
    });
  }
}
