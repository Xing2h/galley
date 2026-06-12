# Project Status

> Maintainer-facing document. For a user-facing overview, read
> [README](../README.md). For architecture, read [architecture](./architecture.md).

This document tracks the current working state of Galley. Long historical
decision trails live in [devlog](./devlog/README.md); implementation playbooks
live in [refactor](./refactor/README.md).

## Current Target

- Package version: `0.2.8` release candidate.
- Git tag / GitHub Release: `v0.2.7` is the current published GitHub Latest;
  `v0.2.8` is prepared on `main` but not tagged or published yet.
- Agent API schema: `schemaVersion: 1`
- Release tier: stable patch candidate; default update channel still points at
  `v0.2.7`, with `beta` kept as a legacy alias for older builds.
- Product shape: dual-native local agent team orchestrator

Galley GUI and Galley CLI are peer frontends over Rust-side Galley Core. The
GUI is for the human operator at the desk; the CLI is for trusted Agent /
Supervisor automation on the same machine.

## Current Release State

`v0.2.7` is the current published stable patch, GitHub Latest, and default
update-channel target. It shipped the Windows issue #9 runtime hotfix set:
managed `code_run` now closes child-process stdin for non-interactive
execution, update-check failures now show a manual download fallback plus
copyable phase / endpoint / detail diagnostics, and the bundled GenericAgent
baseline is refreshed to audited upstream `5d122e20`.

`v0.2.8` is the current release candidate on `main`. It gathers the post-`v0.2.7`
Goal V1 work, master-session Goal delivery, main-workbench / Settings polish,
Browser Control reconnect and setup polish, CLI/Core structure splits, and the
audited bundled GenericAgent baseline at upstream `0def7441`. This has not
changed the already published `v0.2.7` artifacts or update channel.

The default update channel was promoted to `v0.2.7` after publish. The live
channel verifier passed with cache-busting for both `stable` and the legacy
`beta` alias, and the `galley-update-channel` branch manifest reports version
`0.2.7`. `GALLEY_UPDATER_ENDPOINT` points at
`updates/stable/latest.json`; `updates/beta/latest.json` is kept as a legacy
alias for builds compiled before the stable endpoint rename.

Release-candidate follow-up before publishing `v0.2.8`:

1. Tag `v0.2.8` only after release prep is committed and local gates pass.
2. Let `release.yml` create a draft Release and verify the three supported
   release targets: macOS Apple Silicon, macOS Intel, and Windows x64.
3. Smoke the draft installers before publishing. For stable / patch release
   completion, promote `stable` after publish and verify both `stable` and the
   legacy `beta` alias.
4. Keep Windows ARM out of the `v0.2.8` supported matrix. Add it later only after
   the release workflow, bundled Python, updater manifest, and smoke path all
   support `aarch64-pc-windows-msvc`.

## Status Dashboard

| Area | Status | Read More |
|---|---|---|
| Core architecture | Rust Galley Core is authoritative | [architecture demo](./architecture-demo.md) |
| CLI / Agent API | Feature-complete for v0.2; schema frozen | [agent-api](./agent-api.md) |
| Agent surface | Settings -> Agent, copy-first SOP, Claude Skill | [Supervisor SOP](./integrations/galley-supervisor-sop.md) |
| Managed GA runtime | Shipped in v0.2.0; Memory/SOP seed repair shipped in v0.2.6; v0.2.7 closes non-interactive `code_run` stdin and refreshed the bundled GA baseline to audited upstream `5d122e20`; current release-candidate baseline is audited upstream `0def7441`; GUI / CLI split, Provider / Model config, and local encrypted SQLite credentials are the current baseline | [managed GA runtime](./managed-ga-runtime.md) |
| Data migration | Backup mechanism exists; runtime identity and managed model config migrations are in dogfood | [B4 M8](./refactor/B4-M8-sub-plan.md) |
| Release path | v0.2.8 is prepared as the next stable patch candidate; v0.2.7 remains GitHub Latest and the live update-channel target until publish + promotion | [release / update SOP](./release-update-sop.md) |
| Windows | Windows x64 remains the supported release target for v0.2.8; Windows ARM is deferred until the release workflow and smoke path are added | [Windows checklist](./windows-build-checklist.md) |
| GA baseline | Locked to audited upstream `0def7441` | [GA baseline](./ga-baseline.md) |

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

- Current package metadata uses `0.2.8`. For the next release, update:
  - `package.json`
  - `core/tauri.conf.json`
  - `core/Cargo.toml`
  - `cli/Cargo.toml`
  - `gui/package.json`
- Use `vX.Y.Z` for Git tag and GitHub Release title.
- Keep Agent API at `schemaVersion: 1`.
- A breaking Agent API change requires `schemaVersion: 2`, with explicit
  compatibility notes in [agent-api](./agent-api.md).
