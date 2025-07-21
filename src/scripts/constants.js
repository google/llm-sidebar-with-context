export const MAX_CONTEXT_LENGTH = 250000;

export const MessageTypes = {
  CHAT_MESSAGE: "chatMessage",
  GET_CONTEXT: "getContext",
  SAVE_API_KEY: "saveApiKey",
  PIN_TAB: "pinTab",
  UNPIN_TAB: "unpinTab",
  CURRENT_TAB_INFO: "currentTabInfo",
  CHECK_PINNED_TABS: "checkPinnedTabs",
  REOPEN_TAB: "reopenTab",
  CLEAR_CHAT: "clearChat",
};

export const StorageKeys = {
  API_KEY: "geminiApiKey",
  PINNED_CONTEXTS: "pinnedContexts",
  SELECTED_MODEL: "selectedModel",
};

export const RestrictedURLs = ["chrome://", "about:", "chrome-extension://"];
