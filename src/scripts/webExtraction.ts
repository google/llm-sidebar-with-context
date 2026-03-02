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

import TurndownService from 'turndown';
import { NOISE_SELECTORS } from './constants';

declare global {
  interface Window {
    extractPageContent: (noiseSelectors?: string[]) => string;
  }
}

/**
 * Extracts the content of the current page, cleans it of noise (nav, footer, etc.),
 * and converts it to Markdown with robust fallbacks.
 *
 * @param noiseSelectors Array of CSS selectors to remove. Defaults to NOISE_SELECTORS.
 * @returns Cleaned Markdown representation, cleaned text, or original body text.
 */
export function extractPageContent(
  noiseSelectors: string[] = NOISE_SELECTORS,
): string {
  // 1. Clone the body to avoid modifying the live page
  const bodyClone = document.body.cloneNode(true) as HTMLElement;

  // 2. Remove noise elements
  try {
    noiseSelectors.forEach((selector) => {
      const elements = bodyClone.querySelectorAll(selector);
      elements.forEach((el) => el.remove());
    });
  } catch (error) {
    console.warn('Content cleaning failed:', error);
    // Continue with original bodyClone if cleaning fails partially
  }

  // 3. Attempt Markdown conversion
  try {
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
    });

    const markdown = turndownService.turndown(bodyClone.innerHTML).trim();
    if (markdown) {
      return markdown;
    }
  } catch (error) {
    console.warn('Markdown conversion failed:', error);
    // Fall through to cleaned text fallback
  }

  // 4. Fallback: Cleaned text (using innerText/textContent)
  const cleanedText = (
    bodyClone.innerText ||
    bodyClone.textContent ||
    ''
  ).trim();
  if (cleanedText) {
    return cleanedText;
  }

  // 5. Final Fallback: Original body text
  return (document.body.innerText || document.body.textContent || '').trim();
}

// Make it available on the window object for injection
window.extractPageContent = extractPageContent;
