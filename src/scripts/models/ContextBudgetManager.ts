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

import { ContentPart } from '../types';
import {
  TOTAL_CONTEXT_BUDGET,
  MIN_PER_TAB_BUDGET,
  SUMMARY_TARGET_LENGTH,
} from '../constants';

/**
 * Represents a tab's content with metadata for budget allocation.
 */
export interface TabContentEntry {
  tabId: number;
  title: string;
  url: string;
  content: ContentPart;
  charLength: number;
}

/**
 * The tier assigned to each tab after budget allocation.
 * - full: raw content (possibly truncated to per-tab budget)
 * - summarized: LLM-compressed summary
 * - metadata: only title + URL (content too large, no budget for summary)
 */
export type ContentTier = 'full' | 'summarized' | 'metadata';

export interface BudgetAllocation {
  tabId: number;
  title: string;
  url: string;
  tier: ContentTier;
  content: ContentPart;
  allocatedChars: number;
}

export interface CompressionOptions {
  signal?: AbortSignal;
  query?: string;
}

export interface ISummarizationService {
  summarize(
    text: string,
    targetLength: number,
    signal?: AbortSignal,
    query?: string,
  ): Promise<string>;
}

interface ScoredSegment {
  index: number;
  text: string;
  score: number;
}

/**
 * ContextBudgetManager implements an adaptive, tiered context allocation
 * strategy inspired by hierarchical summarization (NEXUSSUM, ACL 2025)
 * and context compression (ACON, 2025). It distributes a fixed token
 * budget across an unlimited number of tabs:
 *
 * 1. All tabs start as Tier 1 (full content).
 * 2. If total exceeds budget, the largest tabs are demoted to Tier 2
 *    (summarized via LLM) until budget fits.
 * 3. If still over budget, remaining overflow tabs become Tier 3
 *    (metadata only: title + URL).
 *
 * To keep the implementation simple and avoid a full retrieval stack,
 * the fallback path uses query-aware extractive compression instead of
 * naive head-only truncation.
 */
export class ContextBudgetManager {
  constructor(private summarizationService?: ISummarizationService) {}

  /**
   * Allocates context budget across tab contents.
   * Returns content parts ready to be sent to the LLM, respecting the
   * total budget while maximizing information retention.
   */
  async allocate(
    entries: TabContentEntry[],
    options: CompressionOptions = {},
  ): Promise<BudgetAllocation[]> {
    if (entries.length === 0) return [];

    const { signal, query } = options;

    // Phase 1: Check if everything fits within budget as-is.
    const totalChars = entries.reduce((sum, e) => sum + e.charLength, 0);
    if (totalChars <= TOTAL_CONTEXT_BUDGET) {
      return entries.map((e) => ({
        tabId: e.tabId,
        title: e.title,
        url: e.url,
        tier: 'full' as ContentTier,
        content: e.content,
        allocatedChars: e.charLength,
      }));
    }

    // Phase 2: Compute per-tab budget and identify overflow tabs.
    const perTabBudget = Math.max(
      MIN_PER_TAB_BUDGET,
      Math.floor(TOTAL_CONTEXT_BUDGET / entries.length),
    );

    // Sort entries by size (largest first) for demotion priority.
    const sorted = [...entries].sort((a, b) => b.charLength - a.charLength);

    const allocations: BudgetAllocation[] = [];
    let remainingBudget = TOTAL_CONTEXT_BUDGET;

    for (const entry of sorted) {
      if (signal?.aborted) break;

      const textContent = this.getTextContent(entry.content);

      if (
        entry.charLength <= perTabBudget &&
        remainingBudget >= entry.charLength
      ) {
        // Tier 1: Fits within per-tab budget — use full content.
        allocations.push({
          tabId: entry.tabId,
          title: entry.title,
          url: entry.url,
          tier: 'full',
          content: entry.content,
          allocatedChars: entry.charLength,
        });
        remainingBudget -= entry.charLength;
      } else if (
        remainingBudget >= MIN_PER_TAB_BUDGET &&
        this.summarizationService &&
        textContent
      ) {
        // Tier 2: Over budget — summarize to fit.
        const targetLen = Math.min(
          SUMMARY_TARGET_LENGTH,
          Math.max(MIN_PER_TAB_BUDGET, perTabBudget),
        );
        try {
          const summary = await this.summarizationService.summarize(
            textContent,
            targetLen,
            signal,
            query,
          );
          const summaryLength = summary.length;
          allocations.push({
            tabId: entry.tabId,
            title: entry.title,
            url: entry.url,
            tier: 'summarized',
            content: { type: 'text', text: summary },
            allocatedChars: summaryLength,
          });
          remainingBudget -= summaryLength;
        } catch {
          // Summarization failed — fall back to simple extractive compression.
          const budgetForThis = Math.min(remainingBudget, perTabBudget);
          const compressed = this.compressText(
            textContent,
            budgetForThis,
            query,
          );
          allocations.push({
            tabId: entry.tabId,
            title: entry.title,
            url: entry.url,
            tier: 'full',
            content: { type: 'text', text: compressed },
            allocatedChars: compressed.length,
          });
          remainingBudget -= compressed.length;
        }
      } else if (remainingBudget >= MIN_PER_TAB_BUDGET && textContent) {
        // No summarization service — use simple extractive compression.
        const budgetForThis = Math.min(remainingBudget, perTabBudget);
        const compressed = this.compressText(textContent, budgetForThis, query);
        allocations.push({
          tabId: entry.tabId,
          title: entry.title,
          url: entry.url,
          tier: 'full',
          content: { type: 'text', text: compressed },
          allocatedChars: compressed.length,
        });
        remainingBudget -= compressed.length;
      } else {
        // Tier 3: No budget left — metadata only.
        const metadataText = `[Tab: ${entry.title}] (${entry.url}) — content omitted due to context limit`;
        allocations.push({
          tabId: entry.tabId,
          title: entry.title,
          url: entry.url,
          tier: 'metadata',
          content: { type: 'text', text: metadataText },
          allocatedChars: metadataText.length,
        });
        remainingBudget -= metadataText.length;
      }
    }

    return allocations;
  }

