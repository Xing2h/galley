"""Shared helpers for Galley's managed GenericAgent runtime.

This module is imported only by Galley-owned runner entrypoints. External /
attach mode must keep using the user's GenericAgent config and prompt as-is.
"""
from __future__ import annotations

import json
import os
from collections.abc import Iterable
from pathlib import Path
from typing import Any

GALLEY_RUNTIME_KIND_ENV = "GALLEY_RUNTIME_KIND"
GALLEY_MANAGED_STATE_ROOT_ENV = "GALLEY_GA_STATE_ROOT"
GALLEY_MANAGED_MODEL_CONFIG_ENV = "GALLEY_MANAGED_MODEL_CONFIG_JSON"
GALLEY_MANAGED_MODEL_CONFIG_PATH_ENV = "GALLEY_MANAGED_MODEL_CONFIG_PATH"
GALLEY_RUNTIME_PROMPT_TEXT_ENV = "GALLEY_RUNTIME_PROMPT_TEXT"
GALLEY_PERSONA_PROMPT_TEXT_ENV = "GALLEY_PERSONA_PROMPT_TEXT"


def is_managed_runtime() -> bool:
    return os.environ.get(GALLEY_RUNTIME_KIND_ENV) == "managed"


def managed_state_root() -> str | None:
    return os.environ.get(GALLEY_MANAGED_STATE_ROOT_ENV)


def managed_model_config_from_env() -> dict[str, Any]:
    """Build GA-style mykey entries from Galley's in-memory model config."""
    raw = os.environ.get(GALLEY_MANAGED_MODEL_CONFIG_ENV)
    if not raw:
        raise RuntimeError("Galley managed model config was not provided.")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Galley managed model config is invalid JSON: {e}") from e
    models = data.get("models")
    if not isinstance(models, list) or not models:
        raise RuntimeError("Galley managed model config has no usable models.")

    out: dict[str, Any] = {}
    for idx, model in enumerate(models):
        if not isinstance(model, dict):
            continue
        protocol = str(model.get("protocol") or "").strip().lower()
        if protocol == "anthropic":
            key = f"native_claude_config_{idx}"
        elif protocol == "openai":
            key = f"native_oai_config_{idx}"
        else:
            continue
        cfg: dict[str, Any] = {
            "name": str(model.get("displayName") or model.get("model") or key),
            "apikey": str(model.get("apiKey") or ""),
            "apibase": str(model.get("apiBase") or "").rstrip("/"),
            "model": str(model.get("model") or ""),
        }
        auth_kind = str(model.get("authKind") or "api_key").strip().lower()
        if auth_kind == "chatgpt_codex_oauth":
            cfg["codex_backend"] = True
            cfg["api_mode"] = "responses"
            cfg["galley_api_key_ref"] = str(model.get("apiKeyRef") or "")
            credential_ipc = model.get("credentialIpc")
            if isinstance(credential_ipc, dict):
                cfg["galley_credential_ipc"] = credential_ipc
        advanced = model.get("advancedOptions") or {}
        if isinstance(advanced, dict):
            cfg.update(advanced)
            if "connect_timeout" in advanced and "timeout" not in advanced:
                cfg["timeout"] = advanced["connect_timeout"]
        if auth_kind == "chatgpt_codex_oauth":
            cfg["codex_backend"] = True
            cfg["api_mode"] = "responses"
            if str(cfg.get("reasoning_effort") or "").strip().lower() == "minimal":
                cfg["reasoning_effort"] = "medium"
        if not cfg["apikey"] or not cfg["apibase"] or not cfg["model"]:
            continue
        out[key] = cfg
    if not out:
        raise RuntimeError("Galley managed model config has no usable models.")
    return out


def install_managed_mykey_loader() -> None:
    """Patch managed GA's llmcore to read Galley-owned model config."""
    import llmcore  # type: ignore[import-not-found]

    marker = os.environ.get(GALLEY_MANAGED_MODEL_CONFIG_PATH_ENV)
    if not marker:
        raise RuntimeError("managed runtime missing model config marker path")
    marker_path = str(Path(marker).expanduser().resolve())

    def _load_managed_mykeys() -> dict[str, Any]:
        llmcore._mykey_path = marker_path
        return managed_model_config_from_env()

    llmcore._load_mykeys = _load_managed_mykeys
    llmcore._mykey_path = marker_path
    llmcore._mykey_mtime = None


def managed_prompt_profile(extra_env_names: Iterable[str] = ()) -> str:
    prompts = []
    for env_name in (
        GALLEY_RUNTIME_PROMPT_TEXT_ENV,
        GALLEY_PERSONA_PROMPT_TEXT_ENV,
        *extra_env_names,
    ):
        raw_prompt = os.environ.get(env_name)
        if not raw_prompt:
            raise RuntimeError(f"managed runtime missing {env_name}")
        prompts.append(raw_prompt.strip())
    extra_prompt = "\n\n".join(p for p in prompts if p)
    if not extra_prompt:
        raise RuntimeError("managed prompt profile is empty")
    return extra_prompt


def install_managed_prompt_profile(
    agent: Any,
    extra_env_names: Iterable[str] = (),
) -> None:
    extra_prompt = managed_prompt_profile(extra_env_names)

    clients = list(getattr(agent, "llmclients", []) or [])
    if not clients and getattr(agent, "llmclient", None) is not None:
        clients = [agent.llmclient]
    for client in clients:
        backend = getattr(client, "backend", None)
        if backend is not None:
            backend.extra_sys_prompt = "\n\n" + extra_prompt
