# Managed GA Patch Stack

Patch stack id: `galley-managed-ga-patches-v1`

Last replay verified: `2026-06-02` against upstream
`5f46b43816d6298f5e1d34c7076ea31f875b7810`.

Current patches:

| Patch | Upstream files | Reason | Rebase risk | Removal condition |
|---|---|---|---|---|
| `0001-managed-state-root.patch` | `agentmain.py`, `ga.py`, `llmcore.py`, `frontends/continue_cmd.py` | Keep Galley-managed user state under `Application Support/app.galley/managed-ga-state` instead of the shipped code payload, including model response logs, long prompt temp files, and `/continue` cache. | Medium: upstream may rename state paths, model response logging, or continue-session cache paths. | Remove when GenericAgent supports an explicit state root / profile path upstream. |
| `0002-repair-windows-path-tool-json.patch` | `llmcore.py` | Keep managed GA tolerant when models copy Windows paths into `path` / `file_path` / `filepath` tool JSON fields with raw backslashes or doubled quotes. | Low: touches only fallback text-tool JSON parsing for path fields. | Remove when GenericAgent upstream normalizes Windows path values or handles these malformed tool JSON cases. |
| `0003-normalize-asset-path-joins.patch` | `agentmain.py`, `ga.py` | Join managed GA bundled asset paths with platform path segments so Windows verbatim paths never mix `\\?\` with `/`. | Low: only wraps existing `assets` reads behind an `asset_path` helper. | Remove when upstream stops using slash-containing asset path strings under `script_dir`. |
| `0004-managed-wechat-state-paths.patch` | `frontends/wechatapp.py` | Let Galley's managed IM launcher keep WeChat token and temp files under Galley managed state instead of `~/.wxbot` / bundled code paths. | Low: two path constants near module startup. | Remove when upstream WeChat frontend supports explicit token/temp paths. |

Rules:

- Keep each patch small and product-scoped.
- Record the upstream files touched, reason, rebase risk, and removal condition.
- Remove a Galley patch when upstream GenericAgent provides the same capability.
- Never apply these patches to a user-owned external GenericAgent checkout.
