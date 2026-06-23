# 2026-06-23 - GA upstream upgrade 53b48aea -> 70792af

## Date / Status / Related

- Date: 2026-06-23
- Status: implemented in current worktree
- Related:
  - [GA baseline](../ga-baseline.md)
  - [Managed GA patch stack](../../managed-ga/patches/manifest.md)
  - Upstream GA `70792af967a7826fad8e19d800d44977183f046b`

## Context

Official `lsdefine/GenericAgent` `main` advanced 9 commits after Galley's
`53b48aea` baseline. The delta pulls in GA's expanded desktop frontend /
bridge, loop-mode polish, conductor service-panel work, `reasoning` field
compatibility, and an increased native loop limit.

## Decisions

- Upgrade the audited baseline from `53b48aea` to `70792af`.
- Rebuild `managed-ga/code` from a clean official checkout at the exact target
  SHA and replay the managed patch stack.
- Keep attach / external GA non-invasive: no external checkout is pulled,
  patched, or mutated.
- Preserve upstream's new 180-turn limit while refreshing
  `0008-managed-image-attachments.patch` so managed image attachments still
  enter the first user content block.
- Treat upstream `frontends/desktop_bridge.py` as bundled upstream code, not a
  Galley authority path. Galley's GUI / CLI still run through Rust Core and
  `runner.workbench_bridge`; the upstream desktop bridge is only import-smoked
  for dependency readiness.
- Leave bundled Python dependencies unchanged because upstream
  `pyproject.toml` did not change.
- Sync GUI fallback baseline metadata to the managed manifest commit so first
  paint and diagnostics do not drift.

## Rejected Alternatives

- Patch upstream `frontends/desktop_bridge.py` state paths now: Galley does not
  invoke it in managed mode, and adding a broad patch for a non-authoritative
  bridge would expand maintenance surface without changing product behavior.
- Keep the managed image patch at the old `max_turns=80` context: that would
  silently throw away upstream's loop-limit change.
- Auto-upgrade user-owned external GenericAgent checkouts: still violates the
  attach-mode contract.

## Open Questions

- If Galley ever exposes upstream's desktop bridge or service panel directly,
  re-audit its `mykey.py`, `temp/desktop_sessions.json`, upload, and settings
  writes for managed state-root routing before making it user-facing.

## Next

- Run managed payload, Python bridge, GUI, Rust, and whitespace verification
  before committing the baseline upgrade.
