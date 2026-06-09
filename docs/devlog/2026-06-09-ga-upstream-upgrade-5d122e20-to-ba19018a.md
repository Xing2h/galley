# 2026-06-09 - GA upstream upgrade 5d122e20 -> ba19018a

**Date / Status / Related**

- Date: 2026-06-09
- Status: working baseline updated; not yet in a published Galley release
- Related: [GA baseline](../ga-baseline.md), [managed GA patch stack](../../managed-ga/patches/manifest.md)

**Context**

JC asked whether the official GenericAgent latest commit was worth a baseline
refresh. The official `lsdefine/GenericAgent` `main` head was
`ba19018a6d84df7f530275fa4b9b0858843e932a`, a 16-commit delta from Galley's
previous audited baseline `5d122e20ea7e9dfd7941998acb902fbac4a2bc9a`.

The external / attach audit was low risk: `agent_loop.py` and `pyproject.toml`
did not change, and the `BaseHandler.dispatch`, `turn_end_callback`,
`agent._turn_end_hooks`, `list_llms()`, and `llmclient.backend.history` surfaces
Galley depends on remained compatible.

**Decisions**

- Upgrade the working GA baseline to
  `ba19018a6d84df7f530275fa4b9b0858843e932a`.
- Keep `v0.2.7` release notes historically accurate: the published artifacts
  still shipped `5d122e20`; `ba19018a` is the post-release working baseline for
  the next build.
- Preserve upstream `agentmain.py` changes: SDK comments, removal of unused
  `show_mode`, and the long-prompt spill threshold increase from 1500 to 2000
  chars.
- Preserve upstream `llmcore.py` user-agent work for normal OpenAI-like and
  Claude paths while keeping Galley's managed Codex backend on credential IPC,
  Codex headers, forced streaming, and `store=false`.
- Refresh `0001-managed-state-root.patch` and
  `0007-managed-codex-backend.patch` against the new upstream context.
- Extend managed build normalization to `frontends/conductor.py` and
  `memory/incubator_sop.md`, because upstream added trailing whitespace there
  and Galley's `git diff --check` gate should stay clean.

**Rejected Alternatives**

- Only bumping `managed-ga/manifest.json`: `0001-managed-state-root.patch`
  failed on `agentmain.py`, so a hash-only change would not rebuild managed GA.
- Dropping upstream `headers["User-Agent"] = sess.user_agent` while refreshing
  the Codex patch: that would erase the upstream fix for non-Codex OpenAI-like
  models.
- Treating upstream trailing whitespace as acceptable payload churn: Galley
  already owns normalization for patch-touched generated payload, and adding the
  two new files there is cheaper than weakening `git diff --check`.

**Open Questions**

- Managed conductor / IM plugin changes are now bundled, but Galley still owns
  only its own IM Supervisor product surface. Do not expose additional upstream
  conductor controls in Galley unless a user-facing workflow needs them.
- Browser Control and ChatGPT / Codex remain Galley managed patches. Remove them
  if upstream later provides equivalent extension status or credential/request
  seams.

**Next**

Before publishing the next Galley release, run the normal release-bound gates:
bundled Python rebuild / smoke, and managed GA dogfood with real model traffic.
