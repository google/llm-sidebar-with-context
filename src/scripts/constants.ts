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

export const MAX_CONTEXT_LENGTH = 250000;
export const MAX_PINNED_TABS = 6;

export const MessageTypes = {
  CHAT_MESSAGE: 'chatMessage',
  GET_CONTEXT: 'getContext',
  SAVE_API_KEY: 'saveApiKey',
  PIN_TAB: 'pinTab',
  UNPIN_TAB: 'unpinTab',
  CURRENT_TAB_INFO: 'currentTabInfo',
  CHECK_PINNED_TABS: 'checkPinnedTabs',
  REOPEN_TAB: 'reopenTab',
  CLEAR_CHAT: 'clearChat',
  GET_HISTORY: 'getHistory',
  STOP_GENERATION: 'stopGeneration',
} as const;

export const StorageKeys = {
  API_KEY: 'geminiApiKey',
  PINNED_CONTEXTS: 'pinnedContexts',
  SELECTED_MODEL: 'selectedModel',
  CHAT_HISTORY: 'chatHistory',
  INCLUDE_CURRENT_TAB: 'includeCurrentTab',
};

export const RestrictedURLs = [
  'chrome://',
  'about:',
  'chrome-extension://',
  'file://',
];

export const CONTEXT_MESSAGES = {
  LOADING_WARNING: '(Page is still loading...)',
  NO_CONTENT_WARNING: '(No text content found on this page)',
  RESTRICTED_URL: '(Content not accessible for restricted URL)',
  EXTENSION_POLICY_ERROR:
    '(Content inaccessible due to your enterprise extension policy)',
  TAB_NOT_FOUND: '(Tab not found or accessible)',
  TAB_ID_NOT_FOUND: '(Tab ID not found)',
  TAB_DISCARDED:
    '(Tab is suspended to save memory. Click it to reload content)',
  ERROR_PREFIX: '(Could not extract content from',
};
