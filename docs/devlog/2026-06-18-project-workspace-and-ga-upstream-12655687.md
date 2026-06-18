# 2026-06-18 - Project Workspace and GA upstream upgrade 0def7441 -> 12655687

## Date / Status / Related

- Date: 2026-06-18
- Status: implemented in current worktree
- Related:
  - [GA baseline](../ga-baseline.md)
  - [Project rootPath rollback](./2026-05-14-project-rootpath-rollback-ga-memory-coupling.md)
  - Upstream GA `12655687aa964ea541bb0606c0051700e76991ca`

## Context

Official GenericAgent upstream now includes shared Workspace support:
`frontends/workspace_cmd.py`, TUI v2/v3 `/workspace` integration, and per-agent
Project Mode activation via `_ga_project_mode_name`.

Galley previously removed Project `rootPath -> cwd` because it broke GA memory
and SOP lookup. The new upstream Workspace gives us a safer route: Project
folder binding can activate GA Project Mode without moving the runner process
cwd away from the GA/state root.

## Decisions

- Project Workspace returns as opt-in behavior, not old rootPath-as-cwd:
  GUI selection of a folder sets `rootPath + workspaceEnabled`; API / CLI
  callers must set `workspaceEnabled` explicitly.
- Legacy `rootPath` rows remain inert. Migration adds
  `projects.workspace_enabled INTEGER NOT NULL DEFAULT 0`.
- CLI requires `--enable-workspace` alongside `--root-path`.
- Runner spawn passes `--workspace-root` only when the Project has both
  `workspaceEnabled` and `rootPath`.
- Bridge never maps Project root to `--cwd`.
- Managed GA baseline is upgraded to `12655687`; the managed patch stack now
  routes upstream Workspace temp/registry/anchor state through
  `GALLEY_GA_STATE_ROOT`.
- External GA support is conservative: Galley only activates Workspace when a
  safe state-root path is available and outside the external GA checkout.

## Rejected Alternatives

- Restore all-runtime Project `rootPath -> cwd`: this repeats the May 14 memory
  failure mode.
- Make every stored `rootPath` activate Workspace after migration: surprising
  for existing users and supervisors.
- Use upstream Workspace fallback that writes under an external GA checkout:
  violates attach-mode non-modification rules.
- Hot-swap Workspace inside a running GA process: useful later, but not needed
  for v1 and riskier than next-spawn semantics.

## Open Questions

- Should external GA expose a public state-root / profile env var so Galley can
  safely enable Workspace more often?
- Should live sessions show a small "restart to apply Project folder" affordance
  after Project folder changes?
- Should `project_memory.md` creation have a first-run explanation in GUI, or
  stay a visible upstream Workspace convention?

## Next

- Dogfood managed session creation in a Project with Workspace enabled.
- Confirm `project_memory.md` lands in the real project root while GA memory/SOP
  reads still come from managed state.
- Revisit external GA enablement only if upstream formalizes a safe state-root
  seam.
