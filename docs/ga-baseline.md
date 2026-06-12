# GenericAgent Baseline

> Maintainer-facing document. Contributors touching GenericAgent integration
> should read this; most users do not need it.

Galley integrates with GenericAgent in two different ways:

- **External / attach GA**: user-owned GenericAgent. Galley audits
  compatibility but never upgrades or modifies that checkout.
- **Managed / bundled GA**: Galley-owned GenericAgent runtime. Galley vendors
  the audited upstream commit and reapplies its managed-runtime patch stack.

The baseline records the upstream GenericAgent commit that both paths have been
audited against.

## Current Baseline

Locked commit: `0def744157916f0c88da69f710941e4c408b3768`

- Source: `lsdefine/GenericAgent` upstream `main`
- Date audited: 2026-06-12
- Previous baseline: `ba19018a6d84df7f530275fa4b9b0858843e932a`
- Delta: 23 commits
- Result: no external bridge protocol or dependency break; `agent_loop.py`,
  `agentmain.py`, and `pyproject.toml` did not change. Managed runtime needed
  refreshed Project Mode state-root coverage, Browser Control recovery context,
  and ChatGPT / Codex patch context because upstream moved nearby `ga.py` and
  `llmcore.py` code. Galley keeps Browser Control test-page launching as an
  explicit UI action instead of inheriting upstream's implicit
  `example.com` opener from GA runtime.
- Devlog: [GA upstream upgrade ba19018a -> 0def7441](./devlog/2026-06-12-ga-upstream-upgrade-ba19018a-to-0def7441.md)

Relevant compatibility notes:

- `agent_loop.py`, `agentmain.py`, and `pyproject.toml`: no diff in this range.
  The dispatch / hooks surface and bundled dependency list Galley audits did
  not move.
- `ga.py`: upstream changed Browser Control startup to wait longer and open
  `https://example.com` when no tab appears. Managed mode preserves Galley's
  non-interactive `code_run` stdin close and Browser Control recovery
  diagnostics, but does not keep the implicit page opener.
- `llmcore.py`: upstream improved empty-response failover, Responses API Codex
  client metadata, read timeout defaults, and native OpenAI user-agent handling.
  Galley's ChatGPT / Codex managed backend remains a managed patch because it
  is a Galley credential IPC contract.
- `plugins/project_mode.py`: upstream added a default-loaded Project Mode
  plugin. Managed mode routes its activation anchor and project memory files
  through `GALLEY_GA_STATE_ROOT` so user state never lands in the shipped code
  payload.
- `frontends/continue_cmd.py`, `frontends/model_cmd.py`,
  `frontends/plan_state.py`, and `frontends/tuiapp_v2.py`: upstream shipped
  TUI `/continue`, `/model`, `/effort`, tool-card, and plan-card updates. These
  are bundled in managed GA but do not move Galley's attach bridge contract.
- `pyproject.toml`: no dependency diff in this range; bundled Python
  dependencies did not need changes.

## Contract Surface

When auditing a GenericAgent upgrade, focus on these surfaces:

1. `BaseHandler.dispatch` signature and generator protocol
2. Whether `BaseHandler.dispatch` calls callbacks or `plugins.hooks`
3. Galley's `WorkbenchHandler.dispatch` approval gate before `super()`
4. `BaseHandler.turn_end_callback`
5. `agent._turn_end_hooks`
6. `agentmain.GenericAgentHandler` import path
7. `llmclient.backend.history` read/write semantics
8. `agent.list_llms()` behavior

Galley may read GenericAgent public APIs and stable in-memory objects. Galley
must not write GenericAgent source, memory, venv, PATH, or runtime state.

## Upgrade Triggers

Upgrade is event-driven, not calendar-driven.

- Before a Galley minor or patch release, normally audit and bump the baseline.
- If users report that a new GenericAgent behavior does not work in Galley,
  audit immediately.
- If upstream ships a critical stability or security fix, audit immediately.
- Do not upgrade just because time has passed.

## Upgrade Procedure

1. Lock the official upstream target SHA. Do not use floating `upstream/main`
   after this point:

```bash
git ls-remote https://github.com/lsdefine/GenericAgent.git refs/heads/main
```

2. Prepare a clean source checkout at the target SHA. Do not build managed GA
   from a dirty user checkout. A local temporary clone is fine:

