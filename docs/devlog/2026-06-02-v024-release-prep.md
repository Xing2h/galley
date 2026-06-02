# 2026-06-02 - v0.2.4 release prep

## Date / Status / Related

- Date: 2026-06-02
- Status: Stable patch release prep for `v0.2.4`; `v0.2.3` remains published
  and promoted until `v0.2.4` artifacts pass smoke.
- Related:
  - [Project status](../project-status.md)
  - [Release / update SOP](../release-update-sop.md)
  - [ChatGPT / Codex OAuth core](../../core/src/codex_oauth.rs)
  - [Managed model presets](../../gui/src/lib/managed-model-presets.ts)
  - [Browser Control setup dialog](../../gui/src/components/screens/BrowserControlSetupDialog.tsx)

## Context

After `v0.2.3` shipped, `main` accumulated enough user-facing changes to justify
a new patch release rather than waiting for a larger feature train. The two
release-driving changes are the ChatGPT / Codex managed model provider and
Browser Control offline recovery. They improve first-run setup and browser task
reliability, but both sit on paths where a failure feels like Galley itself is
broken.

The latest `main` check workflow was green across frontend checks, managed GA
payload validation, macOS arm64 / x64 Rust checks, and Windows Rust checks. The
beta update channel still points at `0.2.3`, so there is no accidental promotion
pressure while `v0.2.4` is prepared.

## Decisions

- Target `v0.2.4` as a stable patch release.
- Keep Agent API at `schemaVersion: 1`; no CLI schema change is part of this
  release.
- Treat ChatGPT / Codex provider as the primary smoke risk because it adds a new
  OAuth credential path, token refresh behavior, and managed-GA credential IPC.
- Keep API-key providers as the default path through the `auth_kind` migration
  so existing users keep their model access.
- Treat Browser Control offline recovery as the second smoke risk: extension
  connected / no page, Chrome restart, and extension restart must produce
  actionable feedback rather than generic failure.
- Publish GitHub Release and promote the beta update channel as two separate
  gates. `v0.2.4` should not reach installed users until installer smoke passes.

## Smoke blocker found before publish

- ChatGPT / Codex device-login codes must be directly copyable and selectable.
  The first draft build showed the code in a non-selectable card, which made
  the primary login path feel broken. The fix adds a shared device-code card
  with a copy CTA and text selection in both Onboarding and Settings.
- ChatGPT / Codex login completion must probe with the payload shape expected
  by the Codex responses backend. The smoke build returned HTTP 400 with
  `Instructions are required` after OAuth succeeded, so the probe now sends a
  minimal `instructions` field and has a unit test for that request body.
- ChatGPT web login and Codex CLI import must read as two different setup
  paths. The first draft placed `Import Codex CLI login` in the same action row
  as device-code login, which made it look like a step in the web-login flow.
  The UI now makes web sign-in the primary path and places CLI import in a
  separate fallback block.

## Rejected alternatives

- Directly promoting the update channel after CI green: CI covers compilation
  and tests, but not the installed-app OAuth and browser-extension paths users
  will actually experience.
- Shipping as `v0.3.0`: the release adds a meaningful onboarding option, but
  the public Agent API remains stable and the scope is still compatible with the
  `0.2.x` patch line.
- Hiding ChatGPT / Codex from the release notes: it is the main new user-facing
  path, so release notes should set clear expectations instead of making users
  discover it by accident.

## Open questions

- Whether the ChatGPT / Codex provider should be promoted as the default first
  provider for all new users after more dogfood, or stay as a clear preset next
  to API-key providers.
- Whether Browser Control setup should add deeper automatic recovery after more
  extension restart reports.

## Next

Commit the release prep, bump package metadata to `0.2.4`, tag `v0.2.4`, and
let `release.yml` build a draft GitHub Release. Smoke the installers before
publishing, then promote the beta update channel only after smoke passes.
