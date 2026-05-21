# v0.2 beta agent surface + historical-session restore dogfood

## Date / Status / Related

- **Date**: 2026-05-21
- **Status**: ✅ Dogfood pass. Historical sessions can be reopened and continued;
  new-session and historical-session model switching work; Settings Agent copy
  was simplified.
- **Related**:
  - [project status](../project-status.md)
  - [agent-api](../agent-api.md)
  - [Supervisor SOP](../integrations/galley-supervisor-sop.md)
  - [Session Close SOP](../session-close-sop.md)

## Context

This was a long dogfood session after the Rust Core / GUI / CLI refactor. The
main concern was whether previously released `v0.1.x` users could upgrade into
the refactored `v0.2.0-beta.1` client and keep using older sessions.

The user also reviewed the Settings -> Agent surface: Supervisor SOP copy,
command-line PATH copy, Agent API reference, and version positioning.

## Decisions

1. **Next release target is `v0.2.0-beta.1`**. Package metadata uses
   `0.2.0-beta.1`; the GitHub tag/release title uses `v0.2.0-beta.1`; release
   should be a beta prerelease and not marked Latest.
2. **Settings section name is `AGENT`**, not `INTEGRATION`. The surface is
   for trusted agents first; command-line enthusiasts are supported but not the
   primary audience.
3. **Supervisor SOP is copy-first**. Galley should not install SOP content into
   GenericAgent memory. The user copies the SOP and gives it to a trusted
   Agent, which can then help view, create, and manage Galley sessions.
4. **CLI is public Agent API**. The `galley` command and discovery file are for
   Agent / Supervisor automation over Galley Core, not a GUI-side SQLite
   shortcut.
5. **GUI / CLI must route through Rust Galley Core**. A proposed direct SQLite
   read for GUI recovery was rejected because it violates the architecture:
   GUI / CLI frontends -> Galley Core -> Runner -> GA subprocesses.
6. **`CLAUDE.md` stays short**. Global rules and doc routing live there;
   detailed instructions move into focused docs and devlog.
7. **Session close gets a durable SOP**. Future closeout trigger phrases such
   as "session close" or "按 SOP 收尾" should run the documented closeout
   checklist.

## Fixes

- Routed GUI startup/session persistence through Rust Core and fixed a stale
  project filter that hid historical sessions.
- Restored historical conversations through Core-backed message reads.
- Fixed model switching on the empty new-chat screen and on historical
  sessions, including persisted per-session selected LLM.
- Fixed continued prompts in historical sessions:
  - submit no longer silently drops when the bridge is spawning;
  - historical replay waits for `history_loaded`;
  - replay filters incomplete user-only rows so failed attempts do not poison
    GA history;
  - if dev/HMR leaves a stale runner/listener pair, the GUI restarts that
    session bridge and replays history before sending.

## Rejected alternatives

- **Direct GUI SQLite recovery** — rejected because it bypasses Galley Core and
  would weaken the dual-frontend architecture.
- **Installing SOP into GenericAgent memory** — rejected as too invasive and
  inconsistent with copy-first Agent integration.
- **Treating command-line PATH as required for SOP** — rejected. The Agent SOP
  uses the discovery file; installing the `galley` command is helpful but not
  required for the SOP path.
- **Proceeding after history replay timeout** — rejected after dogfood showed
  old sessions could still fail silently. Timeout now triggers bridge restart
  before the user message is sent.

## Open questions

- Windows smoke remains a release gate for `v0.2.0-beta.1`.
- Menubar / background-mode requirement for this beta is still a product
  release decision.
- Historical sessions with prior user-only failed rows remain readable; they
  are filtered out during replay rather than migrated away.

## Next

1. Commit the dogfood fixes and closeout docs.
2. Continue release-candidate dogfood in a fresh session.
3. Before tagging `v0.2.0-beta.1`, run the release verification set and Windows
   smoke or document the Windows caveat.
