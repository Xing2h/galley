# 2026-06-18 - GA upstream upgrade 12655687 -> 53b48aea

## Date / Status / Related

- Date: 2026-06-18
- Status: implemented in current worktree
- Related:
  - [GA baseline](../ga-baseline.md)
  - [Managed GA patch stack](../../managed-ga/patches/manifest.md)
  - Upstream GA `53b48aea07ad78ef577444ca6efa83693399f168`

## Context

Official `lsdefine/GenericAgent` `main` advanced one commit after Galley's
Project Workspace baseline. The new upstream commit only changes `llmcore.py`
to include the active model name in response-log headers.

## Decisions

- Upgrade the audited baseline from `12655687` to `53b48aea`.
- Rebuild `managed-ga/code` from a clean official checkout at the exact target
  SHA and replay the existing nine managed patches.
- Keep attach / external GA non-invasive: Galley updates the verified baseline
  and comparison UI, but does not pull or modify a user-owned checkout.
- Make the managed runtime manifest the GUI source of truth for the external
  GA comparison baseline once diagnostics load, avoiding stale frontend
  fallback drift.

## Rejected Alternatives

- Leave the baseline at `12655687`: Settings would continue to show users on
  official latest as self-updated even though the delta is already audited.
- Auto-upgrade external GA checkouts: violates Galley's attach-mode contract.
- Patch around upstream's response-log model metadata: unnecessary; it is
  compatible with Galley's managed state-root routing.

## Open Questions

- None for this one-commit upgrade.

## Next

- Run the managed payload, Python bridge, Rust, and GUI verification set before
  committing the upgrade.
