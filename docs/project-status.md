# Project Status

> Maintainer-facing document. For a user-facing overview, read
> [README](../README.md). For architecture, read [architecture](./architecture.md).

This document tracks the current working state of Galley. Long historical
decision trails live in [devlog](./devlog/README.md); implementation playbooks
live in [refactor](./refactor/README.md).

## Current Target

- Package version: `0.2.15`.
- Git tag / GitHub Release: `v0.2.15` is the current published stable release.
- Agent API schema: `schemaVersion: 1`
- Release tier: stable patch; default update channel points at `v0.2.15`.
  `beta` is kept as a legacy alias for older builds.
- Product shape: dual-native local agent team orchestrator

Galley GUI and Galley CLI are peer frontends over Rust-side Galley Core. The
GUI is for the human operator at the desk; the CLI is for trusted Agent /
Supervisor automation on the same machine.

`v0.2.15` is a conversation telemetry and running-status release. Final
assistant replies now carry a compact footer with turn duration, input / output
token counts, and current session context usage; active work shows a
bottom-right "Working..." / "工作中..." turn timer HUD while preserving the
existing per-step timers. Message telemetry is persisted for restored sessions,
and large GUI / CLI helper modules were split for easier follow-up work.
Product shape, Agent API schema, and update-channel policy stay unchanged.
`v0.2.15` shipped with managed GA baseline `70792af`; the current worktree has
audited and refreshed the managed GA baseline to `b1e173dc` for the next
release train.

## Current Release State

`v0.2.15` is published and promoted as the live stable patch. The default
`updates/stable/latest.json` channel points at `v0.2.15`, with the legacy
`updates/beta/latest.json` alias pointing at the same version for older
installed builds.

Post-release follow-up:

1. Dogfood the app-update path from an installed older Galley build to
   `v0.2.15`.
2. Visually verify the final-answer telemetry footer with a real managed GA
   session, including input / output tokens and context percentage.
3. Check the running "Working..." / "工作中..." HUD alignment in wide and
   compact layouts, while confirming per-step timers still remain visible.
4. On Windows, continue smoke coverage for duplicate startup / named-pipe
   behavior and manual overwrite install over a backgrounded Galley process.
5. Keep Windows ARM out of the stable supported matrix. Add it later only after
   the release workflow, bundled Python, updater manifest, and smoke path all
   support `aarch64-pc-windows-msvc`.

## Status Dashboard

| Area | Status | Read More |
|---|---|---|
| Core architecture | Rust Galley Core is authoritative | [architecture demo](./architecture-demo.md) |
| CLI / Agent API | Feature-complete for v0.2; schema frozen | [agent-api](./agent-api.md) |
| Agent surface | Settings -> Agent, copy-first SOP, Claude Skill | [Supervisor SOP](./integrations/galley-supervisor-sop.md) |
| Managed GA runtime | Shipped in v0.2.0; Memory/SOP seed repair shipped in v0.2.6; current worktree baseline is audited upstream `b1e173dc`; GUI / CLI split, Provider / Model config, local encrypted SQLite credentials, and Project Workspace are the current baseline | [managed GA runtime](./managed-ga-runtime.md) |
| Data migration | v0.2.15 adds message telemetry persistence for final-answer footer metadata; v0.2.10 added a safe pre-plugin migration guard through 023 and best-effort child-row recovery from local backups for the v0.2.9 table-rebuild cascade hazard | [B4 M8](./refactor/B4-M8-sub-plan.md) |
| Process lifecycle | v0.2.11 ships bridge parent watchdogs and duplicate-startup suppression to prevent background process pile-up | [release / update SOP](./release-update-sop.md) |
| Release path | v0.2.15 stable patch is published and promoted on the stable update channel | [release / update SOP](./release-update-sop.md) |
| Windows | Windows x64 remains the supported release target; Windows ARM is deferred until the release workflow and smoke path are added | [Windows checklist](./windows-build-checklist.md) |
| GA baseline | Locked to audited upstream `b1e173dc` | [GA baseline](./ga-baseline.md) |

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

- Current package metadata uses `0.2.15`. For the next release, update:
  - `package.json`
  - `core/tauri.conf.json`
  - `core/Cargo.toml`
  - `cli/Cargo.toml`
  - `gui/package.json`
- Use `vX.Y.Z` for Git tag and GitHub Release title.
- Keep Agent API at `schemaVersion: 1`.
- A breaking Agent API change requires `schemaVersion: 2`, with explicit
  compatibility notes in [agent-api](./agent-api.md).
