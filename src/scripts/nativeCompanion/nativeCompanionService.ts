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

import {
  NATIVE_COMPANION_HEARTBEAT_INTERVAL_MS,
  NATIVE_COMPANION_HOST_NAME,
  NATIVE_COMPANION_MAX_RECONNECT_DELAY_MS,
  NATIVE_COMPANION_RECONNECT_ALARM,
  NATIVE_COMPANION_REQUEST_TIMEOUT_MS,
  StorageKeys,
} from '../constants';
import {
  JsonRpcEnvelope,
  JsonRpcFailure,
  JsonRpcRequest,
  JsonRpcSuccess,
  NativeCompanionState,
  NativeHelloParams,
  NativeHelloResult,
  NativePingParams,
  NativePingResult,
  NativeStatusResult,
} from '../types';
import { ILocalStorageService } from '../services/storageService';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: number;
};

function randomId(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

function createInitialState(): NativeCompanionState {
  return {
    connectionState: 'disconnected',
    extensionSessionId: randomId(),
    reconnectAttempt: 0,
    transport: 'native-messaging',
    hostName: NATIVE_COMPANION_HOST_NAME,
    diagnostics: [],
    overlayStatus: 'starting',
    serviceStatus: 'starting',
    supportedFeatures: [],
  };
}

function isJsonRpcSuccess(
  value: JsonRpcEnvelope<unknown>,
): value is JsonRpcSuccess<unknown> {
  return 'id' in value && 'result' in value;
}

function isJsonRpcFailure(
  value: JsonRpcEnvelope<unknown>,
): value is JsonRpcFailure {
  return 'error' in value;
}

export class NativeCompanionService {
  private port: chrome.runtime.Port | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly state: NativeCompanionState = createInitialState();
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private isStarting = false;

  constructor(private readonly localStorageService: ILocalStorageService) {}

  async start(): Promise<void> {
    if (this.isStarting) {
      return;
    }

    this.isStarting = true;
    await this.restoreState();
    this.registerAlarmListener();
    this.ensureReconnectAlarm();
    await this.connect();
    this.isStarting = false;
  }

  getState(): NativeCompanionState {
    return {
      ...this.state,
      diagnostics: [...this.state.diagnostics],
      supportedFeatures: [...this.state.supportedFeatures],
    };
  }

  private registerAlarmListener() {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name !== NATIVE_COMPANION_RECONNECT_ALARM) {
        return;
      }

      if (!this.port) {
        void this.connect();
      }
    });
  }

  private ensureReconnectAlarm() {
    chrome.alarms.create(NATIVE_COMPANION_RECONNECT_ALARM, {
      periodInMinutes: 1,
    });
  }

  private async restoreState() {
    const saved = await this.localStorageService.get<NativeCompanionState>(
      StorageKeys.NATIVE_COMPANION_STATE,
    );

    if (!saved) {
      await this.persistState();
      return;
    }

    this.state.extensionSessionId = saved.extensionSessionId || randomId();
    this.state.hostName = saved.hostName || NATIVE_COMPANION_HOST_NAME;
    this.state.transport = 'native-messaging';
    this.state.overlayStatus = saved.overlayStatus || 'starting';
    this.state.serviceStatus = saved.serviceStatus || 'starting';
    this.state.supportedFeatures = saved.supportedFeatures || [];
    this.state.diagnostics = saved.diagnostics || [];
  }

  private async persistState() {
    await this.localStorageService.set(
      StorageKeys.NATIVE_COMPANION_STATE,
      this.getState(),
    );
  }

  private async connect(): Promise<void> {
    if (this.port) {
      return;
    }

    this.clearReconnectTimer();
    this.state.connectionState = 'connecting';
    await this.persistState();

    try {
      this.port = chrome.runtime.connectNative(this.state.hostName);
      this.port.onMessage.addListener((message) => {
        void this.handlePortMessage(message as JsonRpcEnvelope<unknown>);
      });
      this.port.onDisconnect.addListener(() => {
        void this.handleDisconnect(chrome.runtime.lastError?.message);
      });

      await this.sayHello();
      await this.fetchStatus();
      this.startHeartbeatLoop();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.handleDisconnect(message);
    }
  }

  private async sayHello() {
    const manifest = chrome.runtime.getManifest();
    const result = await this.call<NativeHelloResult, NativeHelloParams>(
      'hello',
      {
        extensionSessionId: this.state.extensionSessionId,
        extensionVersion: manifest.version,
        browser: 'chrome',
        capabilities: ['overlay', 'boot-start', 'json-rpc', 'heartbeat'],
        platform: navigator.platform,
      },
    );

    this.state.connectionState = 'connected';
    this.state.nativeSessionId = result.nativeSessionId;
    this.state.lastHelloAt = Date.now();
    this.state.overlayStatus = result.overlayStatus;
    this.state.supportedFeatures = result.supportedFeatures;
    this.pushDiagnostic(
      `hello ok native=${result.nativeSessionId} overlay=${result.overlayStatus}`,
    );
    await this.persistState();
  }

  private async fetchStatus() {
    const result = await this.call<NativeStatusResult>('status');
    this.state.nativeSessionId = result.nativeSessionId;
    this.state.overlayStatus = result.overlayStatus;
    this.state.serviceStatus = result.service;
    this.state.supportedFeatures = result.supportedFeatures;
    await this.persistState();
  }

  private startHeartbeatLoop() {
    this.clearHeartbeatTimer();

    const tick = () => {
      this.heartbeatTimer = self.setTimeout(() => {
        void this.sendHeartbeat().finally(() => {
          if (this.port) {
            tick();
          }
        });
      }, NATIVE_COMPANION_HEARTBEAT_INTERVAL_MS);
    };

    tick();
  }

  private async sendHeartbeat() {
    if (!this.port) {
      return;
    }

    this.state.lastPingAt = Date.now();
    const result = await this.call<NativePingResult, NativePingParams>('ping', {
      extensionSessionId: this.state.extensionSessionId,
      sentAt: this.state.lastPingAt,
    });

    this.state.connectionState = 'connected';
    this.state.lastPongAt = result.receivedAt;
    this.state.nativeSessionId = result.nativeSessionId;
    await this.persistState();
  }

  private async call<TResult, TParams = Record<string, unknown> | undefined>(
    method: string,
    params?: TParams,
  ): Promise<TResult> {
    if (!this.port) {
      throw new Error('Native companion port is not connected');
    }

    const id = randomId();
    const request: JsonRpcRequest<TParams> = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return await new Promise<TResult>((resolve, reject) => {
      const timeoutId = self.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for native response: ${method}`));
      }, NATIVE_COMPANION_REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
      });
      this.port?.postMessage(request);
    });
  }

  private async handlePortMessage(message: JsonRpcEnvelope<unknown>) {
    if (!('id' in message) || message.id === null) {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    self.clearTimeout(pending.timeoutId);
    this.pending.delete(message.id);

    if (isJsonRpcFailure(message)) {
      pending.reject(
        new Error(
          `Native companion error ${message.error.code}: ${message.error.message}`,
        ),
      );
      return;
    }

    if (isJsonRpcSuccess(message)) {
      pending.resolve(message.result);
    }
  }

  private async handleDisconnect(reason?: string) {
    this.clearHeartbeatTimer();
    this.port = null;

    for (const pending of this.pending.values()) {
      self.clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason || 'Native companion disconnected'));
    }
    this.pending.clear();

    this.state.connectionState =
      this.state.lastPongAt && Date.now() - this.state.lastPongAt < 90000
        ? 'degraded'
        : 'disconnected';
    this.state.lastDisconnectAt = Date.now();
    this.state.reconnectAttempt += 1;
    this.pushDiagnostic(`disconnect ${reason || 'unknown'}`);
    await this.persistState();

    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) {
      return;
    }

    const delay = Math.min(
      1000 * 2 ** Math.min(this.state.reconnectAttempt, 5),
      NATIVE_COMPANION_MAX_RECONNECT_DELAY_MS,
    );

    this.reconnectTimer = self.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      self.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearHeartbeatTimer() {
    if (this.heartbeatTimer !== null) {
      self.clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private pushDiagnostic(message: string) {
    this.state.diagnostics = [message, ...this.state.diagnostics].slice(0, 16);
  }
}
