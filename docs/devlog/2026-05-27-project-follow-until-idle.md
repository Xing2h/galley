# Project Follow Until Idle

**Date:** 2026-05-27  
**Status:** Implemented  
**Related:** `cli/src/main.rs`, `docs/agent-api.md`, `docs/integrations/galley-supervisor-sop.md`

## Context

Dogfooding the Settings -> Agent example "use Galley to plan a Shanghai to
Hangzhou weekend trip" proved that Project-based batch orchestration works:
one Supervisor can create a Project, split the task into traffic / lodging /
itinerary sessions, and synthesize the results.

The rough edge was monitoring. `project follow` subscribed to runner streams,
but managed runner processes can stay alive after a turn finishes. The
Supervisor had to interrupt the stream manually and run `project show` before
synthesizing.

## Decisions

- Add `project follow --until-idle` for batch supervision. It watches live
  events and exits after a quiet window once the Project has no
  `connecting`, `running`, or `waiting_approval` sessions.
- Add `project follow --final-show` so the final Project snapshot can be
  emitted before the end frame.
- Add `followState` to Project follow snapshots. This makes an initially
  `idle` persisted status less misleading by saying the command is still
  checking live events.
- Keep automatic synthesis out of the CLI. Galley should provide reliable
  monitoring and context; the Supervisor Agent should merge results.

## Rejected Alternatives

- Add a formal `starting` session status now: rejected because it expands the
  status model across GUI, CLI, docs, and downstream agents before the smaller
  snapshot hint has been tested.
- Make default `project follow` auto-exit: rejected to preserve the existing
  live subscription meaning for callers who want an open stream.
- Add `project summarize`: rejected because summary quality depends on the
  Supervisor model and task context.

## Follow-Up

Watch real Supervisor batches to see whether `--until-idle` needs a user-tuned
timeout or a "report waiting approval" mode. For now, waiting approval remains
an active state.
