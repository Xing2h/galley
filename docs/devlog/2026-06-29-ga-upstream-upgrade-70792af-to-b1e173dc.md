# 2026-06-29 - GA upstream upgrade 70792af -> b1e173dc

## Date / Status / Related

- Date: 2026-06-29
- Status: implemented in current worktree
- Related:
  - [GA baseline](../ga-baseline.md)
  - [Managed GA patch stack](../../managed-ga/patches/manifest.md)
  - Upstream GA `b1e173dcbb3cf1a0c7fdeab4211a12a44461c841`

## Context

Official `lsdefine/GenericAgent` `main` advanced 11 commits after Galley's
`70792af` baseline. The delta brings GA's `--func` / `--history` task helpers,
in-memory intervention fields, `export_history`, UltraPlan assets and SOP,
summary-fallback fixes, a new optional HTTP app asset, and upstream removal of
the old TUI worldline implementation.

## Decisions

- Upgrade the audited baseline from `70792af` to `b1e173dc`.
- Rebuild `managed-ga/code` from a clean official checkout at the exact target
  SHA and replay the managed patch stack.
- Keep attach / external GA non-invasive: no external checkout is pulled,
  patched, or mutated.
- Refresh `0001-managed-state-root.patch` for upstream UltraPlan so run files
  and subagent prompt/output artifacts live under `GALLEY_GA_STATE_ROOT/temp`
  instead of the managed code payload.
- Refresh `0007-managed-codex-backend.patch` around the upstream Responses
  payload so Galley's credential IPC, account header, `store=false`, and WHAM
  quota hints coexist with upstream's `include: reasoning.encrypted_content`.
- Refresh `0008-managed-image-attachments.patch` as a small block-level change
  around `agent_runner_loop`, avoiding brittle zero-context insert placement.
- Add `ultraplan_sop.md` to the managed memory seed guard.
- Leave bundled Python dependencies unchanged because upstream `pyproject.toml`
  did not change. The new `ga_httpapp.py` is an upstream optional asset, not a
  Galley Core surface.

## Rejected Alternatives

- Leave UltraPlan writing to `managed-ga/code/temp`: that would violate the
  managed runtime rule that code is replaceable and user state is not.
- Patch or expose upstream `ga_httpapp.py` as a Galley feature: Galley Core
  remains AF_UNIX / named-pipe only, and this upstream HTTP app is not invoked
  by Galley's GUI, CLI, or runner path.
- Auto-upgrade user-owned external GenericAgent checkouts: still violates the
  attach-mode contract.

## Open Questions

- If Galley later exposes GA UltraPlan as a product surface, decide whether the
  local HTML progress monitor belongs inside Galley UI instead of opening a
  GA-owned loopback server.
- If Galley ever invokes upstream `ga_httpapp.py`, re-audit Localhost Only,
  dependency packaging, bind address, and auth semantics first.

## Next

- Run managed payload, Python bridge, bundled-runtime smoke, Rust, GUI, and
  whitespace verification before committing the baseline upgrade.
