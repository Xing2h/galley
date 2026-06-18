# Supervisor SOP Lite + Reference Split

**Date:** 2026-06-18
**Status:** Done
**Related:** [Supervisor SOP](../integrations/galley-supervisor-sop.md), [Supervisor reference](../integrations/galley-supervisor-reference.md), [Agent API](../agent-api.md)

## Context

After dogfooding Galley Supervisor over Feishu, the SOP had grown into a
775-line mixed artifact: copy-first operating prompt, command cheatsheet,
Project / Goal playbook, error table, and product explanation all in one file.
That made it reliable as documentation but heavy as something users paste into
another Agent.

We compared the shape with official SOPHub examples. Most official operational
SOPs are short trigger cards, while only framework-level workflows such as
DeepResearch need long-form structure. Galley Supervisor should follow the
short-copy / long-reference split.

## Decisions

- Keep `docs/integrations/galley-supervisor-sop.md` as the **copy-first Lite
  SOP** used by Settings -> Agent and managed IM reference materialization.
- Move command tables, advanced Project / Goal examples, origin details, and
  error-recovery expansions into
  `docs/integrations/galley-supervisor-reference.md`.
- Keep `session wait` and the rule "timeout is not task failure" in the Lite
  SOP, because that is the main IM/Supervisor safety fix.
- Update README and docs index to describe the split so humans know the copied
  SOP is intentionally lightweight.
- Keep `agent-api.md` as the stable schema contract. If SOP/reference disagree
  with the Agent API, the API wins.

## Outcome

- Lite SOP: 277 lines, focused on triggers, hard rules, CLI discovery, mode
  choice, hot paths, child prompt shape, errors, boundaries, and self-check.
- Reference: 376 lines, focused on detailed commands and advanced workflows.
- Settings / IM code paths still embed the same canonical SOP file, but now
  copy a shorter prompt into external Agents.

## Rejected

- **Leave the 775-line SOP as-is**: too much live-turn weight for IM and
  external Agents.
- **Delete advanced guidance entirely**: unsafe; maintainers and advanced
  Supervisor implementations still need the detailed command and Goal/Project
  reference.
- **Make `AGENTS.md` carry the split rationale**: `AGENTS.md` should stay a
  rule/routing document, not a change log.
