# UI Redesign Planning Document

## For: Design & PM Team | LLM Sidebar with Infinite Context

---

## Context

We're redesigning the UI for our Chrome extension — an AI chat sidebar that reads web pages, remembers conversations, and talks to multiple LLM providers. The current UI is a single sidebar panel with everything crammed in. This document covers: (A) what data and capabilities we already have, (B) what competitors show in their UIs, and (C) a recommended set of pages/views for the redesign.

---

# PART A: What We Have Today

## A1. Data We Collect & Store

| Data | What it is | Where it lives |
|------|-----------|----------------|
| **Chat messages** | Every user message + AI reply (role + text) | chrome.storage.local |
| **Memory episodes** | Auto-created summaries of each conversation turn (max 160) | chrome.storage.local |
| **Summary episodes** | Compressed batches of older turns (24 turns → 1 summary) | chrome.storage.local |
| **Keywords per episode** | Up to 16 auto-extracted keywords per memory | In-memory index + storage |
| **Memory scores** | Relevance score per episode (keyword overlap + recency + utility + kind) | Computed at query time |
| **Retrieval snapshots** | Which memories were pulled for each query, scores, budget usage | Returned with each LLM response |
| **Active tab content** | Full page text converted to Markdown (up to 250K chars) | Extracted on demand |
| **Pinned tab content** | Same as above, for up to 6 user-pinned tabs | Extracted on demand |
| **Tab metadata** | Title, URL, favicon, open/closed status | chrome.storage.local |
| **API key** | User's LLM provider key | chrome.storage.sync |
| **Model selection** | Which LLM model the user chose | chrome.storage.sync |
| **Telemetry stats** | Retrieval counts, compaction counts, avg scores, budget usage ratios | In-memory per session |
| **Native companion state** | Connection status, session IDs, ping/pong timing, diagnostics | chrome.storage.local |

## A2. Capabilities We Have

### LLM Providers (4 backends)
| Provider | Model | Needs API Key? |
|----------|-------|---------------|
| Google Gemini | gemini-2.5-flash-lite (default), flash, pro, 3-flash | Yes |
| Anthropic Claude | claude-sonnet-4-6 | Yes |
| OpenAI | gpt-4o | Yes |
| Gemini Nano | On-device, Chrome 131+ | No |

### Memory System
- **Auto-record**: Every conversation turn becomes a memory episode
- **Keyword extraction**: Stopword filtering, frequency ranking, min 3-char words
- **Retrieval**: Score = keyword overlap + recency + utility + kind boost (threshold: 0.55)
- **Diversity filter**: Jaccard similarity >= 0.8 suppressed
- **Neighbor expansion**: Related episodes pulled in (limit 3)
- **Compaction**: When episodes > 160, oldest 24 turns merge into 1 summary
- **Forgetting**: Retention/expiration policies drop low-value episodes
- **Budget**: 12,000 chars allocated to memory in prompts

### Web Content Extraction
- **Generic pages**: HTML → clean DOM → Markdown (via Turndown)
- **YouTube**: Captions + metadata
- **Google Docs**: Document content via API
- **Noise removal**: Strips nav, footer, script, style, ads, cookie banners
- **Summarization**: LLM-generated ~5K char summaries when content exceeds budget

### Context Budget System (900K char total)
- **Tier 1 (Full)**: All tabs fit? Use raw content
- **Tier 2 (Summarized)**: Overflow? LLM-summarize each tab to ~5K chars
- **Tier 3 (Metadata)**: Still over? Title + URL only
- Minimum 2K chars per tab

### Native Companion (Optional Rust daemon)
- Survives Chrome service worker restarts
- Native overlay rendering on desktop
- JSON-RPC: hello, ping, status
- Auto-reconnect with backoff

## A3. Current UI Surfaces

**Only 1 real screen today: the Sidebar Panel**, containing:
1. Status bar (green dot + model name + memory count)
2. Collapsible memory panel (episode list + canvas grid visualization + budget bar)
3. Chat message area (markdown rendered)
4. Settings panel (API key input, legal links)
5. Pinned tabs bar (favicons, open/closed indicators, reopen button)
6. Controls row (model dropdown, AgentDrop button, New Chat, Settings toggle)
7. Input textarea (auto-expand, Enter to send, Shift+Enter for newline)

