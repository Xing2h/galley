# 2026-06-03 - v0.2.6 Memory/SOP and UI polish release

## Date / Status / Related

- Date: 2026-06-03
- Status: `v0.2.6` published as stable GitHub Latest and promoted to the
  default update channel.
- Related:
  - [Project status](../project-status.md)
  - [Release / update SOP](../release-update-sop.md)
  - [Managed GA runtime](../managed-ga-runtime.md)
  - [Managed GA state seed](../../managed-ga/state-seed/memory)
  - [Settings Models](../../gui/src/components/screens/settings/SettingsModels.tsx)
  - [Conversation main view](../../gui/src/components/screens/MainView.tsx)
  - [Selection copy toolbar](../../gui/src/components/conversation/SelectionCopyToolbar.tsx)
  - [Windows updater file-lock fix](./2026-06-03-windows-updater-file-lock.md)

## Context

After `v0.2.5`, the next dogfood pass found one product-critical gap and a
cluster of interaction polish issues. The bundled GA runtime had the code entry
points for GenericAgent memory, but the upstream tracked `memory/` seed was not
present in Galley's managed state. That made the bundled runtime weaker than
the external GA baseline in exactly the place agents depend on for long-term
use: Memory and SOP.

The same release window also surfaced several UI issues that all had the same
shape: useful controls existed, but the visual hierarchy made users work too
hard. Settings -> Models mixed provider groups, model rows, and inline editors
into one beige layer. Conversation streaming showed a long gray temporary text
block directly above the answer it was already streaming. Selection copy and
dialog close tooltips were technically helpful but visually too loud.

## Decisions

- Release `v0.2.6` as a stable patch because the bundled GA Memory/SOP repair
  materially affects agent capability.
- Seed upstream tracked `memory/` files into Galley's managed runtime as
  missing-only state, not as replaceable code and not as a separate Galley SOP
  directory.
- Preserve user state across bundled GA upgrades: runtime code can be replaced,
  but managed memory, custom SOP, skills, and user edits must not be
  overwritten.
- Keep Settings -> Models provider-first. The top Configured models list is a
  quick index into provider-owned model rows, not a second editing surface.
- Keep running progress in conversation high-signal: one live Step status line,
  then the streaming answer. Final Step summaries and the divider before the
  final answer remain.
- Treat small transient UI affordances as supporting controls: selection copy is
  icon-only, and close tooltips do not appear just because a modal opened.
- Include the Windows updater file-lock fix in this stable patch so installed
  Windows users can receive future patches without being blocked by Galley's own
  bundled Python processes.

## Verification

- Local release prep:
  - `pnpm --dir gui typecheck`
  - `pnpm --dir gui lint`
  - `cargo check --manifest-path core/Cargo.toml`
  - `cargo check --manifest-path cli/Cargo.toml`
  - `git diff --check`
- CI:
  - `Check` workflow for `25c88f5` completed successfully.
  - `Release` workflow for `v0.2.6` completed successfully on macOS Apple
    Silicon, macOS Intel, and Windows x64.
  - `Promote Update Channel` completed successfully for `v0.2.6` on `stable`.
- Release state:
  - GitHub Release `v0.2.6` is published, non-prerelease, and GitHub Latest.
  - Release assets include both macOS DMGs, Windows setup, updater archives,
    updater signatures, and `latest.json`.
  - `scripts/check-update-channel.mjs --version 0.2.6 --channel stable
    --cache-bust` passed.
  - `scripts/check-update-channel.mjs --version 0.2.6 --channel beta
    --cache-bust` passed for the legacy alias.

## Rejected alternatives

- Seeding Memory/SOP by writing into external GA checkouts: violates the attach
  boundary and would make Galley responsible for user-owned GenericAgent state.
- Treating SOP as a new Galley-owned `managed-ga-state/sop/` directory: changes
  upstream GenericAgent semantics and creates a second source of truth.
- Turning the model editor into a modal or detached floating card: it would hide
  the provider/model relationship that users are trying to edit.
- Keeping verbose live preamble text under every running Step: it duplicates the
  streaming answer and increases reading noise without giving better progress.
- Adding confirmation dialogs for dirty model drafts: protecting drafts by
  refusing unsafe switches was enough; a modal would add friction to a frequent
  settings workflow.

## Next

Dogfood upgrade from an installed `v0.2.5` or older build. On Windows, test both
the in-app updater and manual overwrite install while bundled Python has been
loaded. On a fresh bundled-GA state, confirm Memory/SOP seed files appear; on an
existing state, confirm user-edited memory files survive the upgrade.
