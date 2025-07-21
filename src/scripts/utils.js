import { RestrictedURLs } from "./constants.js";

/**
 * Checks if a URL is restricted.
 * @param {string} url - The URL to check.
 * @returns {boolean} - True if the URL is restricted, false otherwise.
 */
export function isRestrictedURL(url) {
  return RestrictedURLs.some((prefix) => url.startsWith(prefix));
}
