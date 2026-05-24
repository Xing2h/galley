# Managed GA Patch Stack

Patch stack id: `galley-managed-ga-patches-v1`

Current patches:

| Patch | Upstream files | Reason | Rebase risk | Removal condition |
|---|---|---|---|---|
| `0001-managed-state-root.patch` | `agentmain.py`, `ga.py`, `llmcore.py`, `frontends/continue_cmd.py` | Keep Galley-managed user state under `Application Support/app.galley/managed-ga-state` instead of the shipped code payload. | Medium: upstream may rename state paths or model response logging. | Remove when GenericAgent supports an explicit state root / profile path upstream. |

Rules:

- Keep each patch small and product-scoped.
- Record the upstream files touched, reason, rebase risk, and removal condition.
- Remove a Galley patch when upstream GenericAgent provides the same capability.
- Never apply these patches to a user-owned external GenericAgent checkout.
