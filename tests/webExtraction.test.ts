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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractPageContent } from '../src/scripts/webExtraction';
import TurndownService from 'turndown';

describe('webExtraction', () => {
  beforeEach(() => {
    // Clear the DOM before each test
    document.body.innerHTML = '';
    // Restore all mocks to their original behavior
    vi.restoreAllMocks();
    // Silence console warnings in tests
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('should remove elements matching NOISE_SELECTORS', () => {
    document.body.innerHTML = `
      <nav>Menu</nav>
      <main><h1>Title</h1><p>Main content.</p></main>
      <footer>Footer</footer>
      <div class="ad">Ad</div>
    `;

    const result = extractPageContent();

    // Should contain main content
    expect(result).toContain('# Title');
    expect(result).toContain('Main content.');

    // Should NOT contain noise
    expect(result).not.toContain('Menu');
    expect(result).not.toContain('Footer');
    expect(result).not.toContain('Ad');
  });

  it('should convert HTML structure to high-quality Markdown', () => {
    document.body.innerHTML = `
      <h1>Heading</h1>
      <p>This is <b>bold</b> and <i>italic</i>.</p>
      <pre><code>const x = 1;</code></pre>
      <hr>
    `;

    const result = extractPageContent([]);

    expect(result).toContain('# Heading');
    expect(result).toContain('**bold**');
    expect(result).toContain('_italic_');
    expect(result).toContain('```');
    expect(result).toContain('---');
  });

  it('should fall back to cleaned text if Markdown conversion returns nothing', () => {
    document.body.innerHTML = `
      <nav>Noise</nav>
      <main>Fallback clean text</main>
    `;

    // Force turndown to return an empty string
    vi.spyOn(TurndownService.prototype, 'turndown').mockReturnValue('');

    const result = extractPageContent();

    // Should return text from <main> but NOT from <nav>
    expect(result.trim()).toBe('Fallback clean text');
    expect(result).not.toContain('Noise');
  });

  it('should fall back to cleaned text if Markdown conversion throws', () => {
    document.body.innerHTML = `
      <nav>Noise</nav>
      <main>Fallback clean text</main>
    `;

    // Force turndown to throw
    vi.spyOn(TurndownService.prototype, 'turndown').mockImplementation(() => {
      throw new Error('Conversion failed');
    });

    const result = extractPageContent();

    // Should log a warning and fall back to cleaned text
    expect(console.warn).toHaveBeenCalledWith(
      'Markdown conversion failed:',
      expect.any(Error),
    );
    expect(result.trim()).toBe('Fallback clean text');
    expect(result).not.toContain('Noise');
  });

  it('should not modify the original document body', () => {
    const originalHTML = '<nav>Nav</nav><main>Content</main>';
    document.body.innerHTML = originalHTML;

    extractPageContent();

    // The live page must remain exactly as it was
    expect(document.body.innerHTML).toBe(originalHTML);
  });

  it('should fall back to original body text if cleaning removes everything', () => {
    document.body.innerHTML = '<nav>Only noise</nav>';

    const result = extractPageContent();

    // If cleaning results in nothing, we prefer noisy content over no content
    expect(result.trim()).toBe('Only noise');
  });

  it('should handle malformed HTML gracefully', () => {
    document.body.innerHTML =
      '<div><h1>Title<p>Unclosed tags and <b>mismatched blocks';

    const result = extractPageContent([]);

    expect(result).toContain('# Title');
    expect(result).toContain('Unclosed tags');
    expect(result).toContain('**mismatched blocks**');
  });
});
