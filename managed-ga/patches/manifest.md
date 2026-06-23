# Managed GA Patch Stack

Patch stack id: `galley-managed-ga-patches-v1`

Last replay verified: `2026-06-23` against upstream
`70792af967a7826fad8e19d800d44977183f046b`.
(patch 0008 was refreshed to preserve upstream's 180-turn loop limit while
injecting managed image attachment content.)

Current patches:

| Patch | Upstream files | Reason | Rebase risk | Removal condition |
|---|---|---|---|---|
| `0001-managed-state-root.patch` | `agentmain.py`, `ga.py`, `llmcore.py`, `frontends/continue_cmd.py`, `frontends/workspace_cmd.py`, `plugins/project_mode.py` | Keep Galley-managed user state under `Application Support/app.galley/managed-ga-state` instead of the shipped code payload, including model response logs, long prompt temp files, `/continue` cache, Workspace registry/session maps, and Project Mode anchors / memory files. | Medium: upstream may rename state paths, model response logging, continue-session cache paths, workspace storage, or project-mode storage paths. | Remove when GenericAgent supports an explicit state root / profile path upstream. |
| `0002-repair-windows-path-tool-json.patch` | `llmcore.py` | Keep managed GA tolerant when models copy Windows paths into `path` / `file_path` / `filepath` tool JSON fields with raw backslashes or doubled quotes. | Low: touches only fallback text-tool JSON parsing for path fields. | Remove when GenericAgent upstream normalizes Windows path values or handles these malformed tool JSON cases. |
| `0003-normalize-asset-path-joins.patch` | `agentmain.py`, `ga.py` | Join managed GA bundled asset paths with platform path segments so Windows verbatim paths never mix `\\?\` with `/`. | Low: only wraps existing `assets` reads behind an `asset_path` helper. | Remove when upstream stops using slash-containing asset path strings under `script_dir`. |
| `0004-managed-wechat-state-paths.patch` | `frontends/wechatapp.py` | Let Galley's managed IM launcher keep WeChat token and temp files under Galley managed state instead of `~/.wxbot` / bundled code paths. | Low: two path constants near module startup. | Remove when upstream WeChat frontend supports explicit token/temp paths. |
| `0005-code-run-noninteractive-stdin.patch` | `ga.py` | Keep managed `code_run` non-interactive by closing child-process stdin, avoiding inherited runner IPC stdin handles that can block Python subprocesses on Windows. | Low: touches only `code_run` subprocess creation. | Remove when GenericAgent upstream closes stdin for non-interactive tool execution. |
| `0006-managed-browser-control-recovery.patch` | `TMWebDriver.py`, `ga.py`, `assets/tmwd_cdp_bridge/background.js`, `assets/tmwd_cdp_bridge/content.js` | Preserve Galley's managed Browser Control recovery semantics: extension-connected/no-tabs diagnostics, page wake-up messages, and MV3 service-worker keepalive / fast reconnect behavior. | Medium: upstream frequently touches the browser bridge service-worker loop. | Remove when upstream exposes equivalent extension status and recovery hints. |
| `0007-managed-codex-backend.patch` | `llmcore.py` | Preserve Galley's ChatGPT / Codex managed model backend, including credential IPC refresh, account header propagation, Codex-specific Responses payload shape, and forced streaming. | Medium: upstream OpenAI request assembly changes can alter nearby contexts. | Remove when upstream supports Galley's Codex credential and request contract directly. |
| `0008-managed-image-attachments.patch` | `agentmain.py`, `llmcore.py` | Let Galley's managed runtime receive local image attachment paths from the bridge, encode them as real multimodal content blocks, and preserve non-text image blocks through the native tool client. | Medium: touches the managed task loop and native content-block filtering. | Remove when GenericAgent upstream exposes a stable public image-input contract for frontend callers. |
| `0009-managed-feishu-config-env.patch` | `frontends/fsapp.py` | Let Galley's managed IM launcher inject Feishu app config from process memory, keep Feishu media temp files under Galley managed state, observe reconnect retries, tear down the lark websocket connection / event-loop tasks on each reconnect cycle so dead connections don't linger as zombies that divide by zero, log the lark-oapi hook path, and keep final-turn cards showing the turn summary/detail panel before final output. | Medium: touches config loading, temp path constants, an optional status hook, final-turn card rendering, and lark-oapi websocket lifecycle internals (module-level event loop, `_disconnect`). Re-verify `_teardown_lark_client` and the `GalleyStatusWsClient` private seams (`_connect`/`_reconnect`/`_try_connect`) before upgrading lark-oapi. | Remove when upstream Feishu frontend supports explicit config, temp paths, reconnect status callbacks, final-turn card summary panels, and a clean connection stop API. |
| `0010-managed-keychain-state-path.patch` | `assets/code_run_header.py` | Keep Galley-managed keychain secrets under `managed-ga-state/ga_keychain.enc` instead of the user's real home `~/ga_keychain.enc`, so secrets written by any keychain-using SOP (e.g. Sophub self-bootstrap) stay inside the managed state root and don't collide with an external GA checkout's keychain. Applied at the `code_run` preamble so the in-memory `keychain` module is rebound (`_PATH` + rebuilt `keys`) before the agent imports it. Attach mode has no `GALLEY_GA_STATE_ROOT`, so the block is a no-op there. | Low: appends a tail block to the code_run preamble after the `sys.path.append` line; only runs when the agent emits a `code_run` that imports `keychain`. | Remove when GenericAgent upstream keychain respects an explicit state root / profile path, or when `code_run_header.py` is restructured so keychain is no longer importable at preamble time. |

Rules:

- Keep each patch small and product-scoped.
- Patch files are zero-context unified diffs; replay them through
  `scripts/build-managed-ga.sh` so `git apply --unidiff-zero` is used.
- Record the upstream files touched, reason, rebase risk, and removal condition.
- Remove a Galley patch when upstream GenericAgent provides the same capability.
- Never apply these patches to a user-owned external GenericAgent checkout.
