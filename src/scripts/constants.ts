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

export const MAX_CONTEXT_LENGTH = 250000;
export const MAX_PINNED_TABS = 6;
export const MAX_AUTO_PINNED_TABS = 50;
export const MODEL_SHORT_TERM_HISTORY_WINDOW = 12;

export const MEMORY_MAX_EPISODES = 160;
export const MEMORY_RECENT_EPISODES_TO_KEEP_RAW = 32;
export const MEMORY_COMPACTION_BATCH_SIZE = 24;
export const MEMORY_RETRIEVAL_TOP_K = 6;
export const MEMORY_NEIGHBOR_EXPANSION_LIMIT = 3;
export const MEMORY_PROMPT_CHAR_BUDGET = 12000;
export const MEMORY_EPISODE_SUMMARY_MAX_CHARS = 900;
export const MEMORY_MAX_KEYWORDS_PER_EPISODE = 16;
export const MEMORY_MAX_QUERY_KEYWORDS = 12;
export const MEMORY_MIN_KEYWORD_LENGTH = 3;
export const MEMORY_MIN_SCORE_THRESHOLD = 0.55;

export const MEMORY_STOPWORDS = [
  'about',
  'after',
  'again',
  'against',
  'all',
  'also',
  'and',
  'any',
  'are',
  'around',
  'because',
  'been',
  'before',
  'being',
  'between',
  'both',
  'but',
  'came',
  'can',
  'could',
  'does',
  'done',
  'each',
  'else',
  'even',
  'every',
  'for',
  'from',
  'gave',
  'give',
  'given',
  'good',
  'have',
  'having',
  'here',
  'into',
  'just',
  'kind',
  'made',
  'make',
  'many',
  'more',
  'most',
  'must',
  'need',
  'only',
  'other',
  'over',
  'same',
  'should',
  'some',
  'such',
  'take',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'under',
  'use',
  'using',
  'user',
  'assistant',
  'question',
  'answer',
  'very',
  'want',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
  'your',
];

/**
 * Total context budget in characters for all pinned tabs combined.
 * Gemini 2.5 supports ~1M tokens (~4M chars), but research shows
 * degradation past ~650K tokens. We target a safe, high-quality range.
 * With summarization, this effectively supports unlimited tabs.
 */
export const TOTAL_CONTEXT_BUDGET = 900000;

/**
 * Minimum characters allocated per tab before it's demoted to metadata-only.
 */
export const MIN_PER_TAB_BUDGET = 2000;

/**
 * Target length for LLM-generated summaries of overflowing tab content.
 * Based on ACON (2025) findings that ~5K char summaries retain ~91% of
 * critical information from typical web pages.
 */
export const SUMMARY_TARGET_LENGTH = 5000;

export const MessageTypes = {
  CHAT_MESSAGE: 'chatMessage',
  GET_CONTEXT: 'getContext',
  SAVE_API_KEY: 'saveApiKey',
  PIN_TAB: 'pinTab',
  UNPIN_TAB: 'unpinTab',
  CURRENT_TAB_INFO: 'currentTabInfo',
  CHECK_PINNED_TABS: 'checkPinnedTabs',
  REOPEN_TAB: 'reopenTab',
  CLEAR_CHAT: 'clearChat',
  GET_HISTORY: 'getHistory',
  STOP_GENERATION: 'stopGeneration',
  AGENTDROP_ANIMATE: 'agentdropAnimate',
  GET_MEMORY_STATS: 'getMemoryStats',
  GET_CURRENT_TAB: 'getCurrentTab',
} as const;

export const StorageKeys = {
  API_KEY: 'geminiApiKey',
  PINNED_CONTEXTS: 'pinnedContexts',
  SELECTED_MODEL: 'selectedModel',
  CHAT_HISTORY: 'chatHistory',
  INCLUDE_CURRENT_TAB: 'includeCurrentTab',
  AGENT_MEMORY: 'agentMemory',
};

export const RestrictedURLs = [
  'chrome://',
  'about:',
  'chrome-extension://',
  'file://',
];

export const CONTEXT_MESSAGES = {
  LOADING_WARNING: '(Page is still loading...)',
  NO_CONTENT_WARNING: '(No text content found on this page)',
  RESTRICTED_URL: '(Content not accessible for restricted URL)',
  EXTENSION_POLICY_ERROR:
    '(Content inaccessible due to your enterprise extension policy)',
  TAB_NOT_FOUND: '(Tab not found or accessible)',
  TAB_ID_NOT_FOUND: '(Tab ID not found)',
  TAB_DISCARDED:
    '(Tab is suspended to save memory. Click it to reload content)',
  ERROR_PREFIX: '(Could not extract content from',
};

export const NOISE_SELECTORS = [
  'nav',
  'footer',
  'script',
  'style',
  'noscript',
  '.ad',
  '.ads',
  '.social-share',
  '#sidebar',
  '.cookie-consent',
];
