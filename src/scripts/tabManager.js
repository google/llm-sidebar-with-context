import { MAX_CONTEXT_LENGTH } from "./constants.js";
import { isRestrictedURL } from "./utils.js";

/**
 * Gets the content of a tab.
 * @param {string} contextTabUrl - The URL of the tab to get content from.
 * @param {number | null} [contextTabId=null] - The optional ID of the tab. If not provided, it will be queried.
 * @returns {Promise<string>} - The content of the tab.
 */
export async function getTabContent(contextTabUrl, contextTabId = null) {
  if (isRestrictedURL(contextTabUrl)) {
    console.warn(
      `Cannot extract content from restricted URL: ${contextTabUrl}`
    );
    return `(Content not accessible for restricted URL: ${contextTabUrl})`;
  }

  // If no tab ID is provided, query for it.
  let tabId = contextTabId;
  if (!tabId) {
    const tabs = await chrome.tabs.query({
      url: contextTabUrl,
      status: "complete",
    });

    if (tabs.length === 0) {
      console.warn(`Tab not found or accessible: ${contextTabUrl}`);
      return `(Tab not found or accessible: ${contextTabUrl})`;
    }

    tabId = tabs[0].id;
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: () => document.body.innerText,
    });
    return result.result ? result.result.substring(0, MAX_CONTEXT_LENGTH) : "";
  } catch (error) {
    console.error(`Failed to execute script for tab ${contextTabUrl}:`, error);
    return `(Could not extract content from ${contextTabUrl}: ${error.message})`;
  }
}