**Other pages** (minimal):
- `welcome.html` — onboarding (3 setup steps, keyboard shortcut, feature cards)
- `website.html` — marketing mockup of sidebar

---

# PART B: Competitive Analysis

## Category 1: Web Applications (Agent Memory)

### 1. Mem0 — 51,300 stars | Active (commits Mar 27, 2026)
**github.com/mem0ai/mem0**

| UI Surface | What it shows |
|-----------|--------------|
| **Dashboard** (localhost:3000) | Overview of total memories, connected apps, recent activity |
| **Memories page** | Browse, search, add, delete memories; filter by type (long-term, short-term, semantic, episodic) |
| **Apps page** | Connected MCP clients with connection status |
| **Cloud platform** (app.mem0.ai) | API key management, project management, usage analytics |
| **Chrome extension** | Passive memory capture across ChatGPT, Perplexity, Claude |

**Key design patterns**: Memory has 4 types (long-term, short-term, semantic, episodic). Memories are scoped to user / session / agent level. Audit trail shows which app read/wrote each memory. ACL controls who sees what.

**Tech**: Next.js (React), Python backend, Qdrant vector DB

---

### 2. Supermemory — 19,900 stars | Active (commits Mar 27, 2026)
**github.com/supermemoryai/supermemory**

| UI Surface | What it shows |
|-----------|--------------|
| **Web app** (app.supermemory.ai) | Personal memory dashboard — saved content, search, chat |
| **Nova chat** | AI companion that recalls across your entire knowledge space |
| **Knowledge graph** | Visual relationship map between memories |
| **Project manager** | Group memories into tagged project containers |
| **Developer console** (console.supermemory.ai) | API management, analytics, chunking config |
| **Chrome extension** | One-click save of links, chats, PDFs, images, videos |
| **Settings** | Memory extraction preferences, chunking strategy |

**Key design patterns**: Knowledge graph visualization as a first-class feature. Project-based grouping of memories. One-click browser capture. Developer-facing console separate from consumer app.

**Tech**: TypeScript, Cloudflare Workers, Turborepo monorepo

---

### 3. memU — Small but actively developed (commits Mar 23, 2026)
**Newer project, lower stars**

| UI Surface | What it shows |
|-----------|--------------|
| **Memory dashboard** | View and manage stored agent memories |
| **Search** | Keyword/semantic search across memory store |
| **Agent config** | Configure which agents use which memories |

**Key design patterns**: Lightweight, focused purely on memory CRUD. Simpler UI, fewer surfaces.

---

## Category 2: Browser Extensions (Agent Memory)

### 1. Supermemory Extension — 19,900 stars (same repo)
**Part of supermemoryai/supermemory**

| UI Surface | What it shows |
|-----------|--------------|
| **Popup** | Quick-save current page; view recent saves |
| **Sidebar/overlay** | Search saved memories without leaving the page |
| **Context menu** | Right-click to save selected text |
| **Options page** | API key, sync settings, extraction preferences |

**Key design patterns**: Minimal popup, deep integration via context menu. Sidebar for search without tab-switching.

---

### 2. Mem0 Chrome Extension — 665 stars (archived Mar 2026)
**github.com/mem0ai/mem0-chrome-extension**

| UI Surface | What it shows |
|-----------|--------------|
| **Popup panel** | Shows memories relevant to current page |
| **Settings** | API key configuration |
| **Passive capture** | Auto-captures context from ChatGPT, Perplexity, Claude conversations |

**Key design patterns**: Zero-click memory capture (passive). Surface relevant memories contextually based on current page.

---

### 3. Personal AI Memory — 32 stars | Active (commits Mar 24, 2026)
**github.com/marswangyang/personal-ai-memory**

