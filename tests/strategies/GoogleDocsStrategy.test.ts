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
import {
  GoogleDocsStrategy,
  extractGoogleDocsContent,
} from '../../src/scripts/strategies/GoogleDocsStrategy';
import {
  ITabService,
  TimeoutError,
} from '../../src/scripts/services/tabService';
import { CONTEXT_MESSAGES } from '../../src/scripts/constants';

describe('extractGoogleDocsContent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should return null and debug info if no scripts are found', () => {
    const result = extractGoogleDocsContent();
    expect(result.content).toBeNull();
    expect(result.debug).toBe('No DOCS_modelChunk scripts found');
  });

  it('should extract content from a single script tag', () => {
    const script = document.createElement('script');
    script.innerText =
      'DOCS_modelChunk = {"chunk": [{"s": "Hello World", "ibi": 1}]};';
    document.body.appendChild(script);

    const result = extractGoogleDocsContent();
    expect(result.content).toBe('Hello World');
  });

  it('should extract and sort content from multiple script tags', () => {
    const script2 = document.createElement('script');
    script2.innerText =
      'DOCS_modelChunk = {"chunk": [{"s": " World", "ibi": 2}]};';
    document.body.appendChild(script2);

    const script1 = document.createElement('script');
    script1.innerText =
      'DOCS_modelChunk = {"chunk": [{"s": "Hello", "ibi": 1}]};';
    document.body.appendChild(script1);

    const result = extractGoogleDocsContent();
    expect(result.content).toBe('Hello World');
  });

  it('should handle scripts with extra DOCS_ assignments', () => {
    const script = document.createElement('script');
    script.innerText =
      'DOCS_modelChunk = {"chunk": [{"s": "Hello", "ibi": 1}]}; DOCS_warmStartDocumentLoader();';
    document.body.appendChild(script);

    const result = extractGoogleDocsContent();
    expect(result.content).toBe('Hello');
  });

  it('should handle malformed JSON in one chunk but still parse others', () => {
    const script1 = document.createElement('script');
    script1.innerText = 'DOCS_modelChunk = { invalid json };';
    document.body.appendChild(script1);

    const script2 = document.createElement('script');
    script2.innerText =
      'DOCS_modelChunk = {"chunk": [{"s": "Valid", "ibi": 1}]};';
    document.body.appendChild(script2);

    const result = extractGoogleDocsContent();
    expect(result.content).toBe('Valid');
  });

  it('should return null if scripts are found but no content is extracted', () => {
    const script = document.createElement('script');
    script.innerText = 'DOCS_modelChunk = {"chunk": []};';
    document.body.appendChild(script);

    const result = extractGoogleDocsContent();
    expect(result.content).toBeNull();
    expect(result.debug).toBe('Found scripts but failed to parse content');
  });

  it('should handle script tags without innerText safely', () => {
    const script = document.createElement('script');
    document.body.appendChild(script);

    const result = extractGoogleDocsContent();
    expect(result.content).toBeNull();
  });

  it('should handle unexpected errors during extraction', () => {
    vi.spyOn(document, 'querySelectorAll').mockImplementationOnce(() => {
      throw new Error('DOM Error');
    });

    const result = extractGoogleDocsContent();
    expect(result.content).toBeNull();
    expect(result.debug).toBe('Extraction error: Error: DOM Error');
  });
});

