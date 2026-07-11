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

import { OLLAMA_DNR_RULE_ID, OLLAMA_TEST_DNR_RULE_ID } from '../constants';
import { OllamaConfig } from '../types';

/**
 * Builds the declarativeNetRequest rule that rewrites the Origin header on
 * requests to the Ollama host. Ollama rejects requests from
 * chrome-extension:// origins (CORS), so we spoof a same-origin request.
 * @param origin - The normalized Ollama origin (e.g. "http://127.0.0.1:11434").
 * @param ruleId - The dynamic rule id to build under.
 * @param priority - The rule priority (the test rule outranks the main rule).
 */
export function buildOllamaOriginRule(
  origin: string,
  ruleId: number = OLLAMA_DNR_RULE_ID,
  priority: number = 1,
): chrome.declarativeNetRequest.Rule {
  const hostname = new URL(origin).hostname;
  return {
    id: ruleId,
    priority: priority,
    condition: {
      requestDomains: [hostname],
      // Scope the Origin spoof to the extension's own requests. Without this,
      // the rule rewrites the Origin header on *any* request to the Ollama
      // host (from web pages, other extensions), which would let a malicious
      // page bypass Ollama's Origin-based CORS check to reach the local server.
      initiatorDomains: [chrome.runtime.id],
    },
    action: {
      type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
      requestHeaders: [
        {
          header: 'Origin',
          operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
          value: origin,
        },
      ],
    },
  };
}

export interface IDNRService {
  /**
   * Makes the main DNR dynamic rule match the given config: installs the
   * Origin-rewrite rule when Ollama is enabled, removes it when disabled.
   * Idempotent.
   */
  ensureRule(config: OllamaConfig): Promise<void>;

  /**
   * Installs the temporary Origin-rewrite rule used by connection tests
   * against a (possibly unsaved) host. Lives under its own rule id so the
   * main rule — and any chat request relying on it — is never disturbed.
   * @param origin - The normalized origin to test.
   */
  setTestRule(origin: string): Promise<void>;

  /** Removes the connection-test rule. Idempotent. */
  removeTestRule(): Promise<void>;
}

export class ChromeDNRService implements IDNRService {
  async ensureRule(config: OllamaConfig): Promise<void> {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [OLLAMA_DNR_RULE_ID],
      addRules: config.enabled ? [buildOllamaOriginRule(config.host)] : [],
    });
  }

  async setTestRule(origin: string): Promise<void> {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [OLLAMA_TEST_DNR_RULE_ID],
      addRules: [buildOllamaOriginRule(origin, OLLAMA_TEST_DNR_RULE_ID, 2)],
    });
  }

  async removeTestRule(): Promise<void> {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [OLLAMA_TEST_DNR_RULE_ID],
    });
  }
}