  /**
   * Builds the final ContentPart[] array from allocations,
   * with headers indicating the tier for each tab.
   */
  buildContextParts(allocations: BudgetAllocation[]): ContentPart[] {
    const parts: ContentPart[] = [];
    for (const alloc of allocations) {
      const tierLabel =
        alloc.tier === 'summarized'
          ? ' [Summarized]'
          : alloc.tier === 'metadata'
            ? ' [Metadata Only]'
            : '';
      const header = `\n\n--- Pinned Tab: ${alloc.title} (${alloc.url})${tierLabel} ---`;
      parts.push({ type: 'text', text: header });
      parts.push(alloc.content);
    }
    return parts;
  }

  private getTextContent(part: ContentPart): string | null {
    if (part.type === 'text') return part.text;
    return null;
  }

  private compressText(
    text: string,
    targetLength: number,
    query?: string,
  ): string {
    if (text.length <= targetLength) {
      return text;
    }

    const normalizedQueryTerms = this.getQueryTerms(query);
    const segments = this.segmentText(text);

    if (segments.length === 0) {
      return this.truncateAtBoundary(text, targetLength);
    }

    const scoredSegments = segments.map((segment, index) => ({
      index,
      text: segment,
      score: this.scoreSegment(segment, index, normalizedQueryTerms),
    }));

    const selected: ScoredSegment[] = [];
    let totalLength = 0;

    for (const segment of [...scoredSegments].sort(
      (a, b) => b.score - a.score,
    )) {
      const segmentLength = segment.text.length + (selected.length > 0 ? 2 : 0);
      if (segmentLength > targetLength) {
        continue;
      }
      if (totalLength + segmentLength > targetLength) {
        continue;
      }
      selected.push(segment);
      totalLength += segmentLength;
    }

    if (selected.length === 0) {
      return this.truncateAtBoundary(text, targetLength);
    }

    const compressed = selected
      .sort((a, b) => a.index - b.index)
      .map((segment) => segment.text)
      .join('\n\n');

    return this.truncateAtBoundary(compressed, targetLength);
  }

  private segmentText(text: string): string[] {
    const blockSegments = text
      .split(/\n\s*\n/g)
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (blockSegments.length > 1) {
      return blockSegments;
    }

    return text
      .split(/(?<=[.!?])\s+(?=[A-Z0-9#*-])/g)
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  private scoreSegment(
    segment: string,
    index: number,
    queryTerms: string[],
  ): number {
    const lowerSegment = segment.toLowerCase();
    let score = Math.max(0, 8 - index) * 2;

    if (/^#{1,6}\s|^[A-Z][A-Z\s]{4,}$|^[-*•]\s|^\d+\.\s/m.test(segment)) {
      score += 8;
    }
    if (/```|`[^`]+`/.test(segment)) {
      score += 10;
    }
    if (/\b\d{4}\b|\b\d+(?:\.\d+)?%\b|\$\d|\b[A-Z]{2,10}-\d+\b/.test(segment)) {
      score += 6;
    }

    for (const term of queryTerms) {
      if (term.length < 3) continue;
      if (lowerSegment.includes(term)) {
        score += 15;
      }
    }

    return score;
  }

  private getQueryTerms(query?: string): string[] {
    if (!query) return [];

    const stopWords = new Set([
      'about',
      'after',
      'again',
      'also',
      'been',
      'from',
      'have',
      'into',
      'make',
      'show',
      'that',
      'their',
      'them',
      'they',
      'this',
      'what',
      'when',
      'where',
      'which',
      'with',
      'would',
      'want',
      'over',
      'under',
      'than',
      'then',
      'just',
      'like',
      'into',
      'only',
      'your',
    ]);

    return [
      ...new Set(
        query
          .toLowerCase()
          .split(/[^a-z0-9]+/g)
          .filter((term) => term.length >= 3 && !stopWords.has(term)),
      ),
    ];
  }

  private truncateAtBoundary(text: string, targetLength: number): string {
    if (text.length <= targetLength) {
      return text;
    }

    const truncated = text.substring(0, targetLength);
    const lastBoundary = Math.max(
      truncated.lastIndexOf('\n\n'),
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf('.\n'),
      truncated.lastIndexOf('! '),
      truncated.lastIndexOf('? '),
    );

    if (lastBoundary > targetLength * 0.6) {
      const boundaryOffset = truncated[lastBoundary] === '\n' ? 0 : 1;
      return truncated.substring(0, lastBoundary + boundaryOffset).trimEnd();
    }

    return truncated.trimEnd() + '…';
  }
}
