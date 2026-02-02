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

import { MessageTypes } from "./constants";

export interface TabInfo {
  id: number;
  title: string;
  url: string;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export interface ChatMessageRequest {
  type: typeof MessageTypes.CHAT_MESSAGE;
  message: string;
  model: string;
  includeCurrentTab: boolean;
}

export interface GetContextRequest {
  type: typeof MessageTypes.GET_CONTEXT;
}

export interface SaveApiKeyRequest {
  type: typeof MessageTypes.SAVE_API_KEY;
  apiKey: string;
}

export interface PinTabRequest {
  type: typeof MessageTypes.PIN_TAB;
}

export interface UnpinTabRequest {
  type: typeof MessageTypes.UNPIN_TAB;
  tabId: number;
}

export interface CheckPinnedTabsRequest {
  type: typeof MessageTypes.CHECK_PINNED_TABS;
}

export interface ReopenTabRequest {
  type: typeof MessageTypes.REOPEN_TAB;
  url: string;
}

export interface ClearChatRequest {
  type: typeof MessageTypes.CLEAR_CHAT;
}

export interface GetHistoryRequest {
  type: typeof MessageTypes.GET_HISTORY;
}

export interface StopGenerationRequest {
  type: typeof MessageTypes.STOP_GENERATION;
}

export interface CurrentTabInfoMessage {
  type: typeof MessageTypes.CURRENT_TAB_INFO;
  tab: TabInfo;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "file_data"; mimeType: string; fileUri: string };

export type ExtensionMessage =
  | ChatMessageRequest
  | GetContextRequest
  | SaveApiKeyRequest
  | PinTabRequest
  | UnpinTabRequest
  | CheckPinnedTabsRequest
  | ReopenTabRequest
  | ClearChatRequest
  | GetHistoryRequest
  | CurrentTabInfoMessage
  | StopGenerationRequest;

export interface GeminiResponse {
  reply?: string;
  error?: string;
  aborted?: boolean;
}

export interface GetContextResponse {
  pinnedContexts: TabInfo[];
  tab: TabInfo | null;
}

export interface SuccessResponse {
  success: boolean;
  message?: string;
}

export interface CheckPinnedTabsResponse {
  success: boolean;
  pinnedContexts: TabInfo[];
}

export interface GetHistoryResponse {
  success: boolean;
  history: ChatMessage[];
}

export type ExtensionResponse =
  | GeminiResponse
  | GetContextResponse
  | SuccessResponse
  | CheckPinnedTabsResponse
  | GetHistoryResponse;
