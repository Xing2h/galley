# Project Status

> Maintainer-facing document. For a user-facing overview, read
> [README](../README.md). For architecture, read [architecture](./architecture.md).

This document tracks the current working state of Galley. Long historical
decision trails live in [devlog](./devlog/README.md); implementation playbooks
live in [refactor](./refactor/README.md).

## Current Target

- Package version: `0.2.3`
- Git tag / GitHub Release: `v0.2.3` is published as GitHub Latest.
- Agent API schema: `schemaVersion: 1`
- Release tier: stable patch release shipped; beta update channel promoted to
  `v0.2.3` after installer smoke.
- Product shape: dual-native local agent team orchestrator

Galley GUI and Galley CLI are peer frontends over Rust-side Galley Core. The
GUI is for the human operator at the desk; the CLI is for trusted Agent /
Supervisor automation on the same machine.

## Current Release State

`v0.2.3` is the current published stable patch release. It builds on
`v0.2.2` with Browser Control onboarding and diagnostics fixes: Galley now
distinguishes "extension connected but no ordinary webpage is open" from a
broken bridge, the setup guide adds a browser-specific test page step, macOS /
Windows folder reveal selects the whole `tmwd_cdp_bridge` folder, and the
setup dialog keeps primary actions visible at the 600px minimum window height.

`v0.2.3` is published as GitHub Latest and promoted to the beta update channel.
The release workflow built all three artifacts successfully, the macOS DMG was
smoke-tested before publishing, and the live beta `latest.json` verifier passed
with cache-busting after promotion.

For the next release:

1. Dogfood update from an installed `v0.2.3` build before promoting the next
   version.
2. Smoke Browser Control setup on macOS and Windows: install / reveal the
   extension folder, open the test page, run Galley test, and verify the
   connected-no-page state is quiet after cold start.
3. Smoke managed-GA conversation startup, Settings -> About update status,
   model-config Channels restart, close-to-background feedback, selection-copy
   toolbar, and Windows/macOS launch.
4. Run release/update dry-run if packaging, signing, updater config, or bundled
   Python dependencies changed.
5. Keep GitHub Release publishing and update-channel promotion as separate
   gates, even for stable releases.
6. Run the standard verification set:
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
| Release path | v0.2.3 shipped; macOS DMG + Windows NSIS + gated updater channel remain the release path | [release / update SOP](./release-update-sop.md) |
| Windows | v0.2.3 artifact shipped; keep Browser Control extension / test-page / probe / min-window flows in the next Windows smoke | [Windows checklist](./windows-build-checklist.md) |
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

- Current package metadata uses `0.2.3`. For the next release, update:
  - `package.json`
  - `core/tauri.conf.json`
  - `core/Cargo.toml`
  - `cli/Cargo.toml`
  - `gui/package.json`
- Use `vX.Y.Z` for Git tag and GitHub Release title.
- Keep Agent API at `schemaVersion: 1`.
- A breaking Agent API change requires `schemaVersion: 2`, with explicit
  compatibility notes in [agent-api](./agent-api.md).