| UI Surface | What it shows |
|-----------|--------------|
| **Sidebar panel** | Chat interface with persistent memory |
| **Memory viewer** | Browse stored conversation memories |
| **Settings** | Local-first configuration, no cloud dependency |

**Key design patterns**: Local-first, privacy-focused. Simple memory viewer alongside chat.

---

## Category 3: Desktop Applications (Agent Memory)

### 1. AnythingLLM — 56,900 stars | Active (commits Mar 27, 2026)
**github.com/Mintplex-Labs/anything-llm**

| UI Surface | What it shows |
|-----------|--------------|
| **Chat interface** | Main conversation view with drag-and-drop file upload, source citations inline |
| **My Documents** | File management panel (upload, organize PDFs/DOCX/TXT into folders) |
| **Workspace settings** | LLM provider picker, embedder config, vector DB selection |
| **Admin panel** | Multi-user access controls, per-user permissions |
| **Agent Builder** | No-code agent creation wizard with skill selection checkboxes |
| **Agent memory** | Persistent `agent-memory.txt` file that carries across conversations |

**Key design patterns**: Workspace isolation (each workspace = separate knowledge base). No-code agent builder. Document management as a first-class panel. Source citations in chat bubbles.

**Tech**: Electron, Vite + React, Node.js Express, LanceDB

---

### 2. Jan — 41,300 stars | Active (commits Mar 27, 2026)
**github.com/janhq/jan**

| UI Surface | What it shows |
|-----------|--------------|
| **Chat view** | ChatGPT-style conversation (threads in left sidebar) |
| **Model hub** | Download/manage LLMs from HuggingFace, toggle local vs cloud |
| **Assistant creator** | Custom assistant personas with system prompts |
| **Settings** | Model parameters (temperature, top-p, context window size), API keys |
| **Local API server** | localhost:1337 OpenAI-compatible endpoint dashboard |
| **Thread sidebar** | Conversation history list, search, organize |

**Key design patterns**: "Auto context management" dynamically adjusts context window to prevent mid-conversation cutoffs. Model download progress in-app. Clear local-vs-cloud toggle. Thread-based organization.

**Tech**: Tauri, TypeScript + Rust, llama.cpp, SQLite

---

### 3. OpenFlux — 207 stars | Active (commits Mar 27, 2026)
**github.com/EDEAI/OpenFlux**

| UI Surface | What it shows |
|-----------|--------------|
| **Chat interface** | Multi-agent routing (picks the right agent per query) |
| **Settings panel** | Memory toggles, vector dimension config, distillation strategy |
| **File preview** | View uploaded documents inline |
| **Model selector** | Switch between providers/models |
| **Browser automation view** | Watch AI control a browser in real-time |

**Key design patterns**: Conversation distillation (auto-summarize and store key knowledge). Memory as an explicit toggle the user controls. Multi-agent with automatic routing. Browser automation as a visible feature.

**Tech**: Tauri v2, TypeScript, SQLite + sqlite-vec

---

# PART C: Recommended Pages & Information Architecture

## What the competitors teach us

| Pattern | Who does it | Should we adopt? |
|---------|------------|-----------------|
| **Dedicated memory browser/viewer** | Mem0, Supermemory, AnythingLLM | Yes — our memory panel is too cramped |
| **Knowledge graph visualization** | Supermemory | Consider — we have keyword relationships |
| **Workspace/project grouping** | Supermemory, AnythingLLM | Later — good for multi-project users |
| **Document/file management panel** | AnythingLLM | Adapt — we have "pinned tabs" which is similar |
| **No-code agent builder** | AnythingLLM | Out of scope for now |
| **Settings as a full page** | All competitors | Yes — our settings are too hidden |
| **Source citations in chat** | AnythingLLM | Yes — we track retrieval snapshots already |
| **Memory type labels** | Mem0 (4 types) | Adapt — we have "turn" vs "summary" |
| **Auto context management indicator** | Jan | Yes — we have budget tiers, should show them |
| **Thread/conversation management** | Jan, AnythingLLM | Yes — we only have "New Chat" today |

## Proposed Pages / Views

