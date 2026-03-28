# UI Redesign Planning Document

## For: Design & PM Team | LLM Sidebar with Infinite Context

---

## Context

We're redesigning the UI for our Chrome extension **and** its native desktop overlay companion. The extension is an AI chat sidebar that reads web pages, remembers conversations, and talks to multiple LLM providers. The native companion is a Rust daemon that renders an always-on-top HUD window outside the browser.

Both surfaces must share the same design language. This document covers: (A) what data and capabilities we already have, (B) the design system we're adopting, (C) what competitors show in their UIs, and (D) a recommended set of pages/views for the redesign across both surfaces.

---

# PART A: The Design System — "Kinetic Grid"

The redesign adopts the **Kinetic Grid** design system, an editorial interpretation of Swiss Design / Metro philosophy. This is the single source of truth for both the Chrome sidebar and the native overlay.

## Core Principles (Non-Negotiable)

| Rule | What it means |
|------|--------------|
| **No rounded corners** | `border-radius: 0` everywhere. Sharp corners only. |
| **No borders for layout** | Sections are divided by color-block juxtaposition, not 1px lines. |
| **No shadows or gradients** | Depth via tonal stacking (darker/lighter surface colors), never drop-shadow or blur. |
| **No centering** | Left-aligned typography. Centered text is "too soft." |
| **Scale extremes** | Massive display headlines against dense micro-copy grids create editorial tension. |

## Color Palette

**Foundation**: Deep charcoal `#0e0e0e` (surface base)

| Token | Hex | Use |
|-------|-----|-----|
| `surface` | `#0e0e0e` | Base background |
| `surface_container_low` | `#131313` | Section backgrounds, sidebar |
| `surface_container` | `#191a1a` | Nested containers |
| `surface_bright` | `#2c2c2c` | Active/interactive elements |
| `on_surface` | `#ffffff` | Primary text |
| `on_surface_variant` | `#adaaaa` | Body text, secondary info |
| `outline_variant` | `#484848` | Ghost borders at 20% opacity (last resort) |
| `primary` (Cobalt) | `#78b4fe` | System actions, primary nav |
| `on_primary` | `#00325b` | Text on cobalt backgrounds |
| `secondary` (Emerald) | `#006e00` | Success states, growth data |
| `tertiary` (Crimson) | `#9f0519` | Alerts, high-priority |
| Mango / Violet | (accent) | Category tags, Live Tile differentiators |

## Typography

Font: **Inter** (Google Fonts). Hierarchy designed for scan-ability.

