# 2026-06-15 - knowledge sync rules

## Date / Status / Related

- Date: 2026-06-15
- Status: Session Close SOP updated
- Related:
  - [Session Close SOP](../session-close-sop.md)
  - [docs index](../README.md)
  - [AGENTS.md](../../AGENTS.md)

## Context

JC reviewed an external `neat-freak` skill for end-of-session documentation and
memory cleanup. The useful core was not the exact checklist, but the product
principle behind it: project knowledge should be edited, reconciled, and
deduplicated instead of appended as a session diary.

Galley already has a short agent constitution, focused docs, and a devlog. The
risk was adding another broad ritual that makes small closeouts feel expensive
or pushes history into `AGENTS.md`.

## Decisions

1. **Adopt the principle, not the whole external skill**. Galley uses a
   lightweight Knowledge Sync section inside Session Close SOP instead of a
   separate large skill.
2. **Separate closeout from knowledge sync**. If the user asks to sync or tidy
   project knowledge without ending the session, agents run only the knowledge
   sync portion and do not commit or close the session.
3. **Route facts by audience**:
   - `AGENTS.md` keeps startup rules and routing links only.
   - Focused docs under `docs/` hold current architecture, API, runtime,
     release, and workflow facts.
   - `docs/devlog/` holds why a decision was made and what was rejected.
   - Completed task detail with no future use stays in git history.
4. **Prefer scoped audit over mechanical full-doc sweeps**. Start from the
   changed surface and affected audience; read more when the impact requires
   it.
5. **No-op is allowed**. A knowledge sync can conclude that no docs need
   editing after checking for drift.

## Rejected alternatives

- **Install the external skill wholesale** -- too broad for Galley's current
  docs. It encourages mechanical enumeration of every markdown file even when
  the changed surface is narrow.
- **Trigger full cleanup on bare "tidy" / "整理"** -- too easy to surprise the
  user with a heavy process. Galley requires an explicit sync, tidy, reconcile,
  or closeout intent.
- **Force every sync to edit files** -- wrong incentive. The goal is accurate
  knowledge, not visible churn.
- **Put this history in `AGENTS.md`** -- rejected because agent startup should
  see the rule and routing, not the story of how the rule was chosen.
- **Write to global Codex / agent configuration** -- project-specific workflow
  belongs in this repo unless JC explicitly asks for a global rule.

## Open Questions

- Whether future release or refactor phases need task-specific knowledge-sync
  checklists. For now, the generic routing table is enough.
- Whether Galley should ever package this as a reusable local skill. Current
  evidence says the SOP is simpler and more visible.

## Next

Use the updated Session Close SOP for future "sync docs", "整理知识库", and
"session close" requests. Keep `AGENTS.md` short; put rationale here when a
knowledge-process decision matters.
