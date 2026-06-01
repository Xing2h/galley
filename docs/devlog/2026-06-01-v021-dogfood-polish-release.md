# 2026-06-01 — v0.2.1 dogfood polish release

**Date:** 2026-06-01
**Status:** Release candidate in prep
**Related:** [project status](../project-status.md), [release / update SOP](../release-update-sop.md), [v0.2.0 stable release](./2026-05-31-v020-stable-release.md)

## Context

`v0.2.0` shipped Galley's first stable baseline: bundled GA, external GA,
Agent / CLI, Browser Control, and Channels. The next day of dogfood surfaced a
set of user-visible polish items that are too useful to hold for a later minor
release but not broad enough to justify `v0.3.0`.

We chose `v0.2.1` as a stable patch release. It is not a P0-only hotfix; it is a
post-0.2 polish patch for the installed stable line.

## Decisions

- Keep Agent API at `schemaVersion: 1`; no CLI contract break is included.
- Release `v0.2.1` as a stable patch, not alpha / beta / rc, once CI and draft
  release assets pass.
- Publish as GitHub Latest after smoke, because `v0.2.0` is already stable and
  this release continues that line.
- Promote the beta update channel only after publish + smoke; release and
  updater promotion remain separate gates.
- Do not use Vite-only browser verification for Tauri-dependent Settings,
  updater, dialog, opener, filesystem, or IPC flows.

## Included Changes

- Dark mode and theme preference handling.
- Channels restart feedback when model configuration changes.
- Rust-side bridge cwd resolution.
- Update-check UX: automatic prepare, stable button layout, restart CTA, and
  one-time completion feedback.
- Sidebar title derivation stores enough text for wide sidebars.
- Conversation image context menu with save and open actions.
- Documentation updates for Tauri-dependent verification boundaries.

## Release Gates

- Latest `check.yml` on `main` must be green before tagging.
- Local checks must cover GUI, Rust, and whitespace:
  `pnpm --dir gui typecheck`, `pnpm --dir gui lint`, `cargo check --workspace`,
  focused Rust tests for image handling, and `git diff --check`.
- Draft Release must include macOS Apple Silicon, macOS Intel, Windows, updater
  signatures, and `latest.json`.
- Smoke should cover Settings update status, dark mode, Channels restart
  feedback, conversation image save/open, and basic launch on release artifacts.

## Rejected Alternatives

- **Wait for `v0.3.0`** — these fixes improve the current stable user
  experience and should reach installed users sooner.
- **Call it `v0.2.1-beta.1`** — `v0.2.0` is already stable Latest; a prerelease
  patch would add ambiguity without reducing much risk.
- **Publish immediately after tag** — draft release and smoke remain required
  because installer assets and updater metadata can fail independently of local
  checks.

## Next

Prepare the version bump, tag `v0.2.1`, wait for the release workflow draft,
review release notes and assets, smoke installers, then publish and promote the
update channel.
