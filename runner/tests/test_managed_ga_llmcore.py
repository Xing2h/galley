"""Managed GenericAgent parser compatibility tests."""
from __future__ import annotations

import json
import sys
import types
from pathlib import Path

_MANAGED_GA_CODE = Path(__file__).resolve().parents[2] / "managed-ga" / "code"
if str(_MANAGED_GA_CODE) not in sys.path:
    sys.path.insert(0, str(_MANAGED_GA_CODE))

sys.modules.setdefault("requests", types.ModuleType("requests"))
urllib3_stub = types.ModuleType("urllib3")
urllib3_stub.exceptions = types.SimpleNamespace(InsecureRequestWarning=Warning)
urllib3_stub.disable_warnings = lambda *_args, **_kwargs: None
sys.modules.setdefault("urllib3", urllib3_stub)

import llmcore  # noqa: E402


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
