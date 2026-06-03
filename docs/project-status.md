# Project Status

> Maintainer-facing document. For a user-facing overview, read
> [README](../README.md). For architecture, read [architecture](./architecture.md).

This document tracks the current working state of Galley. Long historical
decision trails live in [devlog](./devlog/README.md); implementation playbooks
live in [refactor](./refactor/README.md).

## Current Target

- Package version: `0.2.5`
- Git tag / GitHub Release: `v0.2.5` is the current published GitHub Latest.
- Agent API schema: `schemaVersion: 1`
- Release tier: stable hotfix patch release; beta update channel points at
  `v0.2.5`.
- Product shape: dual-native local agent team orchestrator

Galley GUI and Galley CLI are peer frontends over Rust-side Galley Core. The
GUI is for the human operator at the desk; the CLI is for trusted Agent /
Supervisor automation on the same machine.

## Current Release State

`v0.2.5` is the current published stable hotfix, GitHub Latest, and beta
update-channel target. It fixes the ChatGPT / Codex provider shipped in
`v0.2.4`: Codex backend request `input` is sent as a Responses list, streaming
is forced for Codex, and unsupported `max_output_tokens` is omitted for the
Codex backend. Dogfood confirmed Codex CLI import, model test, a conversation
through the built-in GA runtime, and macOS DMG installation before publish.

The beta update channel was promoted to `v0.2.5` after publish. The live channel
verifier passed with cache-busting, and the `galley-update-channel` branch
manifest reports version `0.2.5`.

Post-promote follow-up:

1. Dogfood update from an installed `v0.2.4` build if an older install is still
   available.
2. Smoke ChatGPT web-login completion if time permits; it shares the same
   request-shape probe as CLI import.
3. Smoke one existing API-key provider enough to verify the hotfix did not
   disturb normal provider handling.

## Status Dashboard

| Area | Status | Read More |
|---|---|---|
| Core architecture | Rust Galley Core is authoritative | [architecture demo](./architecture-demo.md) |
| CLI / Agent API | Feature-complete for v0.2; schema frozen | [agent-api](./agent-api.md) |
| Agent surface | Settings -> Agent, copy-first SOP, Claude Skill | [Supervisor SOP](./integrations/galley-supervisor-sop.md) |
| Managed GA runtime | Shipped in v0.2.0; GUI / CLI split, Provider / Model config, and local encrypted SQLite credentials are the current baseline | [managed GA runtime](./managed-ga-runtime.md) |
| Data migration | Backup mechanism exists; runtime identity and managed model config migrations are in dogfood | [B4 M8](./refactor/B4-M8-sub-plan.md) |
| Release path | v0.2.5 published as GitHub Latest and promoted to the beta update channel | [release / update SOP](./release-update-sop.md) |
| Windows | v0.2.5 Windows setup artifact is published through the release and updater manifest; monitor Windows reports | [Windows checklist](./windows-build-checklist.md) |
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

- Current package metadata uses `0.2.5`. For the next release, update:
  - `package.json`
  - `core/tauri.conf.json`
  - `core/Cargo.toml`
  - `cli/Cargo.toml`
  - `gui/package.json`
- Use `vX.Y.Z` for Git tag and GitHub Release title.
- Keep Agent API at `schemaVersion: 1`.
- A breaking Agent API change requires `schemaVersion: 2`, with explicit
  compatibility notes in [agent-api](./agent-api.md).
