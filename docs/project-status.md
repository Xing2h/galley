# Project Status

> Maintainer-facing document. For a user-facing overview, read
> [README](../README.md). For architecture, read [architecture](./architecture.md).

This document tracks the current working state of Galley. Long historical
decision trails live in [devlog](./devlog/README.md); implementation playbooks
live in [refactor](./refactor/README.md).

## Current Target

- Package version: `0.2.1`
- Git tag / GitHub Release: `v0.2.1`
- Agent API schema: `schemaVersion: 1`
- Release tier: stable patch release; published as GitHub Latest and promoted
  to the beta update channel on 2026-06-01.
- Product shape: dual-native local agent team orchestrator

Galley GUI and Galley CLI are peer frontends over Rust-side Galley Core. The
GUI is for the human operator at the desk; the CLI is for trusted Agent /
Supervisor automation on the same machine.

## Current Release State

`v0.2.1` is the current published stable patch release. It builds on the first
stable `v0.2.0` release with post-0.2 dogfood polish: dark mode, Channels
model-config restart feedback, bridge cwd resolution, update-check automation,
stable Sidebar title expansion, and image save/open actions in conversation
output.

For the next release:

1. Dogfood update from an installed `v0.2.0` or `v0.2.1` build before promoting
   the next stable patch.
2. Smoke Settings -> About update status, model-config Channels restart,
   dark-mode switching, conversation image save/open, and Windows/macOS launch.
3. Run release/update dry-run if packaging, signing, updater config, or bundled
   Python dependencies changed.
4. Keep GitHub Release publishing and update-channel promotion as separate
   gates, even for stable releases.
5. Run the standard verification set:
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
| Release path | v0.2.1 shipped; macOS DMG + Windows NSIS + gated updater channel remain the release path | [release / update SOP](./release-update-sop.md) |
| Windows | v0.2.1 artifact shipped; next smoke should re-check path / probe / min-window / IM flows | [Windows checklist](./windows-build-checklist.md) |
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

- Current package metadata uses `0.2.1`. For the next release, update:
  - `package.json`
  - `core/tauri.conf.json`
  - `core/Cargo.toml`
  - `cli/Cargo.toml`
  - `gui/package.json`
- Use `vX.Y.Z` for Git tag and GitHub Release title.
- Keep Agent API at `schemaVersion: 1`.
- A breaking Agent API change requires `schemaVersion: 2`, with explicit
  compatibility notes in [agent-api](./agent-api.md).
