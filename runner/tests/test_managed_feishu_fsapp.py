from __future__ import annotations

import importlib.util
import os
import sys
import types
from pathlib import Path
from typing import Any


def _install_fsapp_stubs(monkeypatch: Any) -> None:
    class WsClient:
        def __init__(self, *_args: Any, **_kwargs: Any) -> None:
            self._conn: object | None = None
            self._auto_reconnect = False

        async def _connect(self) -> None:
            self._conn = object()

        async def _reconnect(self) -> None:
            self._conn = object()

        async def _try_connect(self, _cnt: int) -> bool:
            return True

    lark = types.ModuleType("lark_oapi")
    lark.ws = types.SimpleNamespace(Client=WsClient)  # type: ignore[attr-defined]
    lark.LogLevel = types.SimpleNamespace(INFO="INFO")  # type: ignore[attr-defined]
    lark.EventDispatcherHandler = types.SimpleNamespace()  # type: ignore[attr-defined]
    lark.Client = types.SimpleNamespace()  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "lark_oapi", lark)
    monkeypatch.setitem(sys.modules, "lark_oapi.api", types.ModuleType("lark_oapi.api"))
    monkeypatch.setitem(sys.modules, "lark_oapi.api.im", types.ModuleType("lark_oapi.api.im"))
    monkeypatch.setitem(
        sys.modules,
        "lark_oapi.api.im.v1",
        types.ModuleType("lark_oapi.api.im.v1"),
    )

    agentmain = types.ModuleType("agentmain")

    class GeneraticAgent:
        def run(self) -> None:
            pass

    agentmain.GeneraticAgent = GeneraticAgent  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "agentmain", agentmain)

    frontends = types.ModuleType("frontends")
    frontends.__path__ = []
    chatapp_common = types.ModuleType("frontends.chatapp_common")

    class AgentChatMixin:
        pass

    chatapp_common.AgentChatMixin = AgentChatMixin  # type: ignore[attr-defined]
    chatapp_common.FILE_HINT = "file hint"  # type: ignore[attr-defined]
    chatapp_common.split_text = lambda text, _limit: [text]  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "frontends", frontends)
    monkeypatch.setitem(sys.modules, "frontends.chatapp_common", chatapp_common)


def _load_managed_fsapp(monkeypatch: Any, tmp_path: Path) -> Any:
    _install_fsapp_stubs(monkeypatch)
    monkeypatch.setenv("GA_WORKSPACE_ROOT", str(tmp_path / "workspace"))
    monkeypatch.setenv("GALLEY_FEISHU_TEMP_DIR", str(tmp_path / "feishu-temp"))
    path = (
        Path(__file__).resolve().parents[2]
        / "managed-ga"
        / "code"
        / "frontends"
        / "fsapp.py"
    )
    spec = importlib.util.spec_from_file_location("_galley_test_fsapp", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["_galley_test_fsapp"] = module
    old_dont_write_bytecode = sys.dont_write_bytecode
    try:
        sys.dont_write_bytecode = True
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = old_dont_write_bytecode
    return module


def test_make_task_hook_adds_final_turn_panel_without_fabricated_thinking(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    cwd = os.getcwd()
    try:
        fsapp = _load_managed_fsapp(monkeypatch, tmp_path)
    finally:
        os.chdir(cwd)

    class Card:
        def __init__(self) -> None:
            self.steps: list[tuple[str, str]] = []

        def step(self, summary: str, detail: str) -> None:
            self.steps.append((summary, detail))

    class Parent:
        _fs_active_task_id = "task-1"

    class HookSelf:
        parent = Parent()

    class Response:
        content = "<summary>answered briefly</summary>Final answer body"

    finals: list[str] = []
    card = Card()
    hook = fsapp._make_task_hook(card, "task-1", finals.append)

    hook(
        {
            "self": HookSelf(),
            "exit_reason": "done",
            "summary": "answered briefly",
            "response": Response(),
            "tool_calls": [{"tool_name": "lookup", "args": {"q": "x", "_private": "hidden"}}],
        }
    )

    assert finals == ["<summary>answered briefly</summary>Final answer body"]
    assert len(card.steps) == 1
    summary, detail = card.steps[0]
    assert summary == "answered briefly"
    assert "Thinking" not in detail
    assert "Tool Calls" in detail
    assert "`lookup`" in detail
    assert "_private" not in detail
    assert "Output" in detail
    assert "Final answer body" in detail
