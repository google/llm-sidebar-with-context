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

export const MAX_CONTEXT_LENGTH_CHARS_PER_TAB_DEFAULT = 250000;
export const MAX_PINNED_TABS = 6;

export const MessageTypes = {
  CHAT_MESSAGE: 'chatMessage',
  GET_CONTEXT: 'getContext',
  PIN_TAB: 'pinTab',
  UNPIN_TAB: 'unpinTab',
  CURRENT_TAB_INFO: 'currentTabInfo',
  CHECK_PINNED_TABS: 'checkPinnedTabs',
  CLEAR_CHAT: 'clearChat',
  GET_HISTORY: 'getHistory',
  STOP_GENERATION: 'stopGeneration',
  OLLAMA_LIST_MODELS: 'ollamaListModels',
  OLLAMA_TEST_CONNECTION: 'ollamaTestConnection',
} as const;

export const Providers = {
  // Stored value kept as 'gemini' for backward compatibility.
  GOOGLE_GEMINI: 'gemini',
  OLLAMA: 'ollama',
} as const;

export const Themes = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark',
};

export const StorageKeys = {
  API_KEY: 'geminiApiKey',
  GEMINI_ENABLED: 'geminiEnabled',
  PINNED_CONTEXTS: 'pinnedContexts',
  // Stored value kept as 'selectedModel' for backward compatibility.
  GEMINI_MODEL: 'selectedModel',
  CHAT_HISTORY: 'chatHistory',
  INCLUDE_CURRENT_TAB: 'includeCurrentTab',
  THEME: 'theme',
  OLLAMA_SETTINGS: 'ollamaSettings',
  SELECTED_PROVIDER: 'selectedProvider',
  OLLAMA_MODEL: 'ollamaModel',
  OLLAMA_MODELS_CACHE: 'ollamaModelsCache',
};

// Stored/UI shape: empty strings mean "use the defaults below".
export const DEFAULT_OLLAMA_SETTINGS = {
  enabled: false,
  host: '',
  numCtx: '',
  keepAlive: '',
} as const;

export const OLLAMA_DEFAULT_HOST = 'http://127.0.0.1:11434';
// Assumed context window for budgeting tab content when the user has not set
// num_ctx. Used only for truncation math — never sent to Ollama, so the
// server's own configuration applies to the actual request.
export const OLLAMA_ASSUMED_NUM_CTX = 4096;
export const OLLAMA_NUM_CTX_MIN = 512;
export const OLLAMA_NUM_CTX_MAX = 1048576;
// Tokens reserved for the model's output (including "thinking" tokens on
// reasoning models); the rest of the window is budgeted for input.
export const OLLAMA_RESPONSE_RESERVE_TOKENS = 1024;
// Conservative chars-per-token estimate for real page content (markdown,
// links, unicode measure closer to ~3 than the often-quoted 4).
export const CHARS_PER_TOKEN = 3;
export const MIN_CONTEXT_LENGTH_CHARS_PER_TAB = 1000;
export const OLLAMA_DNR_RULE_ID = 1;
// Separate rule for connection tests against a (possibly unsaved) host, so
// testing never disturbs the main rule used by in-flight chat requests.
// Higher priority: when the tested host equals the saved host both rules
// match, and the test rule's header value must win deterministically.
export const OLLAMA_TEST_DNR_RULE_ID = 2;
// Bounds every Ollama model-list fetch so an unreachable host (hanging TCP
// connect) cannot stall callers such as sidebar startup.
export const OLLAMA_LIST_MODELS_TIMEOUT_MS = 5000;

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
  TRUNCATION_MESSAGE:
    '\n... CONTENT TRUNCATED DUE TO LIMITED CONTEXT WINDOW ...\n',
  FILE_CONTENT_UNSUPPORTED:
    '(Video/file content is not supported by Ollama and was omitted)',
};

export const NOISE_SELECTORS = [
  'nav',
  'footer',
  'script',
  'style',
  'noscript',
  'source',
  '.ad',
  '.ads',
  '.social-share',
  '#sidebar',
  '.cookie-consent',
];

export const SUPPORTED_MODELS = {
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'gemini-3.6-flash': 'Gemini 3.6 Flash',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
} as const;

export type SupportedModelId = keyof typeof SUPPORTED_MODELS;

export const DEFAULT_MODEL: SupportedModelId = 'gemini-3.5-flash-lite';

// Shown one at a time under the "Waiting for model response..." indicator.
export const GENERAL_TIPS = [
  'Using a local Ollama model keeps your prompts and context on your device.',
  'Gemini models can watch and summarize YouTube videos.',
  'Pasting a response into a Google Doc? Use Edit > Paste from Markdown in Google Docs to keep the formatting.',
  'Click the eye icon to control whether your current tab is shared with the model.',
  `Pin up to ${MAX_PINNED_TABS} tabs to use as context for the model.`,
  'The more tabs you pin, the more tokens are used.',
  'Longer chats use more tokens. Start a new chat to start fresh.',
  `Like this extension? <a href="${process.env.STORE_URL}" target="_blank" rel="noopener">Share it</a> with a friend.`,
];

export const OLLAMA_TIPS = [
  'Browse ollama.com/library to find popular local models.',
  "You can raise or lower the model's context window in Ollama's Advanced Settings, depending on your hardware.",
  'The first response from a newly loaded Ollama model takes longer. Configure how long it stays loaded in Advanced Settings.',
];
