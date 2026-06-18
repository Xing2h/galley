"""Managed GenericAgent parser compatibility tests."""
from __future__ import annotations

import importlib
import json
import os
import sys
import types
from pathlib import Path
from typing import Any, cast

import pytest

_MANAGED_GA_CODE = Path(__file__).resolve().parents[2] / "managed-ga" / "code"
if str(_MANAGED_GA_CODE) not in sys.path:
    sys.path.insert(0, str(_MANAGED_GA_CODE))

_PREVIOUS_DONT_WRITE_BYTECODE = sys.dont_write_bytecode
sys.dont_write_bytecode = True
sys.modules.setdefault("requests", types.ModuleType("requests"))
urllib3_stub = types.ModuleType("urllib3")
urllib3_typed = cast(Any, urllib3_stub)
urllib3_typed.exceptions = types.SimpleNamespace(InsecureRequestWarning=Warning)
urllib3_typed.disable_warnings = lambda *_args, **_kwargs: None
sys.modules.setdefault("urllib3", urllib3_stub)

try:
    import llmcore  # type: ignore[import-not-found]  # noqa: E402
finally:
    sys.dont_write_bytecode = _PREVIOUS_DONT_WRITE_BYTECODE


def test_tryparse_repairs_raw_windows_path_backslashes() -> None:
    raw = r'{"name":"file_read","arguments":{"path":"D:\GenericAgent\memory\sophub.md"}}'

    parsed = llmcore.tryparse(raw)

    assert parsed["arguments"]["path"] == "D:/GenericAgent/memory/sophub.md"


def test_tryparse_repairs_doubled_quotes_around_windows_path() -> None:
    raw = r'{"name":"file_read","arguments":{"path":""D:\GenericAgent\memory\sophub.md""}}'

    parsed = llmcore.tryparse(raw)

    assert parsed["arguments"]["path"] == "D:/GenericAgent/memory/sophub.md"


def test_tryparse_restores_json_escape_letters_in_raw_windows_path() -> None:
    raw = r'{"name":"file_read","arguments":{"path":"D:\new\test.md"}}'

    parsed = llmcore.tryparse(raw)

    assert parsed["arguments"]["path"] == "D:/new/test.md"


def test_tryparse_strips_user_quotes_from_valid_windows_path_value() -> None:
    raw = json.dumps(
        {
            "name": "file_read",
            "arguments": {"path": r'"D:\GenericAgent\memory\sophub.md"'},
        },
        ensure_ascii=False,
    )

    parsed = llmcore.tryparse(raw)

    assert parsed["arguments"]["path"] == "D:/GenericAgent/memory/sophub.md"


def test_tryparse_does_not_normalize_non_path_string_fields() -> None:
    raw = json.dumps(
        {
            "name": "code_run",
            "arguments": {"script": r'print("D:\new\test.md")'},
        },
        ensure_ascii=False,
    )

    parsed = llmcore.tryparse(raw)

    assert parsed["arguments"]["script"] == r'print("D:\new\test.md")'


def _exhaust(gen: Any) -> Any:
    try:
        while True:
            next(gen)
    except StopIteration as e:
        return e.value


def test_native_tool_client_keeps_non_text_image_blocks(tmp_path: Path) -> None:
    class FakeBackend:
        def __init__(self) -> None:
            self.history: list[dict[str, Any]] = []
            self.name = "fake"
            self.model = "fake-model"
            self.merged: dict[str, Any] | None = None

        def ask(self, merged: dict[str, Any]) -> Any:
            self.merged = merged
            if False:
                yield ""
            return llmcore.MockResponse("", "ok", [], "{}")

    backend = FakeBackend()
    client = llmcore.NativeToolClient(backend)
    client.log_path = str(tmp_path / "llm.log")
    image_block = {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/png", "data": "aA=="},
    }

    _exhaust(
        client.chat(
            [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": "   "}, image_block],
                }
            ]
        )
    )

    assert backend.merged == {"role": "user", "content": [image_block]}


def test_agentmain_image_content_blocks_encodes_local_images(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("GALLEY_GA_STATE_ROOT", str(tmp_path / "state"))
    plugins_stub = types.ModuleType("plugins")
    plugins_typed = cast(Any, plugins_stub)
    plugins_typed.__path__ = []
    hooks_stub = types.ModuleType("plugins.hooks")
    hooks_typed = cast(Any, hooks_stub)
    hooks_typed.discover_and_load = lambda: None
    monkeypatch.setitem(sys.modules, "plugins", plugins_stub)
    monkeypatch.setitem(sys.modules, "plugins.hooks", hooks_stub)
    sys.modules.pop("agentmain", None)
    previous_dont_write_bytecode = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        agentmain = importlib.import_module("agentmain")
    finally:
        sys.dont_write_bytecode = previous_dont_write_bytecode

    image_path = tmp_path / "paste.webp"
    image_path.write_bytes(b"image-bytes")

    blocks = agentmain.image_content_blocks("look", [os.fspath(image_path)])

    assert blocks[0] == {"type": "text", "text": "look"}
    assert blocks[1] == {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/webp",
            "data": "aW1hZ2UtYnl0ZXM=",
        },
    }
