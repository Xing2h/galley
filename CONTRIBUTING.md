# Contributing to Galley

Thanks for taking a look at Galley. The project is still pre-v1, so the most
useful contributions are focused fixes, clear bug reports, Windows/macOS smoke
results, documentation improvements, and small improvements that fit the
existing architecture.

## Start Here

Before changing code, read:

- [AGENTS.md](./AGENTS.md) for non-negotiable project rules
- [docs/README.md](./docs/README.md) for the documentation map
- [docs/engineering-workflow.md](./docs/engineering-workflow.md) for commands,
  repo layout, IPC rules, and git expectations
- [docs/architecture.md](./docs/architecture.md) for the system overview

## Local Development

Galley is a desktop client app. The normal development loop is:

```bash
pnpm --dir gui tauri dev
```

Useful checks:

```bash
cargo check --workspace
cargo test --workspace
pnpm --dir gui typecheck
pnpm --dir gui lint
git diff --check
```

`pnpm --dir gui dev` only starts the Vite web surface. It is useful for narrow
frontend work, but it is not full app verification.

## Architecture Rules

Keep these constraints intact:

- Galley must not modify GenericAgent files, memory, venv, PATH, or runtime
  internals.
- Galley Core stays localhost-only: Unix socket on macOS/Linux, named pipe on
  Windows. No TCP server or token auth.
- Rust Galley Core is authoritative for SQLite writes, session lifecycle,
  runner ownership, and command dispatch.
- The CLI JSON contract is stable. Read [agent-api](./docs/agent-api.md) before
  changing CLI output.

## Good First Contributions

- Reproduce and document a bug with exact OS, Galley version, and steps.
- Improve docs clarity or fix stale links.
- Add focused tests around existing behavior.
- Improve Windows smoke coverage using [windows-build-checklist](./docs/windows-build-checklist.md).
- Polish a small GUI interaction while matching the existing design system.

## Pull Request Expectations

- Keep changes scoped.
- Preserve unrelated dirty work.
- Add or update tests for risky behavior changes.
- Update the focused docs when changing a contract or workflow.
- Do not push large rewrites without a clear issue or discussion first.

## Where To Put Context

- Current project state: [project status](./docs/project-status.md)
- Product decisions: [PRD](./docs/PRD.md)
- Technical workflow: [engineering workflow](./docs/engineering-workflow.md)
- Architecture proof / grep gates: [architecture demo](./docs/architecture-demo.md)
- Historical decisions and rejected alternatives: [devlog](./docs/devlog/README.md)