describe('GoogleDocsStrategy', () => {
  let strategy: GoogleDocsStrategy;
  let mockTabService: ITabService;

  beforeEach(() => {
    mockTabService = {
      query: vi.fn(),
      executeScript: vi.fn(),
      executeScriptFile: vi.fn(),
      create: vi.fn(),
      waitForTabComplete: vi.fn(),
      getTab: vi.fn(),
    };
    strategy = new GoogleDocsStrategy(mockTabService);
  });

  describe('canHandle', () => {
    it('should return true for Google Docs URLs', () => {
      expect(
        strategy.canHandle('https://docs.google.com/document/d/12345/edit'),
      ).toBe(true);
      expect(strategy.canHandle('https://docs.google.com/document/u/0/')).toBe(
        true,
      );
    });

    it('should return false for non-Google Docs URLs', () => {
      expect(strategy.canHandle('https://www.google.com')).toBe(false);
      expect(strategy.canHandle('https://docs.google.com/spreadsheets/')).toBe(
        false,
      );
      expect(strategy.canHandle('https://docs.google.com/presentation/')).toBe(
        false,
      );
      expect(strategy.canHandle('https://docs.google.com/forms/')).toBe(false);
      expect(strategy.canHandle('https://example.com')).toBe(false);
    });
  });

  describe('getContent', () => {
    const tabId = 123;
    const url = 'https://docs.google.com/document/d/12345/edit';

    it('should return "Tab not found" if tab does not exist', async () => {
      vi.mocked(mockTabService.getTab).mockResolvedValue(undefined);

      const result = await strategy.getContent(tabId, url);

      expect(result).toEqual({
        type: 'text',
        text: `${CONTEXT_MESSAGES.TAB_NOT_FOUND}: ${url}`,
      });
    });

    it('should return "Tab discarded" if tab is discarded', async () => {
      vi.mocked(mockTabService.getTab).mockResolvedValue({
        id: tabId,
        url,
        active: false,
        discarded: true,
        windowId: 1,
        status: 'complete',
      });

      const result = await strategy.getContent(tabId, url);

      expect(result).toEqual({
        type: 'text',
        text: `${CONTEXT_MESSAGES.TAB_DISCARDED}: ${url}`,
      });
    });

    it('should wait for tab to complete if loading', async () => {
      vi.mocked(mockTabService.getTab).mockResolvedValue({
        id: tabId,
        url,
        active: true,
        discarded: false,
        windowId: 1,
        status: 'loading',
      });

      vi.mocked(mockTabService.executeScript).mockResolvedValue({
        content: 'Document Content',
      });

      await strategy.getContent(tabId, url);

      expect(mockTabService.waitForTabComplete).toHaveBeenCalledWith(
        tabId,
        2000,
      );
    });

    it('should return warning prefix if waiting times out', async () => {
      vi.mocked(mockTabService.getTab).mockResolvedValue({
        id: tabId,
        url,
        active: true,
        discarded: false,
        windowId: 1,
        status: 'loading',
      });

      vi.mocked(mockTabService.waitForTabComplete).mockRejectedValue(
        new TimeoutError('Timeout'),
      );
      vi.mocked(mockTabService.executeScript).mockResolvedValue({
        content: 'Document Content',
      });

      const result = await strategy.getContent(tabId, url);

      expect(result).toEqual({
        type: 'text',
        text: `${CONTEXT_MESSAGES.LOADING_WARNING} Document Content`,
      });
    });

    it('should handle non-timeout errors during tab completion', async () => {
      vi.mocked(mockTabService.getTab).mockResolvedValue({
        id: tabId,
        url,
        active: true,
        discarded: false,
        windowId: 1,
        status: 'loading',
      });

      vi.mocked(mockTabService.waitForTabComplete).mockRejectedValue(
        new Error('Unexpected Error'),
      );

      await expect(strategy.getContent(tabId, url)).rejects.toThrow(
        'Unexpected Error',
      );
    });

    it('should execute script and return content', async () => {
      vi.mocked(mockTabService.getTab).mockResolvedValue({
        id: tabId,
        url,
        active: true,
        discarded: false,
        windowId: 1,
        status: 'complete',
      });

      vi.mocked(mockTabService.executeScript).mockResolvedValue({
        content: 'Extracted Content',
      });

      const result = await strategy.getContent(tabId, url);

      expect(mockTabService.executeScript).toHaveBeenCalledWith(
        tabId,
        expect.any(Function),
      );
      expect(result).toEqual({
        type: 'text',
        text: 'Extracted Content',
      });
    });

    it('should return warning if no content is found', async () => {
      vi.mocked(mockTabService.getTab).mockResolvedValue({
        id: tabId,
        url,
        active: true,
        discarded: false,
        windowId: 1,
        status: 'complete',
      });

      vi.mocked(mockTabService.executeScript).mockResolvedValue({
        content: '',
      });

      const result = await strategy.getContent(tabId, url);

      expect(result).toEqual({
        type: 'text',
        text: `${CONTEXT_MESSAGES.NO_CONTENT_WARNING} (No content found)`,
      });
    });

    it('should include debug info if scripts are missing', async () => {
      vi.mocked(mockTabService.getTab).mockResolvedValue({
        id: tabId,
        url,
        active: true,
        discarded: false,
        windowId: 1,
        status: 'complete',
      });

      vi.mocked(mockTabService.executeScript).mockResolvedValue({
        content: null,
        debug: 'No DOCS_modelChunk scripts found',
      });

      const result = await strategy.getContent(tabId, url);

      expect(result).toEqual({
        type: 'text',
        text: `${CONTEXT_MESSAGES.NO_CONTENT_WARNING} (Debug: No DOCS_modelChunk scripts found)`,
      });
    });

    it('should handle script execution errors', async () => {
      vi.mocked(mockTabService.getTab).mockResolvedValue({
        id: tabId,
        url,
        active: true,
        discarded: false,
        windowId: 1,
        status: 'complete',
      });

      vi.mocked(mockTabService.executeScript).mockRejectedValue(
        new Error('Script failed'),
      );

      const result = await strategy.getContent(tabId, url);

      expect(result).toEqual({
        type: 'text',
        text: `${CONTEXT_MESSAGES.ERROR_PREFIX} ${url}: Script failed)`,
      });
    });

    it('should truncate long content using sandwichTruncate', async () => {
      vi.mocked(mockTabService.getTab).mockResolvedValue({
        id: tabId,
        url,
        active: true,
        discarded: false,
        windowId: 1,
        status: 'complete',
      });

      const longContent = 'A'.repeat(200) + 'B'.repeat(200) + 'C'.repeat(200);
      vi.mocked(mockTabService.executeScript).mockResolvedValue({
        content: longContent,
      });

      const charLimit = 100;
      const result = await strategy.getContent(tabId, url, charLimit);

      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result.text.length).toBe(charLimit);
        expect(result.text).toContain(CONTEXT_MESSAGES.TRUNCATION_MESSAGE);
        expect(result.text.startsWith('AAAA')).toBe(true);
        expect(result.text.endsWith('CCCC')).toBe(true);
      }
    });

    it('should handle extension policy errors', async () => {
      vi.mocked(mockTabService.getTab).mockResolvedValue({
        id: tabId,
        url,
        active: true,
        discarded: false,
        windowId: 1,
        status: 'complete',
      });

      vi.mocked(mockTabService.executeScript).mockRejectedValue(
        new Error('ExtensionsSettings policy'),
      );

      const result = await strategy.getContent(tabId, url);

      expect(result).toEqual({
        type: 'text',
        text: CONTEXT_MESSAGES.EXTENSION_POLICY_ERROR,
      });
    });
  });
});
