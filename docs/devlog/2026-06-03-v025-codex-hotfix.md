# 2026-06-03 - v0.2.5 Codex backend hotfix

## Date / Status / Related

- Date: 2026-06-03
- Status: `v0.2.5` published as the stable GitHub Latest and promoted to the
  default update channel.
- Related:
  - [Project status](../project-status.md)
  - [Release / update SOP](../release-update-sop.md)
  - [ChatGPT / Codex OAuth core](../../core/src/codex_oauth.rs)
  - [Managed GA llmcore](../../managed-ga/code/llmcore.py)

## Context

`v0.2.4` shipped the ChatGPT / Codex managed model provider, but real dogfood
found that the first implementation treated the Codex backend too much like the
public Responses API. OAuth itself and Codex CLI credential import worked, but
the automatic model probe failed on backend-specific request validation.

The failures were sequential and useful: first `input` had to be a list, then
`stream` had to be `true`, then `max_output_tokens` was rejected as unsupported.
After removing the incompatible parameter and forcing Codex streaming, local
dogfood confirmed Codex CLI import, model test, and a managed-GA conversation.
The macOS DMG was installed and smoke-tested before the GitHub Release was
published. After publish, the update channel was promoted to `v0.2.5`, the
default endpoint was renamed to `updates/stable/latest.json`, and
`updates/beta/latest.json` was kept as a legacy alias for older builds.

## Decisions

- Release `v0.2.5` as a narrow stable hotfix instead of waiting for a larger
  feature release.
- Keep the ChatGPT / Codex provider in managed-GA only; this fix does not
  change Attach GA boundaries.
- Treat the Codex backend as its own protocol variant, not a generic OpenAI
  Responses endpoint.
- Hide the stream toggle in Codex advanced settings because Codex requires
  streaming and the switch would imply a control that cannot actually work.
- Omit `max_output_tokens` for Codex backend requests while leaving it available
  for ordinary OpenAI-compatible Responses providers.

## Verification

- `cargo test -p galley-core codex_probe_payload`
- `cargo check --workspace`
- `.venv/bin/python -m pytest runner/tests/test_workbench_bridge.py`
- `.venv/bin/python -m mypy runner/managed_runtime.py`
- `pnpm --dir gui typecheck`
- `pnpm --dir gui lint`
- `git diff --check`
- Manual dogfood: Codex CLI login import succeeded, model probe succeeded, and a
  managed-GA conversation completed using the ChatGPT / Codex provider.
- Manual install smoke: macOS DMG install completed without reported issues
  before publishing `v0.2.5`.
- Update channel: `promote-update-channel.yml` completed for `v0.2.5`, and
  `scripts/check-update-channel.mjs --cache-bust` confirmed version `0.2.5` for
  macOS Apple Silicon, macOS Intel, and Windows x64.
- Endpoint rename: stable and legacy beta manifests both verify as `0.2.5`;
  `GALLEY_UPDATER_ENDPOINT` now points at `updates/stable/latest.json`.

## Rejected alternatives

- Reusing the public Responses payload unchanged: the backend rejected multiple
  standard-looking parameters, so the request shape must be Codex-specific.
- Keeping `stream` configurable: users should not see an option that produces a
  known invalid Codex request.
- Shipping the fix only after more unrelated polish: `v0.2.4` is already Latest,
  and the broken path is a newly promoted setup path.

## Next

Monitor the app-update path from installed `v0.2.4` builds and watch for
Windows reports after the updater manifest starts offering `v0.2.5`.