### Page 1: Chat (Primary — the sidebar)
**What it shows:**
- Conversation messages with markdown rendering
- **NEW**: Source citations inline (which memories/tabs were used — we already have `ContextRetrievalSnapshot`)
- **NEW**: Context indicator ribbon showing budget usage (Tier 1/2/3 per tab)
- Pinned tabs bar with status
- Current tab toggle (eye icon)
- Input area
- Quick model switcher in status bar

**Data used**: ChatMessage[], ContextRetrievalSnapshot, TabInfo[], model selection

---

### Page 2: Memory Explorer (New dedicated page)
**What it shows:**
- Full-screen memory episode list with search/filter
- Filter by: type (turn vs summary), date range, keyword
- Each episode card shows: summary text, keywords as tags, created date, access count, last accessed, relevance score from last retrieval
- Memory usage gauge (X / 160 episodes, budget bar)
- Compaction history (how many summaries were created, when)
- **Stretch**: Keyword relationship graph (we have the keyword→episode index)

**Data used**: MemoryEpisode[], MemoryState, telemetry stats, keyword index

---

### Page 3: Context Dashboard (New dedicated page)
**What it shows:**
- Active tab + all pinned tabs in a card layout
- Per-tab: title, URL, favicon, content length, current tier (Full / Summarized / Metadata)
- Total budget gauge (X / 900K chars used)
- Pin/unpin controls
- Content preview (first ~200 chars of extracted content)
- **Stretch**: Extraction strategy indicator (generic / YouTube / Google Docs)

**Data used**: TabInfo[], TabContentEntry[], ContextBudgetManager state, content strategy type

---

### Page 4: Settings (Expanded from current panel)
**What it shows:**
- **API Keys section**: Per-provider key inputs (Gemini, Claude, OpenAI) with test/validate button
- **Model selection**: Dropdown with provider grouping
- **Memory settings**: Max episodes slider, compaction threshold, keyword count
- **Context settings**: Budget allocation, summarization toggle, current-tab-auto-include toggle
- **Native companion**: Connection status, diagnostics log, enable/disable toggle
- **About**: Version, legal links, keyboard shortcuts

**Data used**: All StorageKeys (API_KEY, SELECTED_MODEL, etc.), NativeCompanionState, memory constants

---

### Page 5: Conversations (New — thread management)
**What it shows:**
- List of past conversations (we currently only have 1 chat history — this requires storing multiple)
- Each thread: preview of first message, date, message count, memory episodes created
- Search across conversations
- New Chat button, Delete conversation

**Data needed (new)**: Multiple ChatHistory instances, thread metadata

---

### Page 6: Welcome / Onboarding (Existing, refresh)
**What it shows:**
- Step-by-step setup flow (API key → first chat → pin a tab → see memory work)
- Feature highlights with screenshots
- Keyboard shortcut reminder (Ctrl+Shift+S)

---

## Navigation Model

```
┌─────────────────────────────┐
│  Status Bar (always visible) │
│  [model] [memory: 42/160]   │
├─────────────────────────────┤
│  Tab Bar / Nav Icons:        │
│  💬 Chat                     │
│  🧠 Memory                   │
│  📑 Context                  │
│  📋 Conversations            │
│  ⚙️ Settings                 │
├─────────────────────────────┤
│                              │
│    Active page content       │
│                              │
└─────────────────────────────┘
```

The sidebar stays a sidebar (420px wide) — we add a **tab bar or icon nav** at the top to switch between views. This matches what Supermemory and Jan do for their multi-panel layouts.

---

## Summary: What's New vs What Exists

| Surface | Status | Effort |
|---------|--------|--------|
| Chat (sidebar) | Exists — enhance with citations + budget ribbon | Small |
| Memory Explorer | **New page** | Medium |
| Context Dashboard | **New page** | Medium |
| Settings (full page) | Exists as panel — expand to full page | Small |
| Conversations | **New page** + new data model (multi-thread) | Large |
| Welcome/Onboarding | Exists — refresh visuals | Small |
| Navigation (tab bar) | **New component** | Small |
