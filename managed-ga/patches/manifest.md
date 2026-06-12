# Managed GA Patch Stack

Patch stack id: `galley-managed-ga-patches-v1`

Last replay verified: `2026-06-12` against upstream
`0def744157916f0c88da69f710941e4c408b3768`.

Current patches:

| Patch | Upstream files | Reason | Rebase risk | Removal condition |
|---|---|---|---|---|
| `0001-managed-state-root.patch` | `agentmain.py`, `ga.py`, `llmcore.py`, `frontends/continue_cmd.py`, `plugins/project_mode.py` | Keep Galley-managed user state under `Application Support/app.galley/managed-ga-state` instead of the shipped code payload, including model response logs, long prompt temp files, `/continue` cache, and Project Mode anchors / memory files. | Medium: upstream may rename state paths, model response logging, continue-session cache paths, or project-mode storage paths. | Remove when GenericAgent supports an explicit state root / profile path upstream. |
| `0002-repair-windows-path-tool-json.patch` | `llmcore.py` | Keep managed GA tolerant when models copy Windows paths into `path` / `file_path` / `filepath` tool JSON fields with raw backslashes or doubled quotes. | Low: touches only fallback text-tool JSON parsing for path fields. | Remove when GenericAgent upstream normalizes Windows path values or handles these malformed tool JSON cases. |
| `0003-normalize-asset-path-joins.patch` | `agentmain.py`, `ga.py` | Join managed GA bundled asset paths with platform path segments so Windows verbatim paths never mix `\\?\` with `/`. | Low: only wraps existing `assets` reads behind an `asset_path` helper. | Remove when upstream stops using slash-containing asset path strings under `script_dir`. |
| `0004-managed-wechat-state-paths.patch` | `frontends/wechatapp.py` | Let Galley's managed IM launcher keep WeChat token and temp files under Galley managed state instead of `~/.wxbot` / bundled code paths. | Low: two path constants near module startup. | Remove when upstream WeChat frontend supports explicit token/temp paths. |
| `0005-code-run-noninteractive-stdin.patch` | `ga.py` | Keep managed `code_run` non-interactive by closing child-process stdin, avoiding inherited runner IPC stdin handles that can block Python subprocesses on Windows. | Low: touches only `code_run` subprocess creation. | Remove when GenericAgent upstream closes stdin for non-interactive tool execution. |
| `0006-managed-browser-control-recovery.patch` | `TMWebDriver.py`, `ga.py`, `assets/tmwd_cdp_bridge/background.js`, `assets/tmwd_cdp_bridge/content.js` | Preserve Galley's managed Browser Control recovery semantics: extension-connected/no-tabs diagnostics, page wake-up messages, and MV3 service-worker keepalive / fast reconnect behavior. | Medium: upstream frequently touches the browser bridge service-worker loop. | Remove when upstream exposes equivalent extension status and recovery hints. |
| `0007-managed-codex-backend.patch` | `llmcore.py` | Preserve Galley's ChatGPT / Codex managed model backend, including credential IPC refresh, account header propagation, Codex-specific Responses payload shape, and forced streaming. | Medium: upstream OpenAI request assembly changes can alter nearby contexts. | Remove when upstream supports Galley's Codex credential and request contract directly. |

Rules:

- Keep each patch small and product-scoped.
- Record the upstream files touched, reason, rebase risk, and removal condition.
- Remove a Galley patch when upstream GenericAgent provides the same capability.
- Never apply these patches to a user-owned external GenericAgent checkout.
