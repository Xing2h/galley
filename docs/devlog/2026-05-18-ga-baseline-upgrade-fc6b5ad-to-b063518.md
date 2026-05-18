# 2026-05-18 — GA baseline upgrade fc6b5ad → b063518

**Date / Status**: 2026-05-18 / committed to `feature/v0.1.1-bundled-python`, ships with v0.1.1-alpha.1
**Related**: [CLAUDE.md → GA Baseline](../../CLAUDE.md#ga-baseline) · [Baseline Upgrade Workflow](../../CLAUDE.md#baseline-upgrade-workflow) · [previous upgrade (6bb3104 → fc6b5ad)](2026-05-15-ga-baseline-upgrade-6bb3104-to-fc6b5ad.md)

## Context

JC raised the baseline alignment right before ship-tagging v0.1.1-alpha.1, per the workflow's "Galley 准备发版" trigger. 49 commits had accumulated upstream since 2026-05-15 — heaviest single jump since this project's baseline tracking began. Bulk of the commits are TUI v2 theme work + hive worker fixes + new TUI slash commands (`/cost` / `/review` / `/rename` / `/continue` / theme picker `Ctrl+T` etc), none of which touch the bridge layer.

Followed the workflow procedure from [CLAUDE.md → Baseline Upgrade Workflow](../../CLAUDE.md#baseline-upgrade-workflow) verbatim:

1. `git fetch upstream` → `upstream/main` at `b063518`
2. `git log fc6b5ad..upstream/main --oneline` → 49 commits
3. `git diff --stat` on the 4 interface-surface files: `agent_loop.py` (+6/-2), `agentmain.py` (+38/-13), `ga.py` (+5/-2), `llmcore.py` (+9/-3) — 60+/-20 lines total
4. Inspect each surface for breaking changes
5. Run `bridge/tests/` against new + old baseline
6. Update CLAUDE.md baseline reference + this devlog

JC's local `~/Documents/GenericAgent` left on `main` branch pointing at `fc6b5ad` — workflow explicitly opts against auto-pulling user's GA; he `git pull`s himself when he wants.

## Decisions

- **Lock to `b063518`** (upstream/main HEAD on 2026-05-18) as the new Galley-tested baseline.
- **Zero adapter changes needed in bridge** — every change to the four interface surfaces is either additive (new optional kwarg, new payload field) or affects code paths the bridge doesn't touch.
- **Ship with v0.1.1-alpha.1** as a single bundled change — baseline upgrade lands in its own commit (per workflow's "独立成一个 commit，方便回滚") but pulls into the same release tag.

## Audit of the four interface surfaces

| Surface | File | Change | Verdict |
|---|---|---|---|
| `BaseHandler` 3 callbacks + `dispatch` signature | `agent_loop.py` | `agent_runner_loop` adds optional kwarg `yield_info=False` (additive); BaseHandler unchanged | **safe** — bridge doesn't pass `yield_info`, default behavior preserved |
| `display_queue` payload + `GenericAgentHandler` import path | `agentmain.py` | `display_queue` items now carry extra `turn` / `outputs` fields alongside `next` / `done` / `source`; new `GenericAgent.show_mode = 'text'` internal attr; CLI banner; `max_turns 70 → 80` | **safe** — bridge's `_start_progress_drain` reads `next` / `done` / `source` only; new fields are ignored. `show_mode` not consulted. Import path unchanged |
| `agent._turn_end_hooks` extension point + `GenericAgentHandler` core | `ga.py` | Internal next_prompt generation + summary length cap + plan-mode turn threshold (`90 → 120`) | **safe** — `_turn_end_hooks` dict unchanged; dispatch unchanged; callbacks unchanged |
| `llmclient.backend.history` list semantics | `llmcore.py` | `_record_usage` adds output-token print (logging only); `MixinSession.model` becomes a property returning `_sessions[_cur_idx].model` instead of a fixed init-time attr (issue #394 fix) | **safe** — bridge's `_safe_get_model` reads `client.backend.model` (underlying session's attribute), not `MixinSession.model`. The property's dynamic behavior on MixinSession doesn't propagate to `backend.model` |

The payload-field addition on `agentmain.py` (#2 above) is the only thing worth dwelling on. GA now puts `{'next': delta, 'source': src, 'turn': N, 'outputs': [...]}` instead of just `{'next': delta, 'source': src}`. Bridge's drain loop does `if "next" in item: delta = item["next"]` — it doesn't iterate keys or assert the shape — so extra fields pass through harmlessly. If the bridge ever wanted to use `turn` (per-step elapsed display? cf. the Phase 3 "TurnMarker 显示该步耗时" discussion we deferred earlier in the v0.1.1 session) the data is now natively available.

## Test matrix

```
.venv/bin/python -m pytest bridge/tests/
  → 106 passed, 6 deselected (against b063518 / new baseline)
  → 106 passed, 6 deselected (against fc6b5ad / old baseline)
```

Both ends clean. Forward compat: bridge runs against the new baseline. Backward compat: bridge running against a user-pinned old baseline (still on `fc6b5ad`) is unaffected — same code path on both.

## Rejected alternatives

- **Auto-pull user's local GA** to `b063518` — workflow explicitly opts against this; JC controls his own GA `git pull` cadence. Settings → Runtime → "GenericAgent 版本" will surface 「你已自行升级 / 已对齐」states organically based on whether his local SHA matches the new baseline pin.
- **Adopting `yield_info=True`** in bridge to consume per-turn `{'turn': N}` markers from the new `agent_runner_loop` — out of scope for this baseline upgrade. The bridge already gets `turn_end_callback` from `_turn_end_hooks` which is canonical; the in-stream marker would be redundant unless we want sub-turn elapsed timing (the deferred Phase 3 item).
- **Holding the baseline at `fc6b5ad`** for v0.1.1-alpha.1 — would have meant Settings → "你已自行升级" badge would light up for *every* user since 2026-05-15, defeating its purpose. Workflow's "Galley 准备发版默认升一次" exists precisely for this case.

## Open questions

- **Tracking `turn` field** in bridge for finer-grained progress UI (cross-link to "[3] settled TurnMarker 显示该步耗时" we deferred earlier this session for cost/value reasons). Now that GA emits `turn` natively in `display_queue` payloads, the Option-C in-memory-only approach gets cheaper (no need to compute from event timestamps — read directly from payload). But still on hold pending real user demand.
- **`max_turns` ceiling raise (70 → 80)** doesn't affect bridge; user-facing implication is GA will retry more in pathological loops before bailing. No action.

## Next

- Land baseline upgrade as a standalone commit on `feature/v0.1.1-bundled-python` named per workflow: `Baseline upgrade fc6b5ad → b063518: 49 commits`
- Ship with v0.1.1-alpha.1 release notes — no user-visible behavior change to call out beyond the baseline-pin SHA bump itself
