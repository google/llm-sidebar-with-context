/**
 * Agentdrop content script — injected into the active tab.
 *
 * Waits for an AGENTDROP_GO message from the background containing:
 *   • startTime:     coordinated Date.now() value
 *   • screenshotUrl: data-URL of the captured page (for WebGL2 warp)
 *
 * The screenshot is used as a WebGL2 texture; a fragment shader applies
 * radial ripple displacement + all lighting effects in a single GPU pass.
 */

import { runAgentdropAnimation } from './agentdropAnimation';

(() => {
  const win = window as unknown as Record<string, boolean>;
  if (win.__agentdrop_ready) return;
  win.__agentdrop_ready = true;

  chrome.runtime.onMessage.addListener(
    (
      msg: { type: string; startTime?: number; screenshotUrl?: string },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ) => {
      if (msg.type !== 'agentdropGo') return false;
      if (win.__agentdrop_running) {
        sendResponse({ success: false });
        return false;
      }

      win.__agentdrop_running = true;
      sendResponse({ success: true });

      runAgentdropAnimation(msg.screenshotUrl, msg.startTime, 'right').then(
        () => {
          win.__agentdrop_running = false;
        },
      );

      return false;
    },
  );
})();
