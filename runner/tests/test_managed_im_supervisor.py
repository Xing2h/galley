from __future__ import annotations

import io
import json
import os
import sys
from argparse import Namespace
from pathlib import Path
from typing import Any

from runner import managed_im_supervisor, managed_runtime


def _write_fake_fsapp(ga_path: Path, body: str) -> None:
    frontends = ga_path / "frontends"
    frontends.mkdir(parents=True)
    (frontends / "__init__.py").write_text("", encoding="utf-8")
    (frontends / "fsapp.py").write_text(body, encoding="utf-8")


def _args(ga_path: Path, state_dir: Path) -> Namespace:
    return Namespace(
        platform="feishu",
        ga_path=str(ga_path),
        state_dir=str(state_dir),
        sop_path=str(state_dir / "sop.md"),
        relogin=False,
    )


def _restore_stdio(stdout: Any, stderr: Any, real_stdout: Any, real_stderr: Any) -> None:
    sys.stdout = stdout
    sys.stderr = stderr
    sys.__dict__["__stdout__"] = real_stdout
    sys.__dict__["__stderr__"] = real_stderr


def _clear_frontends_modules() -> None:
    sys.modules.pop("frontends.fsapp", None)
    sys.modules.pop("frontends", None)


def test_run_feishu_injects_config_temp_dir_and_prompt(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    ga_path = tmp_path / "ga"
    state_dir = tmp_path / "state"
    _write_fake_fsapp(
        ga_path,
        """
import json
import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(PROJECT_ROOT)
IMPORTED_CWD = os.getcwd()

class Agent:
    verbose = True

agent = Agent()

def get_agent():
    return agent

def check_config(init_agent=False):
    cfg = json.loads(os.environ["GALLEY_FEISHU_CONFIG_JSON"])
    assert cfg["fs_app_id"] == "cli_test"
    assert cfg["fs_app_secret"] == "secret"
    assert cfg["fs_allowed_users"] == []
    assert os.environ["GALLEY_FEISHU_TEMP_DIR"].endswith("temp")
    assert os.environ["GA_WORKSPACE_ROOT"].endswith("state")
    assert os.environ["GA_USER_DATA_DIR"].endswith(os.path.join("state", "ga_config"))
    return {"ready": True, "app_id": cfg["fs_app_id"]}

def main():
    assert IMPORTED_CWD.endswith("ga")
    assert os.getcwd() == os.environ["GA_WORKSPACE_ROOT"]
    managed = get_agent()
    assert managed.prompt_installed
    assert managed.verbose is False
    GALLEY_STATUS_HOOK("running")
    GALLEY_STATUS_HOOK("reconnecting", "offline")
    GALLEY_STATUS_HOOK("running")
    raise KeyboardInterrupt()
""",
    )
    monkeypatch.setenv(
        "GALLEY_FEISHU_CONFIG_JSON",
        json.dumps(
            {
                "fs_app_id": "cli_test",
                "fs_app_secret": "secret",
                "fs_allowed_users": [],
            }
        ),
    )
    monkeypatch.setattr(
        managed_runtime,
        "install_managed_mykey_loader",
        lambda: None,
    )
    monkeypatch.setattr(
        managed_runtime,
        "managed_state_root",
        lambda: None,
    )

    def install_prompt(agent: Any, extra_env_names: tuple[str, ...]) -> None:
        assert managed_im_supervisor.IM_SUPERVISOR_PROMPT_ENV in extra_env_names
        agent.prompt_installed = True

    monkeypatch.setattr(
        managed_runtime,
        "install_managed_prompt_profile",
        install_prompt,
    )
    _clear_frontends_modules()
    out = io.StringIO()
    stdout, stderr, real_stdout, real_stderr = (
        sys.stdout,
        sys.stderr,
        sys.__stdout__,
        sys.__stderr__,
    )
    cwd = os.getcwd()
    try:
        code = managed_im_supervisor._run_feishu(_args(ga_path, state_dir), out)
    finally:
        os.chdir(cwd)
        _restore_stdio(stdout, stderr, real_stdout, real_stderr)
        _clear_frontends_modules()

    assert code == 0
    events = [json.loads(line) for line in out.getvalue().splitlines()]
    assert [event["state"] for event in events] == [
        "starting",
        "running",
        "reconnecting",
        "running",
        "stopped",
    ]
    assert events[1]["platform"] == "feishu"
    assert events[2]["lastError"] == "offline"


def test_run_feishu_reports_missing_config(monkeypatch: Any, tmp_path: Path) -> None:
    ga_path = tmp_path / "ga"
    state_dir = tmp_path / "state"
    _write_fake_fsapp(
        ga_path,
        """
def get_agent():
    raise AssertionError("agent should not initialize")

def check_config(init_agent=False):
    return {"ready": False, "app_id": ""}

def main():
    raise AssertionError("main should not run")
""",
    )
    monkeypatch.setattr(
        managed_runtime,
        "install_managed_mykey_loader",
        lambda: None,
    )
    monkeypatch.setattr(
        managed_runtime,
        "managed_state_root",
        lambda: None,
    )
    _clear_frontends_modules()
    out = io.StringIO()
    stdout, stderr, real_stdout, real_stderr = (
        sys.stdout,
        sys.stderr,
        sys.__stdout__,
        sys.__stderr__,
    )
    cwd = os.getcwd()
    try:
        code = managed_im_supervisor._run_feishu(_args(ga_path, state_dir), out)
    finally:
        os.chdir(cwd)
        _restore_stdio(stdout, stderr, real_stdout, real_stderr)
        _clear_frontends_modules()

    assert code == 1
    events = [json.loads(line) for line in out.getvalue().splitlines()]
    assert events[-1]["state"] == "error"
    assert "App ID and App Secret" in events[-1]["lastError"]


def test_run_feishu_reports_malformed_managed_config_without_mykey_fallback(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    ga_path = tmp_path / "ga"
    state_dir = tmp_path / "state"
    marker = tmp_path / "mykey-executed"
    (ga_path / "mykey.py").parent.mkdir(parents=True, exist_ok=True)
    (ga_path / "mykey.py").write_text(
        f"from pathlib import Path\nPath({str(marker)!r}).write_text('ran')\n",
        encoding="utf-8",
    )
    _write_fake_fsapp(
        ga_path,
        """
import json
import os

raw = os.environ.get("GALLEY_FEISHU_CONFIG_JSON")
if raw is not None:
    try:
        data = json.loads(raw)
    except Exception as exc:
        raise RuntimeError(f"load Galley Feishu config failed: {exc}") from exc
    if not isinstance(data, dict):
        raise RuntimeError("Galley Feishu config must be a JSON object")

def get_agent():
    raise AssertionError("agent should not initialize")

def check_config(init_agent=False):
    raise AssertionError("config check should not run")

def main():
    raise AssertionError("main should not run")
""",
    )
    monkeypatch.setenv("GALLEY_FEISHU_CONFIG_JSON", "{")
    monkeypatch.setattr(managed_runtime, "install_managed_mykey_loader", lambda: None)
    monkeypatch.setattr(managed_runtime, "managed_state_root", lambda: None)
    _clear_frontends_modules()
    out = io.StringIO()
    stdout, stderr, real_stdout, real_stderr = (
        sys.stdout,
        sys.stderr,
        sys.__stdout__,
        sys.__stderr__,
    )
    cwd = os.getcwd()
    try:
        code = managed_im_supervisor._run_feishu(_args(ga_path, state_dir), out)
    finally:
        os.chdir(cwd)
        _restore_stdio(stdout, stderr, real_stdout, real_stderr)
        _clear_frontends_modules()

    assert code == 1
    assert not marker.exists()
    events = [json.loads(line) for line in out.getvalue().splitlines()]
    assert events[-1]["state"] == "error"
    assert "load Galley Feishu config failed" in events[-1]["lastError"]
