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

import { MessageTypes } from './constants';

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  autoPinned?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export type MemoryEpisodeKind = 'turn' | 'summary';

export interface MemoryEpisode {
  id: string;
  kind: MemoryEpisodeKind;
  summary: string;
  keywords: string[];
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

export interface MemoryState {
  episodes: MemoryEpisode[];
  updatedAt: number;
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

export interface AgentdropAnimateRequest {
  type: typeof MessageTypes.AGENTDROP_ANIMATE;
}

export interface GetMemoryStatsRequest {
  type: typeof MessageTypes.GET_MEMORY_STATS;
}

export interface GetCurrentTabRequest {
  type: typeof MessageTypes.GET_CURRENT_TAB;
}

export interface GetCurrentTabResponse {
  tab: TabInfo | null;
}

export interface NativeCompanionStatusRequest {
  type: typeof MessageTypes.NATIVE_COMPANION_STATUS;
}

export interface MemoryEpisodeSummary {
  id: string;
  kind: 'turn' | 'summary';
  summary: string;
  createdAt: number;
  keywords: string[];
}

export interface MemoryStatsResponse {
  success: boolean;
  episodeCount: number;
  maxEpisodes: number;
  pinnedTabCount: number;
  recentEpisodes: MemoryEpisodeSummary[];
}

export interface CurrentTabInfoMessage {
  type: typeof MessageTypes.CURRENT_TAB_INFO;
  tab: TabInfo;
}

export type NativeCompanionConnectionState =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'disconnected';

export type NativeOverlayStatus = 'running' | 'starting' | 'unsupported';
export type NativeServiceStatus = 'ready' | 'starting' | 'degraded';

export interface NativeCompanionState {
  connectionState: NativeCompanionConnectionState;
  extensionSessionId: string;
  nativeSessionId?: string;
  lastHelloAt?: number;
  lastPingAt?: number;
  lastPongAt?: number;
  lastDisconnectAt?: number;
  reconnectAttempt: number;
  transport: 'native-messaging';
  hostName: string;
  diagnostics: string[];
  overlayStatus: NativeOverlayStatus;
  serviceStatus: NativeServiceStatus;
  supportedFeatures: string[];
}

export interface NativeCompanionStatusResponse {
  success: boolean;
  state: NativeCompanionState;
}

export interface JsonRpcRequest<TParams = Record<string, unknown> | undefined> {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: TParams;
}

export interface JsonRpcSuccess<TResult = unknown> {
  jsonrpc: '2.0';
  id: string;
  result: TResult;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: '2.0';
  id: string | null;
  error: JsonRpcError;
}

export interface JsonRpcNotification<
  TParams = Record<string, unknown> | undefined,
> {
  jsonrpc: '2.0';
  method: string;
  params?: TParams;
}

export type JsonRpcEnvelope<TResult = unknown, TParams = unknown> =
  | JsonRpcRequest<TParams>
  | JsonRpcSuccess<TResult>
  | JsonRpcFailure
  | JsonRpcNotification<TParams>;

export interface NativeHelloParams {
  extensionSessionId: string;
  extensionVersion: string;
  browser: 'chrome';
  capabilities: string[];
  platform?: string;
}

export interface NativeHelloResult {
  nativeSessionId: string;
  overlayStatus: NativeOverlayStatus;
  transport: 'ipc';
  platform: string;
  supportedFeatures: string[];
}

export interface NativePingParams {
  extensionSessionId: string;
  sentAt: number;
}

export interface NativePingResult {
  pong: true;
  receivedAt: number;
  nativeSessionId: string;
}

export interface NativeStatusResult {
  service: NativeServiceStatus;
  overlayStatus: NativeOverlayStatus;
  transport: 'ipc';
  nativeSessionId: string;
  restartCount: number;
  platform: string;
  supportedFeatures: string[];
}

export interface NativeEventParams {
  type:
    | 'service.started'
    | 'service.ready'
    | 'overlay.started'
    | 'overlay.unsupported'
    | 'transport.reconnected';
  nativeSessionId: string;
  emittedAt: number;
  detail?: string;
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'file_data'; mimeType: string; fileUri: string };

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
  | StopGenerationRequest
  | AgentdropAnimateRequest
  | GetMemoryStatsRequest
  | GetCurrentTabRequest
  | NativeCompanionStatusRequest;

export interface LLMResponse {
  reply?: string;
  error?: string;
  aborted?: boolean;
}

/** @deprecated Use LLMResponse instead */
export type GeminiResponse = LLMResponse;

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
  | LLMResponse
  | GetContextResponse
  | SuccessResponse
  | CheckPinnedTabsResponse
  | GetHistoryResponse
  | MemoryStatsResponse
  | GetCurrentTabResponse
  | NativeCompanionStatusResponse;
