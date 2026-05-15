# 2026-05-15 — GA baseline upgrade 6bb3104 → fc6b5ad

**Date / Status**: 2026-05-15 / shipped
**Related**: [CLAUDE.md → GA Baseline](../../CLAUDE.md#ga-baseline) section · [Baseline Upgrade Workflow](../../CLAUDE.md#baseline-upgrade-workflow) procedure

## Context

Triggered alongside the v0.1 release-readiness push — same session that fixed prod-build issues (Onboarding routing, Python probe, bridge stderr surfacing). JC asked: "GA baseline 也干脆一起帮我升级到官方最新的 commit". 13 commits had accumulated upstream since 2026-05-13.

Followed the workflow procedure from CLAUDE.md verbatim:

1. `git fetch upstream` → upstream/main at `fc6b5ad`
2. `git log 6bb3104..upstream/main --oneline` → 13 commits
3. `git diff --stat` on the 4 interface-surface files
4. Inspect each surface for breaking changes
5. Run `bridge/tests/` against new + old baseline
6. Fast-forward JC's local GA `main` from `ffb2685` → `fc6b5ad`
7. Update CLAUDE.md baseline reference

## Decisions

- **Lock to `fc6b5ad`** (upstream/main HEAD on 2026-05-15) as the new Galley-tested baseline.
- **Zero adapter changes needed in bridge** — the four interface surfaces we depend on are byte-stable across the 13 commits.
- **Fast-forward JC's local GA main** since he was 1 commit behind upstream. Otherwise Settings → Runtime → "GenericAgent 版本" would show `你已自行升级` despite him being on stock GA.

### Audit of the four interface surfaces

| Surface | File | Change in 13 commits | Verdict |
|---|---|---|---|
| `BaseHandler` 3 callbacks + `dispatch` signature | `agent_loop.py` | **0 lines** | safe |
| `_turn_end_hooks` dict + `hook(locals())` convention | `ga.py` (GenericAgentHandler) | 4 lines (maxlen tuning only: `do_code_run` 20000→15000; `_get_anchor_prompt` history slice 150→100) | safe — internal threshold tweaks, no signature / contract change |
| `agentmain.GenericAgentHandler` import path | `agentmain.py` | **0 lines** | safe |
| `agent.llmclient.backend.history` list semantics | `llmcore.py` | 54 lines, but **none touch the `history` attribute's read/write contract** | safe |

`llmcore.py` is the busiest diff. Its substance:

- `compress_history_tags()` gained `interval=5` parameter (backward-compatible default; previous behavior preserved when called positionally)
- `trim_messages_history(history, context_win)` → `(history, sess)` — **signature break**, BUT this function is called only from GA's own `BaseSession.send_messages` path, not from bridge. We verified: `grep -rn "trim_messages_history\|compress_history_tags" bridge/` returns zero hits.
- `BaseSession.__init__` now picks `default_context_win` based on model name (deepseek gets a larger window). Internal.
- `_stream_with_retry` raises on empty response instead of returning silently. Internal — improves error surfacing but `BaseSession` callers see the same `requests.ConnectionError` they already handle.
- `self.history = []` initialization preserved on line 517.

The list-attribute contract Galley depends on (`agent.llmclient.backend.history` is a mutable list of message dicts we can read for restore and append to for command injection) is unchanged.

### Test matrix

`bridge/tests/` ran via `.venv/bin/python -m pytest` (Galley's own pytest venv):

```
GA at fc6b5ad (new upstream)  →  106 passed, 6 deselected in 0.14s
GA at 6bb3104 (previous baseline) →  106 passed, 6 deselected in 0.15s
```

Both pass identically — confirms backward compat (if a user hasn't pulled their GA, Galley still works) and forward compat (the new baseline works).

## Rejected alternatives

- **Skip the lift this cycle, ship v0.1 on 6bb3104**: JC explicitly asked to bundle it. Also reasonable because the lift was strictly additive — no risk surface to weigh against zero-effort upgrade.
- **Cherry-pick only the bridge-safe commits**: would require a separate Galley-vendored GA fork. Galley's design depends on stock GA — never deviate.
- **Don't fast-forward JC's local main**: would have left him 1 commit behind upstream and shown `你已自行升级` (false signal). Better to keep his GA in sync with the baseline we just promoted.

## Open questions

None. Audit was clean, tests pass on both sides, JC's GA is in lockstep with the new baseline.

## Next

- Bundle into the v0.1 release notes alongside the Onboarding + Python probe fixes.
- Next baseline check: triggered when (a) JC reports a new GA feature not working, (b) before Galley v0.2 cut, or (c) upstream ships a critical fix.
