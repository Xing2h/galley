# Project Status

> Maintainer-facing document. For a user-facing overview, read
> [README](../README.md). For architecture, read [architecture](./architecture.md).

This document tracks the current working state of Galley. Long historical
decision trails live in [devlog](./devlog/README.md); implementation playbooks
live in [refactor](./refactor/README.md).

## Current Target

- Package version: `0.2.4`
- Git tag / GitHub Release: `v0.2.4` is in release prep; `v0.2.3`
  remains GitHub Latest until `v0.2.4` artifacts pass smoke and are
  published.
- Agent API schema: `schemaVersion: 1`
- Release tier: stable patch release candidate; beta update channel remains on
  `v0.2.3` until installer smoke passes.
- Product shape: dual-native local agent team orchestrator

Galley GUI and Galley CLI are peer frontends over Rust-side Galley Core. The
GUI is for the human operator at the desk; the CLI is for trusted Agent /
Supervisor automation on the same machine.

## Current Release State

`v0.2.4` is the next stable patch target. It builds on `v0.2.3` with a new
ChatGPT / Codex managed model provider, Browser Control offline recovery,
Settings small-window close-button polish, archived-session management polish,
and quieter UI typography. The new managed-model `auth_kind` migration keeps
API-key providers as the default and adds the ChatGPT / Codex OAuth path for
managed runtime only.

`v0.2.3` remains the current published stable release and beta update-channel
target until `v0.2.4` installers pass smoke. Keep GitHub Release publishing and
update-channel promotion as separate gates.

For the `v0.2.4` release:

1. Dogfood update from an installed `v0.2.3` build before promoting the update
   channel.
2. Smoke ChatGPT / Codex provider setup in Onboarding and Settings: device
   login, Codex CLI login import, model test, token refresh path, logout, and a
   managed-GA conversation.
3. Smoke existing API-key providers after migration so old users do not lose
   model access.
4. Smoke Browser Control setup on macOS and Windows: install / reveal the
   extension folder, open the test page, run Galley test, verify
   connected-no-page feedback, and recover after Chrome / extension restart.
5. Smoke Settings -> About update status, model-config Channels restart,
   close-to-background feedback, selection-copy toolbar, and Windows/macOS
   launch.
6. Run release/update dry-run if packaging, signing, updater config, or bundled
   Python dependencies changed.
7. Run the standard verification set:
   - `cargo check --workspace`
   - `cargo test --workspace`
   - `pnpm typecheck`
   - `pnpm lint`
   - `git diff --check`

## Status Dashboard

| Area | Status | Read More |
|---|---|---|
| Core architecture | Rust Galley Core is authoritative | [architecture demo](./architecture-demo.md) |
| CLI / Agent API | Feature-complete for v0.2; schema frozen | [agent-api](./agent-api.md) |
| Agent surface | Settings -> Agent, copy-first SOP, Claude Skill | [Supervisor SOP](./integrations/galley-supervisor-sop.md) |
| Managed GA runtime | Shipped in v0.2.0; GUI / CLI split, Provider / Model config, and local encrypted SQLite credentials are the current baseline | [managed GA runtime](./managed-ga-runtime.md) |
| Data migration | Backup mechanism exists; runtime identity and managed model config migrations are in dogfood | [B4 M8](./refactor/B4-M8-sub-plan.md) |
| Release path | v0.2.4 release prep; macOS DMG + Windows NSIS + gated updater channel remain the release path | [release / update SOP](./release-update-sop.md) |
| Windows | v0.2.4 smoke must cover Browser Control setup / recovery and managed model migration | [Windows checklist](./windows-build-checklist.md) |
| GA baseline | Locked to audited upstream commit | [GA baseline](./ga-baseline.md) |

## Compact Timeline

| Phase | Status | Notes |
|---|---|---|
| Stage 0-2 | Complete | Infrastructure, bridge POC, desktop skeleton |
| Stage 3 | Complete | v0.1 desktop workbench, multi-session, projects, polish |
| v0.1.1 release path | Shipped | Bundled Python, macOS DMG, Windows NSIS artifact path |
| Bridge-owner prototype | Complete | Validated Rust-side process ownership direction |
| B1 | Complete | Rust core skeleton + read-only CLI |
| B2 | Complete | Bridge ownership moved to Rust + local socket / named pipe |
| B3 | Complete | `useAppStore.ts` removed; state split into domain stores |
| B4 | Shipped with v0.2.0 | CLI writes, schema freeze, discovery file, Settings -> Agent, SOP, Claude Skill, activity UI, backup mechanism |

Detailed phase narratives are intentionally not duplicated here. Use:

- [refactor README](./refactor/README.md) for B-phase execution state
- [devlog README](./devlog/README.md) for chronological decision history
- [PRD](./PRD.md) for product intent and roadmap

## Release Version Rules

- Current package metadata uses `0.2.4`. For the next release, update:
  - `package.json`
  - `core/tauri.conf.json`
  - `core/Cargo.toml`
  - `cli/Cargo.toml`
  - `gui/package.json`
- Use `vX.Y.Z` for Git tag and GitHub Release title.
- Keep Agent API at `schemaVersion: 1`.
- A breaking Agent API change requires `schemaVersion: 2`, with explicit
  compatibility notes in [agent-api](./agent-api.md).
