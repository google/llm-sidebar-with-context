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

export interface ISummarizationService {
  summarize(
    text: string,
    targetLength: number,
    signal?: AbortSignal,
  ): Promise<string>;
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
    signal?: AbortSignal,
  ): Promise<BudgetAllocation[]> {
    if (entries.length === 0) return [];

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
          // Summarization failed — fall back to truncation.
          const budgetForThis = Math.min(remainingBudget, perTabBudget);
          const truncated = textContent.substring(0, budgetForThis);
          allocations.push({
            tabId: entry.tabId,
            title: entry.title,
            url: entry.url,
            tier: 'full',
            content: { type: 'text', text: truncated },
            allocatedChars: truncated.length,
          });
          remainingBudget -= truncated.length;
        }
      } else if (remainingBudget >= MIN_PER_TAB_BUDGET && textContent) {
        // No summarization service — truncate to fit.
        const budgetForThis = Math.min(remainingBudget, perTabBudget);
        const truncated = textContent.substring(0, budgetForThis);
        allocations.push({
          tabId: entry.tabId,
          title: entry.title,
          url: entry.url,
          tier: 'full',
          content: { type: 'text', text: truncated },
          allocatedChars: truncated.length,
        });
        remainingBudget -= truncated.length;
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
}
