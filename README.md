# LLM Sidebar with Context

This Chrome Extension allows you to interact with Gemini models in a sidebar, using multiple browser tabs as context for your conversations.

## 📦 Installation

<a href="https://chromewebstore.google.com/detail/llm-sidebar-with-context/hecgmgkofmopdcjlbaegcaanaadhomhb">
  <img src="./assets/promotional_images/chrome_web_store_badge.png" width="206" alt="Available in the Chrome Web Store">
</a>

## 🎬 Usage Examples

<div align="center">
  <img src="./assets/promotional_images/promotional_images_slideshow.webp" width="800" alt="LLM Sidebar Demo Slideshow">
</div>

## 🚀 Features

- **Frontend Only:** This extension runs entirely in your browser. There is no middle-man server; your prompts are sent directly from your browser to the Google Gemini API.
- **Infinite Context:** Pin unlimited tabs as context. An adaptive budget manager automatically summarizes or compresses overflow content to fit Gemini's context window, prioritizing passages relevant to your latest prompt before falling back to metadata-only context.
- **Multimodal Support:**
  - **YouTube:** Summarize or answer questions about YouTube videos.
  - **Google Docs:** Extracts content directly from open Google Docs.
  - **Web Pages:** Extracts text content from standard web pages.
- **Current Tab Sharing:** Toggle "Share Current Tab" (Eye icon) to dynamically include the active tab's content in your context as you browse.
- **Model Selection:** Choose between various Gemini models:
  - Gemini 2.5 Flash Lite (Default)
  - Gemini 2.5 Flash
  - Gemini 2.5 Pro
  - Gemini 3 Flash (Preview)
- **Privacy Focused:**
  - Your API Key is stored locally in your browser (`chrome.storage.sync`).
  - Chat history is stored locally (`chrome.storage.local`).
- **Markdown Support:** Responses are rendered with full Markdown support.

## 🛠️ Build Manually (Development)

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

    _Note: This generates a `dist/` directory._

4.  **Load into Chrome:**
    1.  Open Chrome and navigate to `chrome://extensions`.
    2.  Enable **Developer mode** (toggle in the top right).
    3.  Click **Load unpacked**.
    4.  Select the `dist` folder created in step 3.

## ⚙️ Configuration

1.  **Get a Gemini API Key:**
    - Visit [Google AI Studio](https://aistudio.google.com/).
    - Create a new API key.

2.  **Setup the Extension:**
    - Click the extension icon <img src="assets/svg-icons/llm-sidebar-logo_16.svg" width="16" alt="Extension Icon"/> in your browser toolbar to open the sidebar.
    - Click the **Settings** button in the bottom panel.
    - Enter your API Key.
    - (Optional) Select your preferred Model.

## 🛠️ Usage

1.  **Open Sidebar:** Click the extension icon <img src="assets/svg-icons/llm-sidebar-logo_16.svg" width="16" alt="Extension Icon"/> in your browser toolbar.
2.  **Pin Context:**
    - Navigate to a page you want to discuss.
    - Click the **Pin** icon next to the "Current Tab" to add it to your pinned context.
    - You can pin unlimited tabs. Content is automatically managed to fit the model's context window.
3.  **Chat:** Type your prompt. The extension will send your message along with the content of all pinned tabs to Gemini.
4.  **Manage Context:**
    - Toggle the **Eye** icon on the "Current Tab" to automatically include whichever tab you are looking at.
    - Click the **Trash** icon to clear a pinned tab.

## 💻 Development

### Prerequisites

- Node.js (v20+)
- npm

### Commands

| Command              | Description                     |
| :------------------- | :------------------------------ |
| `npm run build`      | Builds the extension to `dist/` |
| `npm test`           | Runs unit tests with Vitest     |
| `npm run lint`       | Runs ESLint                     |
| `npm run format`     | Formats code with Prettier      |
| `npm run type-check` | Runs TypeScript type checking   |
| `npm run test:native-companion` | Runs the Puppeteer/native companion harness |

### Native companion foundation

This repository now includes a Rust-based native companion foundation under `native/overlay-companion/` plus a Puppeteer harness under `test-harness/native-companion/`.

The native companion is designed around a durable daemon + native-messaging bridge split so the long-lived process can tolerate Chrome MV3 service-worker restarts and reconnect cleanly using JSON-RPC `hello`, `ping`, and `status` messages.

The harness builds the extension, builds the Rust binary, registers native messaging manifests in an isolated browser home, launches Chrome headless with the unpacked extension, and waits for the extension to report a connected native companion session.

### Environment Variables

To populate legal links in the Settings panel, create a `.env` file in the root:

```env
LEGAL_NOTICE_URL="https://example.com/legal"
PRIVACY_POLICY_URL="https://example.com/privacy"
LICENSE_URL="https://example.com/license"
```

## 🤝 Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for details.

## 📄 Disclaimer

This project is not an official Google project. It is not supported by Google and Google specifically disclaims all warranties as to its quality, merchantability, or fitness for a particular purpose.

## 📄 License

Apache 2.0; see [`LICENSE`](LICENSE) for details.
