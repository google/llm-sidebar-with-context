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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultWebPageStrategy } from '../../src/scripts/strategies/DefaultWebPageStrategy';
import {
  ITabService,
  TimeoutError,
  ChromeTab,
} from '../../src/scripts/services/tabService';
import {
  MAX_CONTEXT_LENGTH,
  CONTEXT_MESSAGES,
} from '../../src/scripts/constants';

describe('DefaultWebPageStrategy', () => {
  let mockTabService: ITabService;
  let strategy: DefaultWebPageStrategy;

  beforeEach(() => {
    mockTabService = {
      getTab: vi.fn(),
      waitForTabComplete: vi.fn(),
      executeScript: vi.fn(),
    } as unknown as ITabService;
    strategy = new DefaultWebPageStrategy(mockTabService);
  });

  it('should always return true for canHandle', () => {
    expect(strategy.canHandle('https://anything.com')).toBe(true);
  });

  it('should fetch tab by ID and extract content', async () => {
    const tabId = 123;
    const url = 'https://example.com';
    vi.mocked(mockTabService.getTab).mockResolvedValue({
      id: tabId,
      status: 'complete',
      active: true,
      windowId: 1,
      url,
    } as ChromeTab);
    vi.mocked(mockTabService.executeScript).mockResolvedValue('Content');
    const content = await strategy.getContent(tabId, url);

    expect(mockTabService.getTab).toHaveBeenCalledWith(tabId);
    expect(content).toEqual({ type: 'text', text: 'Content' });
  });

  it('should wait for loading tabs to complete and then extract content', async () => {
    const tabId = 123;
    const url = 'https://example.com';
    vi.mocked(mockTabService.getTab).mockResolvedValue({
      id: tabId,
      status: 'loading',
      active: true,
      windowId: 1,
      url,
    } as ChromeTab);
    vi.mocked(mockTabService.waitForTabComplete).mockResolvedValue(undefined);
    vi.mocked(mockTabService.executeScript).mockResolvedValue('Final content');

    const content = await strategy.getContent(tabId, url);

    expect(mockTabService.waitForTabComplete).toHaveBeenCalledWith(tabId, 2000);
    expect(content).toEqual({ type: 'text', text: 'Final content' });
  });

  it('should return a not found message if the tab ID does not exist', async () => {
    vi.mocked(mockTabService.getTab).mockResolvedValue(undefined);
    const content = await strategy.getContent(999, 'https://gone.com');
    expect(content.type).toBe('text');
    if (content.type === 'text') {
      expect(content.text).toContain(CONTEXT_MESSAGES.TAB_NOT_FOUND);
    }
  });

  it('should return a specific message if the tab is discarded', async () => {
    const tabId = 123;
    const url = 'https://example.com';
    vi.mocked(mockTabService.getTab).mockResolvedValue({
      id: tabId,
      discarded: true,
      active: true,
      windowId: 1,
      url,
    } as ChromeTab);

    const content = await strategy.getContent(tabId, url);

    expect(content.type).toBe('text');
    if (content.type === 'text') {
      expect(content.text).toContain(CONTEXT_MESSAGES.TAB_DISCARDED);
    }
  });

  it('should extract available content with a warning if the tab times out while loading', async () => {
    const tabId = 123;
    const url = 'https://example.com';
    vi.mocked(mockTabService.getTab).mockResolvedValue({
      id: tabId,
      status: 'loading',
      active: true,
      windowId: 1,
      url,
    } as ChromeTab);
    vi.mocked(mockTabService.waitForTabComplete).mockRejectedValue(
      new TimeoutError('Timeout'),
    );
    vi.mocked(mockTabService.executeScript).mockResolvedValue(
      'Partial content',
    );

    const content = await strategy.getContent(tabId, url);

    expect(content.type).toBe('text');
    if (content.type === 'text') {
      expect(content.text).toContain(CONTEXT_MESSAGES.LOADING_WARNING);
      expect(content.text).toContain('Partial content');
    }
  });

  it('should return an error message if script execution fails', async () => {
    const tabId = 123;
    const url = 'https://example.com';
    vi.mocked(mockTabService.getTab).mockResolvedValue({
      id: tabId,
      active: true,
      windowId: 1,
      url,
    } as ChromeTab);
    vi.mocked(mockTabService.executeScript).mockRejectedValue(
      new Error('Script failed'),
    );

    const content = await strategy.getContent(tabId, url);

    expect(content.type).toBe('text');
    if (content.type === 'text') {
      expect(content.text).toContain(CONTEXT_MESSAGES.ERROR_PREFIX);
      expect(content.text).toContain('Script failed');
    }
  });

  it("should return a 'No content' message if the page is empty", async () => {
    const tabId = 123;
    const url = 'https://example.com';
    vi.mocked(mockTabService.getTab).mockResolvedValue({
      id: tabId,
      active: true,
      windowId: 1,
      url,
    } as ChromeTab);
    vi.mocked(mockTabService.executeScript).mockResolvedValue('   ');

    const content = await strategy.getContent(tabId, url);
    expect(content).toEqual({
      type: 'text',
      text: CONTEXT_MESSAGES.NO_CONTENT_WARNING,
    });
  });

  it('should return the truncated text content of the tab', async () => {
    const tabId = 123;
    const url = 'https://example.com';
    const longContent = 'A'.repeat(MAX_CONTEXT_LENGTH + 100);
    vi.mocked(mockTabService.getTab).mockResolvedValue({
      id: tabId,
      active: true,
      windowId: 1,
      url,
    } as ChromeTab);
    vi.mocked(mockTabService.executeScript).mockResolvedValue(longContent);

    const content = await strategy.getContent(tabId, url);

    expect(content.type).toBe('text');
    if (content.type === 'text') {
      expect(content.text.length).toBe(MAX_CONTEXT_LENGTH);
      expect(content.text).toBe('A'.repeat(MAX_CONTEXT_LENGTH));
    }
  });

  it('should return a restricted URL message and suppress console error for ExtensionsSettings policy error', async () => {
    const tabId = 123;
    const url = 'https://example.com';
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(mockTabService.getTab).mockResolvedValue({
      id: tabId,
      active: true,
      windowId: 1,
      url,
    } as ChromeTab);
    vi.mocked(mockTabService.executeScript).mockRejectedValue(
      new Error(
        'This page cannot be scripted due to an ExtensionsSettings policy',
      ),
    );

    const content = await strategy.getContent(tabId, url);

    expect(content).toEqual({
      type: 'text',
      text: CONTEXT_MESSAGES.RESTRICTED_URL,
    });
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
