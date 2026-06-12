# 2026-06-12 - GA upstream upgrade ba19018a -> 0def7441

**Date / Status / Related**

- Date: 2026-06-12
- Status: working baseline updated; not yet in a published Galley release
- Related: [GA baseline](../ga-baseline.md), [managed GA patch stack](../../managed-ga/patches/manifest.md), [Browser Control onboarding](./2026-06-10-topbar-and-browser-control-onboarding-polish.md)

**Context**

JC asked for a GA upstream baseline refresh to the latest official
`lsdefine/GenericAgent` commit. The audited head was
`0def744157916f0c88da69f710941e4c408b3768`
(`fix responses codex client metadata`), a 23-commit delta from Galley's
previous working baseline `ba19018a6d84df7f530275fa4b9b0858843e932a`.

The external / attach bridge contract was low risk: `agent_loop.py`,
`agentmain.py`, and `pyproject.toml` did not change. The meaningful upstream
changes for Galley were in `ga.py`, `llmcore.py`, Browser Control extension
files, TUI/frontends, and a new `plugins/project_mode.py` plus
`memory/project_mode_sop.md`.

**Decisions**

- Upgrade the working GA baseline to
  `0def744157916f0c88da69f710941e4c408b3768`.
- Keep the upstream Responses `client_metadata` addition and refresh Galley's
  managed Codex backend patch on top of it, preserving credential IPC, Codex
  headers, forced streaming, `store=false`, and the `max_output_tokens` guard.
- Keep upstream Project Mode files in the managed payload, but patch the new
  `plugins/project_mode.py` temp root through `GALLEY_GA_STATE_ROOT`; managed
  runtime code remains replaceable, user state remains outside `managed-ga/code`.
- Do not carry upstream `ga.py`'s implicit
  `os.startfile("https://example.com")` no-tab behavior into Galley's managed
  runtime. Galley already has an explicit Browser Control test-page action in
  Settings, and surprise-opening a web page from an agent tool is the wrong
  ownership boundary for a desktop shell.
- Keep Browser Control recovery as a Galley patch: extension connected/no-tab
  status, MV3 reconnect timing, and clearer user-facing error messages still
  belong to Galley's desktop integration layer.
- Extend managed build normalization to `.gitignore` and keep patch files free
  of whitespace-only context lines so the generated payload and the patch stack
  both pass `git diff --check`.

**Rejected Alternatives**

- Accepting upstream's implicit no-tab opener because it helps plugin testing:
  useful for upstream standalone GA, but in Galley the user-visible path is the
  explicit Browser Control repair/test-page UI. Implicit browser side effects
  make the system feel less predictable.
- Testing real e2e against the clean source checkout without `mykey.py`: it
  correctly failed before spending model quota because GA had zero configured
  LLMs. The real model run used a temporary checkout with `mykey.py` copied from
  the local GA checkout; the external GA checkout itself was not modified.
- Treating upstream Project Mode temp paths as harmless: managed GA must not
  write operational state inside replaceable `managed-ga/code`, so the new
  plugin needed the same state-root rule as older managed patches.

**Validation**

- Clean-source patch chain replay with `git apply --whitespace=nowarn --recount`
- `node scripts/check-managed-ga-payload.mjs`
- `GA_PATH=/tmp/galley-ga-upgrade-source.t5Alzc .venv/bin/python -m pytest runner/tests/ -m 'not e2e'`
- `.venv/bin/python -m mypy runner`
- `.venv/bin/ruff check runner`
- `GA_PATH=/tmp/galley-ga-e2e.QvM93c BRIDGE_PYTHON=python3 E2E_LLM_NAME=glm-5.1 .venv/bin/python -m pytest runner/tests/ -m e2e -vv`
- `./scripts/bundle-python.sh mac-x64`
- `./scripts/check-bundled-python-managed-ga.sh`
- `pnpm --dir gui typecheck`
- `pnpm --dir gui lint`
- `cargo check --manifest-path core/Cargo.toml`
- `cargo check --manifest-path cli/Cargo.toml`
- `git diff --check`

**Open Questions**

- Upstream Project Mode is now bundled as managed GA code, but Galley should not
  expose Project Mode as a first-class product surface until there is a concrete
  workflow that beats Galley's existing Project / Goal model.
- If upstream later provides an explicit Browser Control extension status API
  or credential seam equivalent to Galley's managed patches, retire the local
  patches instead of letting managed GA drift into a fork.

**Next**

Before publishing the next Galley release, run the normal release gates and a
desktop dogfood pass in Tauri runtime. The Browser Control visual flow should be
accepted in the real WebView rather than a standalone Vite browser.
