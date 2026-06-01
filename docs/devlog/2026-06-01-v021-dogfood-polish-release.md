# 2026-06-01 — v0.2.1 dogfood polish release

**Date:** 2026-06-01
**Status:** Shipped
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
- Release `v0.2.1` as a stable patch, not alpha / beta / rc.
- Publish as GitHub Latest, because `v0.2.0` is already stable and
  this release continues that line.
- Promote the beta update channel only after publish; release and
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

## Release Result

- Tag `v0.2.1` points at the version bump commit.
- Release workflow run `26734216023` completed and produced 9 assets: macOS
  Apple Silicon app updater archive + signature + DMG, macOS Intel app updater
  archive + signature + DMG, Windows NSIS updater executable + signature, and
  candidate `latest.json`.
- GitHub Release `v0.2.1` was published as non-draft, non-prerelease, and
  GitHub Latest on 2026-06-01.
- Beta update channel was promoted by workflow run `26735671855`.
- Live beta manifest verification passed for version `0.2.1`.

## Release Gates

- Latest `check.yml` on `main` was green before tagging.
- Local checks covered GUI, Rust, and whitespace:
  `pnpm --dir gui typecheck`, `pnpm --dir gui lint`, `cargo check --workspace`,
  focused Rust tests for image handling, and `git diff --check`.
- Draft Release included macOS Apple Silicon, macOS Intel, Windows, updater
  signatures, and `latest.json`.
- Smoke covered the release notes / assets review and update-channel manifest
  verification. Full installed-app dogfood update remains the next practical
  check on an installed older build.
- Promote verifier initially read stale raw GitHub manifest content for
  `0.2.0`; `scripts/check-update-channel.mjs` now retries validation failures
  and the workflow uses cache-busting requests.

## Rejected Alternatives

- **Wait for `v0.3.0`** — these fixes improve the current stable user
  experience and should reach installed users sooner.
- **Call it `v0.2.1-beta.1`** — `v0.2.0` is already stable Latest; a prerelease
  patch would add ambiguity without reducing much risk.
- **Publish immediately after tag** — draft release and smoke remain required
  because installer assets and updater metadata can fail independently of local
  checks.

## Next

Dogfood the update path from an installed `v0.2.0` or `v0.2.1` build, especially
Settings update status, restart feedback, dark mode, Channels restart feedback,
conversation image save/open, and first-launch updated toast.
