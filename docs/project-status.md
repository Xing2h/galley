# Project Status

> Maintainer-facing document. For a user-facing overview, read
> [README](../README.md). For architecture, read [architecture](./architecture.md).

This document tracks the current working state of Galley. Long historical
decision trails live in [devlog](./devlog/README.md); implementation playbooks
live in [refactor](./refactor/README.md).

## Current Target

- Package version: `0.2.11`.
- Git tag / GitHub Release: `v0.2.11` is the release-prep target; `v0.2.10`
  remains the current published stable release until the `v0.2.11` draft build
  is smoked, published, and promoted.
- Agent API schema: `schemaVersion: 1`
- Release tier: stable patch prep; default update channel still points at
  `v0.2.10` during draft review. `beta` is kept as a legacy alias for older
  builds.
- Product shape: dual-native local agent team orchestrator

Galley GUI and Galley CLI are peer frontends over Rust-side Galley Core. The
GUI is for the human operator at the desk; the CLI is for trusted Agent /
Supervisor automation on the same machine.

`v0.2.11` is a process-lifecycle hotfix candidate for Mac heat / process pile-up
reports. It adds parent-death self-exit to `workbench_bridge.py`, passes the
owning Galley Core PID into runner subprocesses, and prevents duplicate GUI/Core
startup from creating a second background process set when an existing instance
already owns the local socket. Product shape, Agent API schema, database schema,
GA baseline, and update-channel policy stay unchanged.

## Current Release State

`v0.2.11` is in release prep as a stable patch. The release workflow should
create a draft GitHub Release first; the release owner must install and smoke
that exact draft build before publish and update-channel promotion. Until then,
`v0.2.10` remains the live stable patch on the default
`updates/stable/latest.json` channel, with the legacy `updates/beta/latest.json`
alias pointing at the same version for older installed builds.

Post-promote follow-up:

1. Smoke the `v0.2.11` draft build on macOS with the background-mode flow:
   close the window, launch Galley again, confirm the existing instance is
   raised instead of starting a duplicate Core / bridge set.
2. Confirm true Quit still stops live runner subprocesses and that stale
   `workbench_bridge.py` children do not survive Core death.
3. Smoke one normal new conversation after launch so the parent watchdog does
   not interfere with healthy runner startup.
4. On Windows, smoke duplicate startup / named-pipe behavior and manual
   overwrite install over a backgrounded Galley process.
5. Keep Windows ARM out of the stable supported matrix. Add it later only after
   the release workflow, bundled Python, updater manifest, and smoke path all
   support `aarch64-pc-windows-msvc`.

## Status Dashboard

| Area | Status | Read More |
|---|---|---|
| Core architecture | Rust Galley Core is authoritative | [architecture demo](./architecture-demo.md) |
| CLI / Agent API | Feature-complete for v0.2; schema frozen | [agent-api](./agent-api.md) |
| Agent surface | Settings -> Agent, copy-first SOP, Claude Skill | [Supervisor SOP](./integrations/galley-supervisor-sop.md) |
| Managed GA runtime | Shipped in v0.2.0; Memory/SOP seed repair shipped in v0.2.6; current baseline is audited upstream `53b48aea`; GUI / CLI split, Provider / Model config, local encrypted SQLite credentials, and Project Workspace are the current baseline | [managed GA runtime](./managed-ga-runtime.md) |
| Data migration | v0.2.10 adds a safe pre-plugin migration guard through 023 and best-effort child-row recovery from local backups for the v0.2.9 table-rebuild cascade hazard | [B4 M8](./refactor/B4-M8-sub-plan.md) |
| Process lifecycle | v0.2.11 release prep adds bridge parent watchdogs and duplicate-startup suppression to prevent background process pile-up | [release / update SOP](./release-update-sop.md) |
| Release path | v0.2.11 stable patch is at the draft/smoke gate; v0.2.10 remains live until publish + promotion | [release / update SOP](./release-update-sop.md) |
| Windows | Windows x64 remains the supported release target; Windows ARM is deferred until the release workflow and smoke path are added | [Windows checklist](./windows-build-checklist.md) |
| GA baseline | Locked to audited upstream `53b48aea` | [GA baseline](./ga-baseline.md) |

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

- Current package metadata uses `0.2.11`. For the next release, update:
  - `package.json`
  - `core/tauri.conf.json`
  - `core/Cargo.toml`
  - `cli/Cargo.toml`
  - `gui/package.json`
- Use `vX.Y.Z` for Git tag and GitHub Release title.
- Keep Agent API at `schemaVersion: 1`.
- A breaking Agent API change requires `schemaVersion: 2`, with explicit
  compatibility notes in [agent-api](./agent-api.md).
