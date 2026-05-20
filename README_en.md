# Galley

> **An open-source local agent app built on [GenericAgent](https://github.com/lsdefine/GenericAgent): a fleet of agents on your desk. When you step out, the supervisor agent in your phone takes over.**

> A local agent team orchestrator, dual-native by design.<br/>
> Dispatch tasks, watch progress, delegate to a supervisor — **humans and agents, both first-class.**

> *Galley started as a workbench for [GenericAgent](https://github.com/lsdefine/GenericAgent). The first two letters of our name are a quiet bow to where we came from.*

[中文 README](./README.md)

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/wangjc683/galley/releases"><img src="https://img.shields.io/github/v/release/wangjc683/galley?include_prereleases" alt="Latest Release" /></a>
  <a href="https://github.com/wangjc683/galley/releases"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" alt="Platform" /></a>
  <a href="https://github.com/wangjc683/galley/stargazers"><img src="https://img.shields.io/github/stars/wangjc683/galley?style=social" alt="Stars" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/screenshot_05.png" alt="Galley main conversation view" width="800" />
</p>

## What is Galley

Galley is a **local agent team orchestrator** — multiple AI agent sessions running on the same Mac/PC, where each session is a GenericAgent subprocess. The Galley GUI is for you at the desk; the Galley CLI is for another **Supervisor Agent** to drive the team remotely. Step out the door, message your supervisor on IM from your phone, and let it run your agent team while you're gone.

Galley **doesn't touch** your existing [GenericAgent](https://github.com/lsdefine/GenericAgent) — delete Galley anytime, GA keeps working untouched.


## Why "Galley"?

A ship's galley is both kitchen and workbench — the cook making dinner, a deckhand grabbing food, the helmsman handing off the watch, the captain making midnight coffee. Everyone shows up for their own reason, but **the table is the same table**.

We think a local AI workbench wants to be that table too. The human user drives from the GUI; a supervisor agent controls and manages the agent team from the CLI; both share the same sessions, the same history, the same decision log — not separate tabs, one workbench.

Multics in the 1960s introduced time-sharing, letting multiple humans share one machine as if each had it to themselves. Galley brings workbench-sharing for a new pair of users: humans and agents.

The first two letters of our name are a quiet bow to [GenericAgent](https://github.com/lsdefine/GenericAgent) — where we came from.

## Features

- ⚙️ **Dual-native: GUI + CLI as peers** — the `galley` command is a public contract ([schema v1 frozen](./docs/agent-api.md)). Anything a supervisor agent can do, the GUI can do — and vice versa.
- 🪟 **Multi-session in parallel** — each session runs an independent GenericAgent subprocess; the number of alive subprocesses is bounded by your machine's memory, with a different LLM per session.
- 👤 **Origin tracking + supervisor activity timeline** — every message a supervisor dispatches carries `(who, when, why)`. The GUI annotates messages with "@ga-claude-1 · reason · 2 min ago" and a TopBar pill summarizes supervisor activity.
- 🔧 **Structured tool timeline** — every tool call, args, result, and timing inline with the conversation.
- 🛡️ **Approval system + YOLO mode** — pause for high-risk actions (file_patch, code_run, ...), or trust your agent and skip.
- 🤖 **Per-session LLM switching** — switch models mid-conversation without losing context.
- 💾 **Session persistence + full-text search** — close Galley, come back days later, pick up where you left off. SQLite FTS5 trigram search across all conversations.
- 📁 **Project grouping** — organize sessions by project.
- 🍱 **Background mode** — close the window, keep running in the menubar to receive supervisor commands.

## Architecture

```
┌──────────────┐                          ┌──────────────┐
│  Galley GUI  │ ───┐                ┌─── │  Galley CLI  │
│ (Tauri/React)│    │                │    │    (Rust)    │
└──────────────┘    │                │    └──────────────┘
                    ▼                ▼
              ┌──────────────────────────┐
              │      Galley Core         │      localhost only
              │         (Rust)           │ ◀──  unix socket / named pipe
              │  · session lifecycle     │      0600 · no token · no TLS
              │  · SQLite write authority│
              │  · runner mgmt + events  │
              └────────────┬─────────────┘
                           │
                ┌──────────┴──────────┐
                ▼                     ▼
        ┌─────────────┐       ┌─────────────┐
        │  Runner #1  │  ···  │  Runner #N  │   one per session,
        │  (Python)   │       │  (Python)   │   one GA subprocess each
        └─────────────┘       └─────────────┘   bundled CPython 3.11
```

(1) GUI and CLI are **peer frontends**, not GUI wrapping CLI;
(2) the **Rust core is the authoritative layer** — session state, SQLite writes, and runner lifecycle all live there;
(3) **localhost only** — no TCP port, no token, no TLS. Remote access is the supervisor's responsibility, through its own transport (GA's IM frontend, SSH, whatever).

**Tech stack:** Tauri v2 + React 19 + TypeScript 5.8 + Tailwind v4 / Rust (Galley Core + Galley CLI) / Python (runner, wraps GenericAgent) / SQLite + FTS5 trigram

## Quick Start

### 1 · Install GenericAgent

Galley currently supports attach mode only — you need to install and configure [GenericAgent](https://github.com/lsdefine/GenericAgent) first. Follow [the hello-generic-agent tutorial](https://datawhalechina.github.io/hello-generic-agent/part1/chapter1/). At minimum you need:

- GA cloned to any path (for example `~/Documents/GenericAgent/`; you'll pick the GA path after launching Galley)
- A configured `mykey.py` with at least one LLM provider (Galley dogfoods primarily with Claude Opus 4.6 / Sonnet 4.6, GPT 5.5, and GLM 5.1)

### 2 · Install Galley

**macOS** — Download `Galley_aarch64.dmg` (Apple Silicon) or `Galley_x64.dmg` (Intel) from [Releases](https://github.com/wangjc683/galley/releases). Open the .dmg and drag **Galley.app** to your Applications folder. Galley isn't Apple code-signed yet, so **on first launch, run this in Terminal**:

```bash
xattr -d com.apple.quarantine /Applications/Galley.app
```

Then double-click Galley.app to launch.

**Windows** — Download `Galley_Windows_x64-setup.exe` and run the installer. When SmartScreen warns that the publisher is unknown → "More info" → "Run anyway".

### 3 · First launch

The GUI auto-runs an Onboarding wizard:

- probes your GA path and LLM provider config
- drops you into the main conversation view once everything checks out

## Supervisor Integration

Galley's GUI and CLI are **peer frontends** — anything the CLI can do, the GUI can do, and the other way around. The CLI is the entry point for another agent to drive your session team remotely.

### One-click install

In the running GUI, head to **Settings → Integration tab**:

| Button | What it does |
|---|---|
| **Install galley to PATH** | Installs the `galley` command to `/usr/local/bin/` (macOS sudo; user-level PATH on Windows) so the supervisor can call it directly |
| **Install Supervisor SOP** | Drops [`galley-supervisor-sop.md`](./docs/integrations/galley-supervisor-sop.md) into your GA's `memory/` — your GA bot learns to orchestrate Galley automatically |
| **Install Claude Skill** | Symlinks [`.claude/skills/galley-supervisor`](./.claude/skills/galley-supervisor) into `~/.claude/skills/` — Claude Code auto-recognizes triggers like "check Galley" or "what's running in Galley" |

### From the supervisor's seat

Once installed, a remote agent can dispatch like this:

```bash
# What's running right now?
galley session list --output=json | jq '.[] | {id, title, status}'

# Spin up a new session for the GA to follow up on a PR
galley session new --project=work --llm="Claude Sonnet 4.6" \
  --supervisor=ga-claude-1 --reason="follow up on PR review" \
  "look at the feedback on #1234"

# Long-lived stream of events for one session
galley session watch <id>

# Swap the LLM / archive / etc.
galley session set-llm <id> --llm="GLM 5.1"
galley session archive <id> --supervisor=ga-claude-1 --reason="done"
```

Every command automatically carries an origin triple (`via=supervisor`, `supervisor=ga-claude-1`, `reason=...`). The GUI timeline annotates supervisor-issued messages with "@ga-claude-1 · follow up on PR review · 2 min ago" so the human can see at a glance what the supervisor has been up to.

Full command reference, JSON schemas, and exit codes in [`docs/agent-api.md`](./docs/agent-api.md) (schema v1 frozen).

## Screenshots

| | |
|---|---|
| ![](docs/screenshots/screenshot_01.png) | ![](docs/screenshots/screenshot_02.png) |
| ![](docs/screenshots/screenshot_03.png) | ![](docs/screenshots/screenshot_04.png) |

<sub>*Screenshots from v0.1.0.*</sub>

## Contributing / Building from source

```bash
git clone https://github.com/wangjc683/galley
cd galley

# Python runner (tests)
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest          # unit tests
GA_PATH=/path/to/GenericAgent BRIDGE_PYTHON=/path/to/python .venv/bin/python -m pytest -m e2e

# Desktop app (dev / build)
cd gui
pnpm install
pnpm tauri dev                       # macOS / Windows desktop dev mode
pnpm tauri build                     # produces .app / .dmg / .exe

# Galley CLI (standalone build)
cd ../core
cargo build --release -p galley-cli  # produces target/release/galley
```

See [docs/release-workflow.md](./docs/release-workflow.md) for the CI release flow and [docs/windows-build-checklist.md](./docs/windows-build-checklist.md) for manual Windows builds.

## Acknowledgments

[**lsdefine/GenericAgent**](https://github.com/lsdefine/GenericAgent) — the agent framework Galley is built on.

### Core characteristics

| Feature | Description |
| :--- | :--- |
| **Self-evolving** | Each task distills reusable SOPs / Skills; capabilities accumulate with use |
| **Lightweight architecture** | ~3K lines of core code; Agent Loop ~100 lines; no complex dependencies |
| **Real-world tools** | Injects a real browser (with logged-in state); 9 atomic tools operate the system directly |
| **Multi-model support** | Works with Claude / Gemini / Kimi / MiniMax and other major models; cross-platform |
| **Token-efficient** | ~30K context window (vs 200K–1M for typical agents); contextual density optimization reduces noise |

Paper: [GenericAgent: A Token-Efficient Self-Evolving LLM Agent via Contextual Information Density Maximization (arXiv:2604.17091)](https://arxiv.org/abs/2604.17091)

## License

[MIT](./LICENSE)
