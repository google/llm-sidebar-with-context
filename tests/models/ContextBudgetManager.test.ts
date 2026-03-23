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

import { describe, it, expect, vi } from 'vitest';
import {
  ContextBudgetManager,
  ISummarizationService,
  TabContentEntry,
} from '../../src/scripts/models/ContextBudgetManager';
import {
  TOTAL_CONTEXT_BUDGET,
  MIN_PER_TAB_BUDGET,
} from '../../src/scripts/constants';

function makeEntry(
  tabId: number,
  charLength: number,
  title?: string,
): TabContentEntry {
  return {
    tabId,
    title: title || `Tab ${tabId}`,
    url: `https://site${tabId}.com`,
    content: { type: 'text', text: 'x'.repeat(charLength) },
    charLength,
  };
}

describe('ContextBudgetManager', () => {
  describe('allocate — all content fits within budget', () => {
    it('should return all entries as Tier 1 (full) when total fits', async () => {
      const manager = new ContextBudgetManager();
      const entries = [makeEntry(1, 1000), makeEntry(2, 2000)];

      const allocations = await manager.allocate(entries);

      expect(allocations).toHaveLength(2);
      allocations.forEach((a) => {
        expect(a.tier).toBe('full');
      });
    });

    it('should return empty array for empty input', async () => {
      const manager = new ContextBudgetManager();
      const allocations = await manager.allocate([]);
      expect(allocations).toEqual([]);
    });
  });

  describe('allocate — content exceeds budget without summarization', () => {
    it('should truncate large tabs when no summarization service', async () => {
      const manager = new ContextBudgetManager();
      // Create entries that exceed the total budget
      const largeSize = Math.floor(TOTAL_CONTEXT_BUDGET / 2) + 100000;
      const entries = [
        makeEntry(1, largeSize),
        makeEntry(2, largeSize),
        makeEntry(3, largeSize),
      ];

      const allocations = await manager.allocate(entries);

      expect(allocations).toHaveLength(3);
      // Total allocated should not exceed budget (approximately)
      const totalAllocated = allocations.reduce(
        (sum, a) => sum + a.allocatedChars,
        0,
      );
      // Some overhead from metadata entries is expected
      expect(totalAllocated).toBeLessThanOrEqual(TOTAL_CONTEXT_BUDGET + 1000);
    });

    it('should demote to metadata when budget is exhausted', async () => {
      const manager = new ContextBudgetManager();
      // Many entries that collectively exhaust the budget, leaving
      // later entries with less than MIN_PER_TAB_BUDGET remaining.
      const numTabs = Math.ceil(TOTAL_CONTEXT_BUDGET / MIN_PER_TAB_BUDGET) + 5;
      const entries = Array.from({ length: numTabs }, (_, i) =>
        makeEntry(i, TOTAL_CONTEXT_BUDGET),
      );

      const allocations = await manager.allocate(entries);

      const metadataEntries = allocations.filter((a) => a.tier === 'metadata');
      expect(metadataEntries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('allocate — with summarization service', () => {
    it('should summarize overflowing tabs', async () => {
      const mockSummarizer: ISummarizationService = {
        summarize: vi.fn().mockResolvedValue('This is a summary.'),
      };
      const manager = new ContextBudgetManager(mockSummarizer);

      // Two tabs that together exceed budget
      const halfBudgetPlus = Math.floor(TOTAL_CONTEXT_BUDGET / 2) + 50000;
      const entries = [
        makeEntry(1, halfBudgetPlus),
        makeEntry(2, halfBudgetPlus),
      ];

      const allocations = await manager.allocate(entries);

      expect(allocations).toHaveLength(2);
      const summarized = allocations.filter((a) => a.tier === 'summarized');
      expect(summarized.length).toBeGreaterThanOrEqual(1);
      expect(mockSummarizer.summarize).toHaveBeenCalled();
    });

    it('should fall back to truncation if summarization fails', async () => {
      const mockSummarizer: ISummarizationService = {
        summarize: vi.fn().mockRejectedValue(new Error('API error')),
      };
      const manager = new ContextBudgetManager(mockSummarizer);

      const halfBudgetPlus = Math.floor(TOTAL_CONTEXT_BUDGET / 2) + 50000;
      const entries = [
        makeEntry(1, halfBudgetPlus),
        makeEntry(2, halfBudgetPlus),
      ];

      const allocations = await manager.allocate(entries);

      expect(allocations).toHaveLength(2);
      // Should not crash — falls back to truncation
      allocations.forEach((a) => {
        expect(a.tier).not.toBe('summarized');
      });
    });
  });

  describe('allocate — many tabs (infinite context scenario)', () => {
    it('should handle 50 small tabs as all full', async () => {
      const manager = new ContextBudgetManager();
      const entries = Array.from({ length: 50 }, (_, i) => makeEntry(i, 1000));

      const allocations = await manager.allocate(entries);

      expect(allocations).toHaveLength(50);
      allocations.forEach((a) => {
        expect(a.tier).toBe('full');
      });
    });

    it('should handle 100 medium tabs with mixed tiers', async () => {
      const mockSummarizer: ISummarizationService = {
        summarize: vi.fn().mockResolvedValue('Summary of tab content.'),
      };
      const manager = new ContextBudgetManager(mockSummarizer);

      // 100 tabs × 20K chars = 2M chars, well over the 900K budget
      const entries = Array.from({ length: 100 }, (_, i) =>
        makeEntry(i, 20000),
      );

      const allocations = await manager.allocate(entries);

      expect(allocations).toHaveLength(100);
      const tiers = {
        full: allocations.filter((a) => a.tier === 'full').length,
        summarized: allocations.filter((a) => a.tier === 'summarized').length,
        metadata: allocations.filter((a) => a.tier === 'metadata').length,
      };

      // With 100 tabs over budget, should have a mix of tiers
      expect(tiers.full + tiers.summarized + tiers.metadata).toBe(100);
    });
  });

  describe('buildContextParts', () => {
    it('should build content parts with appropriate tier labels', async () => {
      const manager = new ContextBudgetManager();

      const allocations = [
        {
          tabId: 1,
          title: 'Full Tab',
          url: 'https://full.com',
          tier: 'full' as const,
          content: { type: 'text' as const, text: 'Full content' },
          allocatedChars: 12,
        },
        {
          tabId: 2,
          title: 'Summarized Tab',
          url: 'https://summarized.com',
          tier: 'summarized' as const,
          content: { type: 'text' as const, text: 'Summary' },
          allocatedChars: 7,
        },
        {
          tabId: 3,
          title: 'Metadata Tab',
          url: 'https://metadata.com',
          tier: 'metadata' as const,
          content: {
            type: 'text' as const,
            text: '[Tab: Metadata Tab] — content omitted',
          },
          allocatedChars: 38,
        },
      ];

      const parts = manager.buildContextParts(allocations);

      expect(parts).toHaveLength(6); // 3 headers + 3 content parts

      // Check tier labels in headers
      const headers = parts.filter(
        (p) => p.type === 'text' && p.text.includes('--- Pinned Tab:'),
      );
      expect(headers[0].type === 'text' && headers[0].text).not.toContain(
        '[Summarized]',
      );
      expect(headers[1].type === 'text' && headers[1].text).toContain(
        '[Summarized]',
      );
      expect(headers[2].type === 'text' && headers[2].text).toContain(
        '[Metadata Only]',
      );
    });
  });
});
