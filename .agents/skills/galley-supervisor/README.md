# galley-supervisor — Codex / Agents Skill

A Codex / Agents skill that lets an agent remote-manage your local Galley
desktop orchestrator through the `galley` CLI: list / open / send / archive /
move sessions, switch LLMs, inspect status, and delegate work from an agent
conversation.

> **Need Galley first.** This skill assumes you have Galley installed and
> have launched it at least once (so the CLI discovery file at
> `~/.config/galley/cli-path` exists). Get it at
> https://github.com/wangjc683/galley.

## Install

Use the install location expected by your agent runtime. For local development,
you can symlink or copy this skill from the repo.

### Symlink (recommended if you cloned this repo)

```bash
AGENT_SKILLS_DIR="$HOME/.codex/skills"
mkdir -p "$AGENT_SKILLS_DIR"
ln -sfn "$(pwd)/.agents/skills/galley-supervisor" "$AGENT_SKILLS_DIR/galley-supervisor"
```

Re-syncs automatically when you `git pull`.

### Copy

```bash
AGENT_SKILLS_DIR="$HOME/.codex/skills"
mkdir -p "$AGENT_SKILLS_DIR"
cp -R .agents/skills/galley-supervisor "$AGENT_SKILLS_DIR/galley-supervisor"
```

Re-copy after `git pull` to pick up upstream changes.

### Verify

Open a new agent session and check the runtime's available skills. The
`galley-supervisor` skill should appear in the list.

## Usage

Once installed, trigger phrases like these load the skill automatically:

- 「帮我看看 Galley 现在跑什么」
- 「开个 Galley session 跑 X 任务」
- 「把那个 session archive 一下」
- "what's running in Galley?"
- "spin up a Galley session that does X"
- "switch the LLM on session sess_xxx to claude-sonnet-4-6"

The skill resolves the CLI path from the discovery file, runs the
appropriate `galley` subcommand, classifies any error by exit code, and
asks for confirmation before destructive operations (archive / stop /
project delete).

## Files

| Path | What |
|---|---|
| `SKILL.md` | The skill body the agent runtime reads on trigger. |
| `references/galley-supervisor-sop.md` | Copy-first Lite Supervisor SOP adapted from `docs/integrations/galley-supervisor-sop.md` with this skill's agent identity. |
| `references/galley-supervisor-reference.md` | Detailed command and advanced workflow reference adapted from `docs/integrations/galley-supervisor-reference.md` with this skill's agent identity. |

## Schema + stability

This skill targets **Galley CLI schema_version=1** (frozen for the v0.2.x line).
Schema is additive-only inside v1; breaking changes bump to v2 and will
ship as a new skill version.

## Updates

The canonical SOP lives in [`docs/integrations/galley-supervisor-sop.md`](https://github.com/wangjc683/galley/blob/main/docs/integrations/galley-supervisor-sop.md)
and the full reference lives in [`docs/integrations/galley-supervisor-reference.md`](https://github.com/wangjc683/galley/blob/main/docs/integrations/galley-supervisor-reference.md).
When either updates, the `references/` copies in this skill are re-synced and
adapted to `codex-skill-galley-supervisor/v1` — pull the latest skill version.

## See also

- [Galley CLI agent-api](https://github.com/wangjc683/galley/blob/main/docs/agent-api.md) — full command schema
- [Galley PRD §11](https://github.com/wangjc683/galley/blob/main/docs/PRD.md) — CLI surface
- [Galley architecture principles](https://github.com/wangjc683/galley/blob/main/AGENTS.md) — why Galley is localhost-only and your data never leaves your machine
