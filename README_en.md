<p align="center">
  <img src="docs/assets/galley-icon.png" alt="Galley logo" width="96" />
</p>

<h1 align="center">Galley</h1>

<p align="center">
  <strong>Run, manage, and resume multiple AI agent sessions on your own computer</strong>
  <br/>
  Bundled GenericAgent kernel · GUI / CLI dual-native · Local-first
</p>

<p align="center">
  <a href="https://github.com/wangjc683/galley/releases"><strong>Download</strong></a>
  ·
  <a href="#quick-start">Quick Start</a>
  ·
  <a href="./docs/README.md">Docs</a>
  ·
  <a href="./README.md">中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/wangjc683/galley/releases"><img src="https://img.shields.io/github/v/release/wangjc683/galley?include_prereleases" alt="Latest Release" /></a>
  <a href="https://github.com/wangjc683/galley/releases"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" alt="Platform" /></a>
  <a href="https://github.com/wangjc683/galley/stargazers"><img src="https://img.shields.io/github/stars/wangjc683/galley?style=social" alt="Stars" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/screenshot_05.png" alt="Galley main conversation view" width="800" />
</p>

---

## What Is Galley

Galley runs multiple AI agent sessions in parallel on your own computer. Humans use the GUI to watch progress, send instructions, and approve actions; Supervisor Agents use the CLI to orchestrate the same session team.

| For Humans | For Agents | Ready By Default |
|---|---|---|
| Manage sessions, projects, tool timelines, and approvals in the GUI | The `galley` CLI is a stable contract for Supervisor Agents | Bundled GenericAgent runtime, CPython 3.11, runtime dependencies, and Browser Control setup assets |

