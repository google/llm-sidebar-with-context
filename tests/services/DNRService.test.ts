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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildOllamaOriginRule,
  ChromeDNRService,
} from '../../src/scripts/services/dnrService';
import {
  OLLAMA_DNR_RULE_ID,
  OLLAMA_TEST_DNR_RULE_ID,
} from '../../src/scripts/constants';
import { OllamaConfig } from '../../src/scripts/types';

describe('buildOllamaOriginRule', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', { runtime: { id: 'ext-id' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should build an Origin-rewrite rule for the host', () => {
    const rule = buildOllamaOriginRule('http://127.0.0.1:11434');

    expect(rule).toEqual({
      id: OLLAMA_DNR_RULE_ID,
      priority: 1,
      condition: {
        requestDomains: ['127.0.0.1'],
        initiatorDomains: ['ext-id'],
      },
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          {
            header: 'Origin',
            operation: 'set',
            value: 'http://127.0.0.1:11434',
          },
        ],
      },
    });
  });

  it('should extract the hostname for non-default hosts', () => {
    const rule = buildOllamaOriginRule('http://ollama.local:8080');
    expect(rule.condition.requestDomains).toEqual(['ollama.local']);
    expect(rule.action.requestHeaders?.[0].value).toBe(
      'http://ollama.local:8080',
    );
  });

  it('should build under the given rule id and priority', () => {
    const rule = buildOllamaOriginRule(
      'http://127.0.0.1:11434',
      OLLAMA_TEST_DNR_RULE_ID,
      2,
    );
    expect(rule.id).toBe(OLLAMA_TEST_DNR_RULE_ID);
    expect(rule.priority).toBe(2);
  });
});

describe('ChromeDNRService', () => {
  let service: ChromeDNRService;
  let updateDynamicRules: ReturnType<typeof vi.fn>;

  const config = (enabled: boolean, host: string): OllamaConfig => ({
    enabled,
    host,
    numCtx: 4096,
  });

  beforeEach(() => {
    updateDynamicRules = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      declarativeNetRequest: { updateDynamicRules },
      runtime: { id: 'ext-id' },
    });
    service = new ChromeDNRService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should install the rule when Ollama is enabled', async () => {
    await service.ensureRule(config(true, 'http://127.0.0.1:11434'));

    expect(updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [OLLAMA_DNR_RULE_ID],
      addRules: [buildOllamaOriginRule('http://127.0.0.1:11434')],
    });
  });

  it('should remove the rule when Ollama is disabled', async () => {
    await service.ensureRule(config(false, 'http://127.0.0.1:11434'));

    expect(updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [OLLAMA_DNR_RULE_ID],
      addRules: [],
    });
  });

  it('should propagate update failures to the caller', async () => {
    updateDynamicRules.mockRejectedValueOnce(new Error('boom'));

    await expect(
      service.ensureRule(config(true, 'http://127.0.0.1:11434')),
    ).rejects.toThrow('boom');
  });

  it('should install the test rule under its own id without touching the main rule', async () => {
    await service.setTestRule('http://localhost:9999');

    expect(updateDynamicRules).toHaveBeenCalledTimes(1);
    expect(updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [OLLAMA_TEST_DNR_RULE_ID],
      addRules: [
        buildOllamaOriginRule(
          'http://localhost:9999',
          OLLAMA_TEST_DNR_RULE_ID,
          2,
        ),
      ],
    });
  });

  it('should remove only the test rule', async () => {
    await service.removeTestRule();

    expect(updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [OLLAMA_TEST_DNR_RULE_ID],
    });
  });
});