```bash
git clone ~/Documents/GenericAgent /tmp/galley-ga-upgrade
git -C /tmp/galley-ga-upgrade checkout <target_sha>
git -C /tmp/galley-ga-upgrade status --short
```

3. Review the external / attach integration surface:

```bash
git -C /tmp/galley-ga-upgrade log <current_baseline>..<target_sha> --oneline
git -C /tmp/galley-ga-upgrade diff <current_baseline>..<target_sha> -- \
  agent_loop.py ga.py agentmain.py llmcore.py pyproject.toml
```

4. If an interface changed, prefer runtime feature detection over hard-binding
   to a single GenericAgent version. `inspect.signature` is the preferred
   pattern for Python callback signature drift.

5. Rebase the managed runtime only after the external audit is understood:

```bash
cd ~/Documents/genericagent-webui
# update managed-ga/manifest.json upstream.commit / upstream.auditedAt first
./scripts/build-managed-ga.sh /tmp/galley-ga-upgrade
node scripts/check-managed-ga-payload.mjs
```

Then inspect the managed patch stack semantically, not just mechanically:

- Did every patch apply?
- Did upstream add new writes to `memory/`, `sop/`, `skills/`, `temp/`, or
  `model_responses/` that bypass `GALLEY_GA_STATE_ROOT`?
- Did upstream add an official state-root/profile option that should replace a
  Galley patch?
- Did upstream rename a key that Galley's managed model config emits?

6. Run the compatibility matrix:

```bash
GA_PATH=/tmp/galley-ga-upgrade \
  .venv/bin/python -m pytest runner/tests/ -m 'not e2e'

# Optional when spending model quota is acceptable:
GA_PATH=/tmp/galley-ga-upgrade \
  BRIDGE_PYTHON=<python-with-ga-deps> \
  .venv/bin/python -m pytest runner/tests/ -m e2e
```

7. Audit bundled Python dependencies and run the bundled runtime smoke:

```bash
./scripts/bundle-python.sh mac-x64
./scripts/check-bundled-python-managed-ga.sh
```

If `[project.dependencies]` changed, update `scripts/bundle-python.sh` before
running the bundle script. `bundle-python.sh` already invokes the bundled
managed-GA smoke; run `check-bundled-python-managed-ga.sh` again when checking an
already-generated bundle without rebuilding it. The smoke must verify
`managed-ga/code`, not `~/Documents/GenericAgent`.

8. Start Galley dev mode and run a real multi-step task in both runtime modes
   when possible:

- External GA: streaming, thinking state, approvals, tool dispatch, LLM display.
- Managed GA: model config injection, streaming, tools, state under app data,
  restart / restore behavior.

9. Update this document with the new hash, date, delta summary, and devlog link.

10. Write a devlog entry:

```text
docs/devlog/YYYY-MM-DD-ga-upstream-upgrade-<old>-to-<new>.md
```

11. Keep the upstream upgrade as an independent commit when possible. If the
    upgrade forces a Galley adapter or packaging guard, include that adapter in
    the same branch and document the product impact.

## Bundled Python Dependency Audit

Galley releases bundle CPython plus the GenericAgent core runtime dependencies.
Every baseline upgrade must check GenericAgent `pyproject.toml`:

- If `[project.dependencies]` changes, update `scripts/bundle-python.sh`.
- Rebuild bundled Python for release targets.
- Run `scripts/check-bundled-python-managed-ga.sh` against the generated
  bundle. Managed GA must not depend on the maintainer's `.venv` or external
  `~/Documents/GenericAgent` checkout.
- `optional-dependencies` for GenericAgent UI/frontends are not automatically in
  Galley scope. Galley only bundles frontend deps when a managed product
  surface owns that frontend.

Current bundled GenericAgent core deps:

- `requests`
- `beautifulsoup4`
- `bottle`
- `simple-websocket-server`
- `aiohttp`
- `qrcode[pil]` (managed WeChat IM Supervisor)
- `pycryptodome` (managed WeChat IM Supervisor)
- `python-dotenv` (common external-GA `mykey.py` compatibility)

Runtime packaging details live in [desktop runtime](./desktop-runtime.md).

## Things Galley Does Not Do

- Galley does not automatically upgrade a user's GenericAgent checkout.
- Galley does not prompt users to pull GenericAgent just because upstream moved.
- Galley does not policy-manage GenericAgent's release cadence.
- The Settings GA Version state is informational: aligned / user has upgraded /
  user has older checkout.