Already have your own [GenericAgent](https://github.com/lsdefine/GenericAgent) environment? Connect it from **Settings -> Runtime**. Galley does not modify your external GA code, memory, SOP, or `mykey.py`.

---

## Highlights

| | |
|---|---|
| 📦 **Out of the box**<br/>Bundled GenericAgent runtime, CPython 3.11, and runtime dependencies. | 🪟 **Multi-session + Project orchestration**<br/>Run multiple tasks in parallel; complex goals can be split into one Project and synthesized by a Supervisor Agent. |
| ⚙️ **GUI + CLI dual-native**<br/>Humans operate in the GUI; Supervisor Agents operate through the stable `galley` CLI. Both share the same sessions and history. | 💬 **IM integration**<br/>In managed GA mode, connect WeChat from **Settings -> IM** by scanning a QR code; more IM platforms can be added later. |
| 🔒 **Localhost-only**<br/>Core listens only on a Unix socket / Windows named pipe; remote transport belongs to the Supervisor Agent. | 🔧 **Tool timeline + approvals**<br/>Tool calls, args, results, and timing are shown inline; risky actions can use approval, allowlists, or YOLO mode. |
| 🌐 **Browser Control**<br/>After connecting Chrome/Chromium, the agent can operate your signed-in browser. There is a lot of room to explore. | 💾 **Persistence + search + background mode**<br/>Close the window, keep working via a Supervisor Agent, then come back to continue or search past sessions. |

---

## Quick Start

Prepare a usable LLM service first: API Key, Base URL, and model name.

| 1. Download Galley | 2. Configure a model | 3. Start using it |
|---|---|---|
| Download the macOS / Windows installer from [Releases](https://github.com/wangjc683/galley/releases). | On first launch, enter your API Key, Base URL, and model name. | Click "Test and start using Galley" to enter the main conversation view. |

| Platform | Installer |
|---|---|
| macOS Apple Silicon | filename contains `macOS_aarch64.dmg` |
| macOS Intel | filename contains `macOS_x64.dmg` |
| Windows x64 | filename contains `Windows_x64-setup.exe` |

<details>
<summary>Install notes</summary>

Galley is not code-signed yet. If macOS blocks the first launch, run:

```bash
xattr -d com.apple.quarantine /Applications/Galley.app
```

On Windows, when SmartScreen says the publisher is unknown, choose "More info" -> "Run anyway".

If you already have a GenericAgent environment, choose the GA folder from **Settings -> Runtime -> Connect external GA**.

</details>

---

## Supervisor / IM

In the running GUI, open **Settings -> Agent**:

| Button | What it does |
|---|---|
| **Copy SOP** | Copies [`galley-supervisor-sop.md`](./docs/integrations/galley-supervisor-sop.md), so your Agent can choose between one session, an existing-session follow-up, or a Project-backed session group |
| **Open Agent API docs** | Opens the full command reference, JSON schemas, and exit codes |

You do not need to learn the CLI yourself. Tell your Supervisor Agent what you want in natural language, and let it decide how to operate Galley. Complex work does not become one giant prompt: the Supervisor SOP first chooses an orchestration mode, follows one session for simple requests, and uses a Project-backed group of sessions for independent work that needs synthesis. Managed GA users can also connect WeChat from **Settings -> IM**, scan the QR code, and message Galley from WeChat.

<details>
<summary>Show CLI examples</summary>

When Galley is running, a Supervisor Agent on the same machine can dispatch tasks through `galley`:

```bash
# What's running right now?
galley status
galley sessions list

# Start a new session to follow up on a PR
galley session new --project=proj_work \
  --supervisor=ga-claude-1 --reason="follow up on PR review" \
  "look at the feedback on #1234"

# Complex goal: use one Project to hold a group of sessions
galley project create "Release readiness review" \
  --supervisor=ga-claude-1 --reason="parallel release-risk review"

galley session new "Read-only check of app identity, data directory, SQLite migrations, and backup risks. Output risks with evidence." \
  --project=proj_from_create --supervisor=ga-claude-1 --reason="check data safety"

galley session new "Read-only check of packaging, release workflow, bundled resources, and version bumps. Output a release blocker checklist." \
  --project=proj_from_create --supervisor=ga-claude-1 --reason="check release packaging"

galley project follow proj_from_create --tail=80 --until-idle --final-show

# Watch one session's event stream
galley session watch <id>

# Switch model / archive / restart
galley llm set <id> "another model name"
galley session archive <id> --supervisor=ga-claude-1 --reason="done"
```

Every command carries an origin triple (`via=supervisor`, `supervisor=ga-claude-1`, `reason=...`). The GUI timeline annotates supervisor-issued work with "@ga-claude-1 · follow up on PR review · 2 min ago" so the human can see what happened at a glance.

Full command reference, JSON schemas, and exit codes live in [`docs/agent-api.md`](./docs/agent-api.md).

</details>

---

## Architecture

Both GUI and CLI talk to the same Rust Core. Core owns session lifecycle, SQLite writes, runner management, and event broadcasting.

```text
+----------------+                  +----------------+
|   Galley GUI   |---+          +---|   Galley CLI   |
|  Tauri/React   |   |          |   |      Rust      |
+----------------+   |          |   +----------------+
                     v          v
              +------------------------+        localhost only
              |      Galley Core       | <----  unix socket / named pipe
              |          Rust          |        0600 / no token / no TLS
              |  - session lifecycle   |
              |  - SQLite authority    |
              |  - runner + events     |
              +-----------+------------+
                          |
             +------------+------------+
             v                         v
       +------------+             +------------+
       | Runner #1  |     ...     | Runner #N  |        one per session
       |  Python    |             |  Python    |
       +-----+------+             +------+-----+
             |                           |
             +------------+--------------+
                          v
              +------------------------+
              |   Galley-managed GA    |
              | - GenericAgent kernel  |
              | - Galley prompt profile|
              | - bundled CPython 3.11 |
              | - bundled dependencies |
              +------------------------+
```

1. GUI and CLI are **peer frontends**, not GUI wrapping CLI.
2. **Rust Core is authoritative** for session state, SQLite writes, and runner lifecycle.
3. The default path is **Galley-managed GA**: GenericAgent is the bundled agent kernel.

**Tech stack:** Tauri v2 + React 19 + TypeScript 5.8 + Tailwind v4 / Rust (Galley Core + Galley CLI) / Python (runner, wraps GenericAgent) / SQLite + FTS5 trigram

More docs:
[Architecture](./docs/architecture.md) ·
[Contributing](./CONTRIBUTING.md) ·
[Docs index](./docs/README.md)

---

## Why "Galley"?

A ship's galley is both kitchen and workbench. Everyone comes there for a different reason, but **the table is the same table**.

Galley is that shared table: humans drive work from the GUI, while Supervisor Agents manage the team through the CLI. Both share the same sessions, history, and decision log instead of living in separate tabs.

> *Galley started as a workbench for [GenericAgent](https://github.com/lsdefine/GenericAgent). The first two letters of our name are a quiet bow to where we came from.*

## Screenshots

| | |
|---|---|
| ![](docs/screenshots/screenshot_01.png) | ![](docs/screenshots/screenshot_02.png) |
| ![](docs/screenshots/screenshot_03.png) | ![](docs/screenshots/screenshot_04.png) |

<sub>*Some screenshots are from earlier versions while the interface is still moving quickly.*</sub>

## Contributing / Building From Source

```bash
git clone https://github.com/wangjc683/galley
cd galley

# Python runner tests
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest
GA_PATH=/path/to/GenericAgent BRIDGE_PYTHON=/path/to/python .venv/bin/python -m pytest -m e2e

# Desktop app development / build
cd gui
pnpm install
pnpm tauri dev
pnpm tauri build

# Galley CLI standalone build
cd ../core
cargo build --release -p galley-cli
```

See [docs/release-workflow.md](./docs/release-workflow.md) for the CI release flow and [docs/windows-build-checklist.md](./docs/windows-build-checklist.md) for manual Windows builds.

## Acknowledgments

[**lsdefine/GenericAgent**](https://github.com/lsdefine/GenericAgent) is Galley's current agent kernel. Galley's bundled runtime is built on GenericAgent while preserving compatibility with external GA environments; Galley adds local orchestration, peer GUI / CLI frontends, session persistence, approvals, search, and an out-of-the-box packaged experience.

Paper: [GenericAgent: A Token-Efficient Self-Evolving LLM Agent via Contextual Information Density Maximization (arXiv:2604.17091)](https://arxiv.org/abs/2604.17091)

## License

[MIT](./LICENSE)
