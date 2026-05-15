# Galley

> **A local agent team orchestrator, native for both human and agent.**

> *Galley started as a workbench for [GenericAgent](https://github.com/lsdefine/GenericAgent). The first two letters of our name are a quiet bow to where we came from.*

[中文 README](./README.zh.md)

<p align="center">
  <img src="docs/screenshots/screenshot_05.png" alt="Galley main conversation view" width="800" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/wangjc683/galley/releases"><img src="https://img.shields.io/github/v/release/wangjc683/galley?include_prereleases" alt="Latest Release" /></a>
  <a href="https://github.com/wangjc683/galley/releases"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" alt="Platform" /></a>
  <a href="https://github.com/wangjc683/galley/stargazers"><img src="https://img.shields.io/github/stars/wangjc683/galley?style=social" alt="Stars" /></a>
</p>

## What is Galley

Galley is a desktop app for running multiple AI agent sessions in parallel — and, soon, for letting one **Supervisor Agent** drive the whole team remotely.

**Today (v0.1 / v0.2)** Galley is a desktop workbench for [GenericAgent](https://github.com/lsdefine/GenericAgent): you run several agent sessions side-by-side, watch their tool calls in a structured timeline, approve high-risk actions when you want to (or let them rip with YOLO mode), and pick up old sessions where you left off.

**Coming in v0.5** Galley becomes **dual-native**: a Rust `Galley Core` exposes both the existing GUI and a new `Galley CLI`. The CLI lets an external **Supervisor Agent** — running on the same machine as a separate GenericAgent process plugged into IM frontends like WeChat or Lark — orchestrate the entire session team. You text the Supervisor from your phone, it calls `galley` commands locally; back at the desk, every session is right there in the GUI.

Galley is **local-first**. Your data never leaves your machine. Remote access is the Supervisor's responsibility (via IM, SSH, whatever it wants), not Galley's. Delete Galley anytime — GenericAgent keeps working untouched.

## Features

### Today

- 🪟 **Multi-session parallel** — each session runs as an independent GenericAgent subprocess
- 🔧 **Structured tool timeline** — see every tool call, args, result, and timing inline with the conversation
- 🛡️ **Approval system + YOLO mode** — pause for high-risk actions (file_patch, code_run, ...), or trust your agent and skip
- 💾 **Session persistence + restore** — close Galley, come back days later, pick up where you left off
- 📁 **Projects + full-text search** — organize sessions by project; SQLite FTS5 search across all conversations
- 🤖 **Per-session LLM switching** — switch models mid-conversation without losing context

### Coming in v0.5

- 🚧 **Galley CLI** — `galley sessions list / send / new / watch / ...` for Supervisor Agent control
- 🚧 **Background mode** — close the window, keep running in the menubar
- 🚧 **Agent-API public contract** — versioned JSON schema for stable agent integration
- 🚧 **Galley Supervisor SOP** for GenericAgent + **galley-supervisor** Skill for Claude

See the [PRD](./docs/PRD.md) and [refactor playbook](./docs/refactor/) for the full v0.5 plan.

## Screenshots

| | |
|---|---|
| ![](docs/screenshots/screenshot_01.png) | ![](docs/screenshots/screenshot_02.png) |
| ![](docs/screenshots/screenshot_03.png) | ![](docs/screenshots/screenshot_04.png) |

## Architecture

```
              ┌─────────────────┐  ┌─────────────────────────┐
              │  Galley GUI     │  │  Galley CLI 🚧 v0.5     │
              │  (Tauri+React)  │  │  (Rust)                 │
              └────────┬────────┘  └────────┬────────────────┘
                       └────────┬───────────┘
                          localhost only
                       (Unix socket / named pipe)
                                ↓
                       ┌────────────────────────┐
                       │  Galley Core 🚧 v0.5   │
                       │  (Rust)                │
                       │  • Session lifecycle   │
                       │  • SQLite (writes)     │
                       │  • Runner management   │
                       │  • Event broadcast     │
                       └────────┬───────────────┘
                                ↓
                       ┌────────────────────────┐
                       │  Runner (Python)       │
                       │  wraps one GenericAgent│
                       │  subprocess per session│
                       └────────────────────────┘
```

**v0.1 / v0.2 ship today**: only the GUI box is real; logic currently lives in the TypeScript layer. **v0.5 introduces Galley Core in Rust**, which then exposes the CLI box. See the [refactor playbook](./docs/refactor/) for execution detail.

**Tech stack:**

- **Frontend** — Tauri v2 + React 19 + TypeScript 5.8 + Tailwind v4
- **Backend** — Rust (Galley Core, v0.5 in progress) + Python (runner, wraps GenericAgent)
- **Local DB** — SQLite (FTS5 trigram for search)
- **IPC** — JSON Lines over stdio today; Unix socket / named pipe for CLI in v0.5
- **Platform** — macOS + Windows (Linux candidate post-v0.5)

## Installation

### Prerequisites

Galley wraps [GenericAgent](https://github.com/lsdefine/GenericAgent). Install GA first by following [their setup instructions](https://github.com/lsdefine/GenericAgent). At minimum you need:

- GenericAgent cloned to `~/Documents/GenericAgent/` (or any path; Galley lets you pick on first launch)
- Python 3.10+ with GA's dependencies installed
- A configured `mykey.py` with at least one LLM provider (Galley dogfoods with Claude and GLM 4)

Galley will run a health check on first launch and tell you exactly what's missing.

### macOS

1. Download `Galley-v0.x.x-aarch64.dmg` (Apple Silicon) or `Galley-v0.x.x-x86_64.dmg` (Intel) from [Releases](https://github.com/wangjc683/galley/releases)
2. Open the .dmg and drag **Galley.app** to your **Applications** folder
3. Galley isn't code-signed (yet — we're a small dev project). To open it the first time, run this in Terminal:
   ```bash
   xattr -d com.apple.quarantine /Applications/Galley.app
   ```
   Then double-click Galley.app to launch. *(Alternative: right-click the app → Open → Open again. The `xattr` command is more reliable on recent macOS versions.)*

### Windows

1. Download `Galley-v0.x.x-x64-setup.exe` from [Releases](https://github.com/wangjc683/galley/releases)
2. Run the installer. Windows SmartScreen will warn that the publisher is unknown (Galley isn't EV-signed):
   - Click **"More info"** → **"Run anyway"**
3. Launch Galley from the Start menu

## Contributing / Building from source

```bash
git clone https://github.com/wangjc683/galley
cd galley

# Python bridge (tests)
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest          # unit tests
GA_PATH=/path/to/GenericAgent BRIDGE_PYTHON=/path/to/python .venv/bin/python -m pytest -m e2e

# Desktop app (dev / build)
cd desktop
pnpm install
pnpm tauri dev                       # macOS desktop dev mode
pnpm tauri build                     # produces .app / .dmg / .exe
```

See [docs/release-workflow.md](./docs/release-workflow.md) for the CI release flow and [docs/windows-build-checklist.md](./docs/windows-build-checklist.md) for manual Windows builds.

## Acknowledgments

[**lsdefine/GenericAgent**](https://github.com/lsdefine/GenericAgent) — the agent framework Galley is built on — is a self-evolving LLM agent organized around a single principle: **contextual information density maximization**. Rather than chasing raw context length, it keeps the active context small and decision-relevant through four interlocking mechanisms — a minimal atomic tool set, a hierarchical on-demand memory that surfaces only a small high-level view by default, a self-evolution layer that distills past trajectories into reusable SOPs and executable code, and a context truncation/compression layer that maintains density during long executions. The reasoning, tool dispatch, memory consolidation, and SOP system all come from GA. Galley adds a desktop workbench and (in v0.5) a CLI for agent-driven orchestration, while staying strictly non-invasive — delete Galley and GA keeps working untouched.

Paper: [GenericAgent: A Token-Efficient Self-Evolving LLM Agent via Contextual Information Density Maximization (arXiv:2604.17091)](https://arxiv.org/abs/2604.17091)

## License

[MIT](./LICENSE)
