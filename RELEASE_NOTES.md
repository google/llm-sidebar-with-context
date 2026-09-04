# v1.7.1

## Improvements

**Direct Review Link:** The rotating tip recommending leaving a review on the Chrome Web Store now links directly to the extension's reviews page.

## Maintenance

**Dependency Updates:** Updated `@humanfs/node` to `0.16.8` to resolve a moderate security vulnerability.

**Full Changelog**: https://github.com/google/llm-sidebar-with-context/compare/v1.7.0...v1.7.1

# v1.7.0

## Features

**OpenRouter Integration:** You can now connect to [OpenRouter](https://openrouter.ai) alongside Google Gemini and Ollama, bringing dozens of leading models directly into the sidebar:

- **Top 5 Free Models (Auto-Updated):** Out-of-the-box support for OpenRouter's free router (`openrouter/free`) plus the top 5 weekly most popular free models (such as Llama 3.3 70B, DeepSeek R1, and Qwen), kept fresh automatically.
- **Custom Model Catalog:** Switch to custom mode to search through hundreds of models in OpenRouter's catalog with autocomplete and curate your own preferred model lineup.
- **Balance & Key Verification:** Built-in key verification and real-time credit balance / free-tier status display in the settings panel.

**Adaptive Context Budgeting:** Per-tab character limits are now calculated dynamically per model based on each model's actual context window (from 32k up to 1M+ tokens), allocating optimal context per tab while preventing context window exhaustion.

**Streamlined Provider Selection:** The provider dropdown in the sidebar toolbar now dynamically displays an "Add Provider…" shortcut whenever fewer than 3 providers are enabled, making it effortless to discover and configure additional engines.

**New Rotating Tips:** Added new rotating tips to the thinking indicator highlighting OpenRouter's free model offerings and Chrome Web Store reviews.

## Under the Hood

- **Extensible Provider Abstraction:** Implemented OpenRouter under the modular `IChatProvider` pattern with decoupled background message dispatching and API services.
- **Upstream Provider Error Parsing:** OpenRouter error handling extracts nested upstream provider payloads (e.g., DeepInfra, Together, Lepton), surfacing descriptive, human-readable error messages instead of generic failures.
- **Two-Tier Storage Strategy:** Large model catalogs and autocomplete lists are cached in local storage for speed and quota safety, while credentials and preferences stay synchronized across devices via sync storage.

**Full Changelog**: https://github.com/google/llm-sidebar-with-context/compare/v1.6.0...v1.7.0

# v1.6.0

## Features

**New Gemini Models:** Added `gemini-3.8-flash` to the model picker.

**Full Changelog**: https://github.com/google/llm-sidebar-with-context/compare/v1.5.0...v1.6.0

# v1.5.0

## Features

**New Gemini Models:** Added `gemini-3.7-flash` to the model picker.
**Model Lineup Cleanup:** Retired `gemini-3.5-flash` from the supported list.

## Maintenance

**Updated npm packahes:** To address vulnerabilities

**Full Changelog**: https://github.com/google/llm-sidebar-with-context/compare/v1.4.0...v1.5.0

# v1.4.0

## Features

**New Gemini Models:** Added `gemini-3.6-flash` and `gemini-3.5-flash-lite` to the model picker. The new default is **Gemini 3.5 Flash Lite**, which pairs the latest generation's quality with the low latency and cost the sidebar's per-tab context workload benefits from most.

**Model Lineup Cleanup:** Retired `gemini-2.5-flash` from the supported list. Existing users still on it are migrated to the new default automatically on startup by the model validation added in v1.1.0 — no action needed.

## Bug Fixes

**Correct Tab Context Across Windows:** Switching focus back to another Chrome window fires no tab event when that window's active tab hasn't changed, so the sidebar kept showing context from whichever window last activated a tab. The background script now also listens for window focus changes and rebroadcasts the current tab, keeping the pinned context in sync with the window you're actually looking at.

**Full Changelog**: https://github.com/google/llm-sidebar-with-context/compare/v1.3.0...v1.4.0

# v1.3.0

## Features

**Local LLM Support via Ollama:** You can now run the sidebar entirely against a local [Ollama](https://ollama.com) instance alongside Gemini. Point the extension at your local server to keep every request — including page context — on your own machine, with no API key needed and no data leaving your device.

**Rotating Tips:** The thinking indicator now cycles through helpful tips while the model works, surfacing features and shortcuts you might otherwise miss during the wait.

## Bug Fixes

**Cleaner Context Extraction:** `<source>` elements are now stripped from the document before extraction, removing another class of non-content noise from the context sent to the model and further reducing token count.

## Under the Hood

- **Per-Runtime TypeScript Config:** Split `tsconfig` per runtime so browser code can no longer reference Node globals, tightening type safety across the extension and background boundary.

## Permissions

`declarativeNetRequestWithHostAccess` permission was added to grant the header-rewriting capability for the Ollama integration.

**Full Changelog**: https://github.com/google/llm-sidebar-with-context/compare/v1.2.0...v1.3.0

# v1.2.0

## Features

**Dedicated Settings View:** The settings panel has been redesigned as a full settings view, giving API key configuration, model selection, and theme a cleaner, more accessible home.

**Sandwich Truncation for Context:** When a tab's content exceeds the context limit, the extension now preserves both the beginning and end of the document (rather than cutting cleanly at the limit), so the model retains structural context from both ends.

**Updated Models:** Promoted `gemini-3.1-flash-lite` and `gemini-3.5-flash` from preview to stable. The new default model is `gemini-3.1-flash-lite`.

**Full Changelog**: https://github.com/google/llm-sidebar-with-context/compare/v1.1.0...v1.2.0

## Features

- **High-Quality Context Extraction:** Improved Markdown extraction with advanced noise removal (ads, footers, etc.) and specialized parsing logic for Google Docs. Designed to reduce token count in shared context.
- **New Default Model:** Upgraded the default model to `gemini-3.1-flash-lite-preview` for faster and more efficient responses.
- **Automatic Connection Recovery:** The side panel now detects when the extension has been updated and automatically reloads to ensure a seamless connection to the background script.
- **Theming:** Added support for Light and Dark modes with automatic system-default detection and user preference persistence.
- **UI Improvements:**
  - **Live Timer:** Added a real-time response timer and final duration display for AI interactions.
  - **Copy to Clipboard:** Added a dedicated copy button for AI responses in Markdown.
  - **Visual Tab Context:** Now displays favicons for both the current tab and all pinned contexts.

## Bug Fixes

- **Pre-commit Integrity:** Updated Husky hooks to ensure code formatting errors correctly block commits.

## Testing & Stability

- Improved unit and integration test suites, achieving higher coverage.
- Proactive model validation on startup to automatically migrate users from obsolete models to the new default version.

**Full Changelog**: https://github.com/google/llm-sidebar-with-context/compare/v1.0.0...v1.1.0

# Release Notes - LLM Sidebar with Context v1.0.0

We are excited to announce the first release of **LLM Sidebar with Context**! This Chrome Extension brings the power of Google's Gemini models directly into your browser side panel, allowing you to chat with AI using your active tabs as context.

## Key Features

### Context-Aware Chat

- **Pin Tabs:** Pin up to **6 tabs** to use their content as context for your conversations.
- **Dynamic Context:** Toggle "Share Current Tab" to automatically include the content of the tab you are currently viewing.
- **Smart Extraction:** The extension intelligently extracts content based on the page type:
  - **YouTube:** Summarize or ask questions about video content.
  - **Google Docs:** Extract text directly from open documents.
  - **Web Pages:** Read and analyze standard web page text.

### Privacy & Security

- **Frontend Only:** Runs entirely in your browser with **no middle-man server**. Your prompts are sent directly to the Google Gemini API.
- **Local Storage:** Your API Key and chat history are stored locally in your browser (`chrome.storage`), ensuring your data remains private.

### Model Flexibility

Choose the Gemini model that best fits your needs:

- **Gemini 2.5 Flash Lite** (Default - Fast & Efficient)
- **Gemini 2.5 Flash**
- **Gemini 2.5 Pro**
- **Gemini 3 Flash** (Preview)

### User Experience

- **Markdown Support:** Responses are rendered with full Markdown formatting for easy reading.
- **Session Persistence:** Chat history is saved locally so you can pick up where you left off (until you clear it).
- **Clean UI:** A modern, sidebar-based interface that integrates seamlessly with your browsing experience.

## Technical Highlights

- **Manifest V3:** Built on the latest Chrome Extension platform for better security and performance.
- **Pure TypeScript:** A robust and type-safe codebase.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/google/llm-sidebar-with-context.git
    cd llm-sidebar-with-context
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Build the extension:**
    ```bash
    npm run build
    ```
4.  **Load into Chrome:**
    - Go to `chrome://extensions`
    - Enable "Developer mode"
    - Click "Load unpacked" and select the `dist` folder.

---

**Disclaimer:** This project is not an official Google project. It is not supported by Google and Google specifically disclaims all warranties as to its quality, merchantability, or fitness for a particular purpose.
