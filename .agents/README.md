# Galley Agent Skills

This directory contains skill packages for Codex / Agents-style runtimes.

## Skills

| Skill | Purpose |
|---|---|
| [`galley-supervisor`](./skills/galley-supervisor/) | Let an agent operate Galley through the local `galley` CLI. |

## Notes

- These files are distribution artifacts for agent runtimes, not Galley runtime
  source code.
- The canonical Supervisor SOP remains
  [`docs/integrations/galley-supervisor-sop.md`](../docs/integrations/galley-supervisor-sop.md);
  advanced details live in
  [`docs/integrations/galley-supervisor-reference.md`](../docs/integrations/galley-supervisor-reference.md).
- Keep provider-specific variants separate from `.claude/skills/` so audit
  identity strings stay clear in Galley's action history.