| Scale | Use | Style |
|-------|-----|-------|
| `display-lg` / `display-md` | Hero tiles, section headers | Tight letter-spacing (-0.02em), blocky |
| `headline-sm` | Live Tile titles | **UPPERCASE** inside color blocks |
| `body-md` / `body-lg` | Long-form data | `on_surface_variant` (#adaaaa) |
| `label-sm` | Metadata | High-contrast white despite small size |

## Components

### Live Tiles (Core Primitive)
- 0px border-radius, `spacing-5` (1.1rem) internal padding
- Organized in CSS Grid with col-span for editorial rhythm
- Color-coded by function (cobalt = system, emerald = success, crimson = alert)

### Buttons
- Primary: solid `primary` bg, `on_primary` text, 0px radius
- Hover: color inversion (text ↔ background swap), no shadows

### Input Fields
- Bottom-only ghost border (`outline` #767575)
- Focus: 2px solid `primary` line
- Error: entire bg shifts to `error_container` (#9f0519)

### Lists & Navigation
- No divider lines — use `spacing-2` (0.4rem) gaps with `surface` showing through
- Active item: 4px solid vertical accent bar on left edge

## Design System Reference Screens

The following mockups ship in `design-system/stitch_metro_memory_panel/`:

| Screen | What it demonstrates |
|--------|---------------------|
| `metro_memory_panel_updated` | System overview with Live Tile grid (7 modules), system health bars, recent activity log |
| `metro_context_v3` / `v3_refined` | Full desktop layout: left sidebar nav + Live Tile banner (7 modules) + architecture overview + node activity + data visualization |
| `metro_context_v2` | Grid of module tiles with live activity log, uptime/latency stats |
| `metro_sidepanel_320px_high_density` | 320px sidebar: massive "ARCHITECTURE" headline, synapse stream visualization, processing velocity tile, right-rail Live Tile stack with real-time stats (812 tokens, 99.2% recall, 45ms latency) |
| `metro_sidepanel_320px_list_view` | 320px sidebar: "CORE INTERFACE" hero, real-time telemetry, right-rail module list with progress bars |
| `metro_sidepanel_320px_data_vis` | 320px sidebar: "ARCHITECTING COGNITION" hero, context layer bar chart, logs/status footer |
| `short_term_context_detail` | Module detail: live context buffer stream (chat-style), token counter (812), attention heatmap grid, buffer health indicator |
| `long_term_memory_detail` | Module detail: memory fact cards with importance weights, knowledge graph visualizer, add-memory form, query speed/entropy stats |
| `retriever_ranker_detail` | Module detail: candidate recall stream with confidence scores, retuning sliders (semantic density, temporal weight, recency bias), precision map, live heartbeat stats |
| `consolidator_detail` | Module detail: raw text inflow vs semantic anchor output, compression ratio (84%), process ID, engine temp, uptime, recovery index |
| `forgetting_policy_detail` | Module detail: decay speed slider, stale memories list with whitelist/protect actions, digital decay visualization grid, entropy warning |
| `prompt_assembler_detail` | Module detail: assembly toggles (dynamic pruning, context window, temporal weighting, safety wrappers), live construction canvas showing injected assets, token monitor donut chart, estimated cost |

---

# PART B: What We Have Today

## B1. Data We Collect & Store

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

## B2. Capabilities We Have

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

## B3. Current UI Surfaces

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

## B4. Native Overlay Companion (Current State)

The native companion is a Rust daemon (`native/overlay-companion/`) that renders an always-on-top HUD window on desktop. Today it is a **placeholder** — here's what exists:

### Architecture
```
Chrome Extension
    ↓ (native messaging: 4-byte LE + JSON over stdin/stdout)
llm-sidebar-host (native/host/) — stdio bridge process
    ↓ (JSON-RPC over local IPC socket)
overlay-companion daemon (native/overlay-companion/) — long-lived process
    → spawns overlay window in separate thread
```

### Current Window
- **Size**: 900 x 120 px (hardcoded)
- **Style**: Borderless, transparent, always-on-top, skip taskbar
- **Rendering**: `winit` + `softbuffer` (CPU pixel buffer — no GPU, no webview, no UI framework)
- **Content**: Colored rectangles only — dark slate bands top/bottom, dark navy center, blue accent square. No text, no widgets, no interactivity.

### RPC Methods Available
| Method | What it does |
|--------|-------------|
| `hello` | Handshake: exchange session IDs, report capabilities |
| `ping` | Heartbeat (22s interval) — returns `pong` + timestamp |
| `status` | Report service status, overlay status, platform, features |

### Supported Features (reported to extension)
`native-messaging`, `json-rpc`, `ipc`, `self-bootstrap`, `boot-assets`, `overlay` (mac/win), `always-on-top` (mac/win), `click-through` (mac/win)

### Platform Support
- **macOS**: Full overlay support (no shadow, no fullscreen)
- **Windows**: Full overlay support (skip taskbar)
- **Linux**: Overlay marked as "unsupported" — daemon runs but no window

### What's Missing
- No real UI rendering (just colored pixels)
- No text rendering capability (would need a font rasterizer or switch to egui/iced/webview)
- No data display from the extension (RPC only does hello/ping/status)
- No Kinetic Grid design system applied
- No new RPC methods to push memory/context/chat data to the overlay

---

# PART C: Competitive Analysis

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

# PART D: Recommended Pages & Information Architecture

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

## Design System Mapping to Proposed Pages

Each page maps to Kinetic Grid reference screens from the design system zip:

| Page | Primary Reference Screen | Key Kinetic Grid Patterns |
|------|-------------------------|--------------------------|
| Chat | `metro_sidepanel_320px_list_view` | Hero headline for status ("CORE INTERFACE"), right-rail module list with progress bars, dark surface base |
| Memory Explorer | `long_term_memory_detail` + `retriever_ranker_detail` | Fact cards as Live Tiles, keyword tags in colored blocks, graph visualizer, importance sliders |
| Context Dashboard | `metro_sidepanel_320px_data_vis` + `metro_context_v2` | Context layer bar chart, module tiles grid, live activity log |
| Settings | `forgetting_policy_detail` + `prompt_assembler_detail` | Toggle switches for policies, slider controls, parameter panels |
| Conversations | `short_term_context_detail` | Live buffer stream (chat-style list), token counter, attention heatmap for session selection |
| System Overview | `metro_memory_panel_updated` + `metro_sidepanel_320px_high_density` | Live Tile grid (7 modules), system health bars, processing velocity, synapse stream |

---

## Navigation Model (Chrome Sidebar — 320px)

```
┌──────────────────────────────────┐
│  MEMORY_OS          [icons] [gear]│  ← surface_container_low (#131313)
├──────────────────────────────────┤
│  ⚡ SHORT-TERM CONTEXT           │  ← Left nav, active = 4px
│  ≋ LONG-TERM MEMORY             │    cobalt accent bar
│  ⇌ RETRIEVER + RANKER           │
│  ✦ CONSOLIDATOR                 │  ← on_surface_variant text
│  ⌧ FORGETTING POLICY            │    uppercase labels
│  ∧ PROMPT ASSEMBLER             │
│  ✦ SYSTEM SETTINGS              │
├──────────────────────────────────┤
│                                  │
│    Active page content           │  ← surface (#0e0e0e)
│    (Kinetic Grid layout)         │
│                                  │
└──────────────────────────────────┘
```

Sidebar width: **320px** (matching the design system's sidepanel mockups, not the current 420px). Left nav uses the same pattern as the design system: icon + uppercase label, 4px accent bar on active item, `surface_container_low` background.

---

## Native Overlay — Redesign Scope

The native overlay companion (`native/overlay-companion/`) must adopt the Kinetic Grid design system and become a real information surface. This is a significant upgrade from the current placeholder.

### Technical Decision Required

The overlay currently uses `winit + softbuffer` (raw pixel buffer). To render Kinetic Grid UI with text, Live Tiles, and data visualizations, we need a real rendering approach. Options:

| Option | Pros | Cons |
|--------|------|------|
| **egui** (immediate-mode GUI) | Pure Rust, fast, easy theming, text rendering built in | Immediate mode = redraws every frame, round-corner defaults need overriding |
| **iced** (Elm-style GUI) | Pure Rust, declarative, good for data dashboards | Heavier, steeper learning curve |
| **webview (wry/tao)** | Can reuse exact HTML/CSS from design system mockups | Adds browser engine dependency, heavier binary |
| **cosmic-text + tiny-skia** | Lightweight, full control | Lots of manual work for layout |

**Recommendation for designer/PM**: `egui` is the best fit — it's lightweight, Rust-native, and can be themed to match Kinetic Grid (0px radius, flat colors, tonal stacking). The design system's HTML/CSS mockups serve as the spec; egui implements the same visual language natively.

### Overlay Views

The overlay HUD should support multiple modes, controlled by the extension via new RPC methods:

#### Mode 1: Compact HUD (default — 900x120px)
```
┌─────────────────────────────────────────────────┐
│ MEMORY_OS     42/160 ████████░░  GEMINI_2.5_FL  │  ← status bar
│ ⚡ 812 TOKENS  ≋ 99.2% RECALL  ⌧ 45ms LATENCY  │  ← Live Tile strip
└─────────────────────────────────────────────────┘
```
- Always-on-top strip showing real-time memory system health
- Data: episode count, retrieval accuracy, latency, model name
- Kinetic Grid: `surface` bg, Live Tile color blocks for each metric

#### Mode 2: Expanded Dashboard (900x600px, toggled by user)
```
┌─────────────────────────────────────────────────┐
│ MEMORY_OS                              EXPANDED │
├──────────┬──────────────────────────────────────┤
│ CONTEXT  │  ┌────────┬────────┬────────┐       │
│ MEMORY   │  │ SHORT  │ LONG   │ RETRVR │       │
│ RETRIEVER│  │ TERM   │ TERM   │ RANKER │       │
│ ASSEMBLY │  │ 812tok │ 99.2%  │ 45ms   │       │
│          │  ├────────┴────────┴────────┤       │
│          │  │ RECENT ACTIVITY LOG       │       │
│          │  │ 09:42:11 VECTOR_EMBED...  │       │
│          │  │ 09:41:08 CONSOLIDATION... │       │
│          │  │ 09:40:55 CACHE_PURGE...   │       │
│          │  └──────────────────────────┘       │
└──────────┴──────────────────────────────────────┘
```
- Full Kinetic Grid dashboard matching `metro_memory_panel_updated` mockup
- Live Tile grid of all 7 modules with real-time stats
- Activity log stream
- System health bars

#### Mode 3: Detail View (900x600px, drilled into one module)
- Matches the module detail screens (e.g., `retriever_ranker_detail`, `forgetting_policy_detail`)
- Shows tuning controls, candidate streams, visualizations
- Controlled by clicking a module tile in expanded mode

### New RPC Methods Needed

To push data from the extension to the overlay, we need new RPC methods:

| Method | Payload | Purpose |
|--------|---------|---------|
| `update_memory_stats` | episode count, budget ratio, last compaction time | Feed the memory gauge |
| `update_retrieval` | query keywords, retrieved episodes with scores, candidate count | Feed retriever/ranker detail |
| `update_context` | active tabs, pinned tabs, tier assignments, total budget used | Feed context dashboard |
| `update_chat_event` | latest message role + snippet, token count | Feed short-term context stream |
| `set_overlay_mode` | `compact` / `expanded` / `detail:{module}` | Switch between HUD modes |
| `update_system_health` | latency, recall %, tokens active, compaction ratio | Feed system health tiles |

### Overlay Styling Rules (Kinetic Grid applied to native)

All the same rules apply natively:
- 0px corner radius on all rectangles
- Tonal stacking for depth (surface → surface_container_low → surface_container)
- No shadows or blur effects
- Live Tiles as solid color blocks (cobalt, emerald, crimson, mango, violet)
- Inter font (bundled with the binary or loaded from system)
- Uppercase `headline-sm` inside colored tiles
- Left-aligned typography throughout
- 4px accent bar for active navigation items

---

## Summary: All Surfaces

| Surface | Platform | Status | Effort | Design System Screen |
|---------|----------|--------|--------|---------------------|
| Chat (sidebar) | Chrome ext | Enhance existing | Small | `sidepanel_320px_list_view` |
| Memory Explorer | Chrome ext | **New page** | Medium | `long_term_memory_detail` |
| Context Dashboard | Chrome ext | **New page** | Medium | `sidepanel_320px_data_vis` |
| Settings | Chrome ext | Expand from panel | Small | `forgetting_policy_detail` |
| Conversations | Chrome ext | **New page** + new data model | Large | `short_term_context_detail` |
| Welcome/Onboarding | Chrome ext | Refresh visuals | Small | Kinetic Grid colors + type |
| Navigation (left rail) | Chrome ext | **New component** | Small | `metro_context_v3` left nav |
| Compact HUD | Native overlay | **New** (replace placeholder) | Large | `sidepanel_320px_high_density` (strip) |
| Expanded Dashboard | Native overlay | **New** | Large | `metro_memory_panel_updated` |
| Module Detail Views (7) | Native overlay | **New** | X-Large | Individual detail screens |
| Rendering engine upgrade | Native overlay | **New** (egui or alternative) | Large | N/A (infrastructure) |
| New RPC methods (6) | Extension + Native | **New** | Medium | N/A (data plumbing) |
