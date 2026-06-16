"""Galley-managed IM Supervisor launcher.

Galley wraps GenericAgent's official IM frontends while keeping model config,
prompt, state paths, and process lifetime owned by Galley.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import IO, Any

from runner import managed_runtime

IM_SUPERVISOR_PROMPT_ENV = "GALLEY_IM_SUPERVISOR_PROMPT_TEXT"


def _capture_real_stdout() -> IO[str]:
    fd = os.dup(1)
    return os.fdopen(fd, "w", encoding="utf-8", buffering=1)


def _emit(out: IO[str], **payload: Any) -> None:
    payload.setdefault(
        "updatedAt",
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z"),
    )
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), file=out)


def _install_paths(ga_path: str) -> None:
    if ga_path not in sys.path:
        sys.path.insert(0, ga_path)
    frontends_dir = os.path.join(ga_path, "frontends")
    if frontends_dir not in sys.path:
        sys.path.insert(0, frontends_dir)


def _redirect_logs(log_path: Path) -> IO[str]:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logf = open(log_path, "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stderr = logf
    # Some GA frontends explicitly write to sys.__stdout__; keep the JSON line
    # channel private to this launcher and send frontend prints to the log.
    sys.__stdout__ = logf  # type: ignore[misc]
    sys.__stderr__ = logf  # type: ignore[misc]
    return logf


def _run_wechat(args: argparse.Namespace, out: IO[str]) -> int:
    state_dir = Path(args.state_dir).expanduser().resolve()
    temp_dir = state_dir / "temp"
    token_file = state_dir / "token.json"
    qr_file = state_dir / f"wx_qr_{time.time_ns()}_{os.getpid()}.png"
    logf = _redirect_logs(state_dir / "wechat.log")
    state_dir.mkdir(parents=True, exist_ok=True)
    temp_dir.mkdir(parents=True, exist_ok=True)
    for old_qr in state_dir.glob("wx_qr*.png"):
        try:
            old_qr.unlink()
        except OSError:
            pass
    os.environ["GALLEY_WECHAT_TOKEN_FILE"] = str(token_file)
    os.environ["GALLEY_WECHAT_TEMP_DIR"] = str(temp_dir)
    os.environ["GALLEY_WECHAT_QR_FILE"] = str(qr_file)

    _install_paths(args.ga_path)
    managed_runtime.install_managed_mykey_loader()
    managed_state_root = managed_runtime.managed_state_root()
    if managed_state_root:
        os.chdir(managed_state_root)

    try:
        import frontends.wechatapp as wechatapp  # type: ignore[import-not-found]
    except Exception as e:
        _emit(out, platform="wechat", state="error", lastError=f"import failed: {e}")
        return 1

    wechatapp._TEMP_DIR = str(temp_dir)
    wechatapp.agent.verbose = False
    managed_runtime.install_managed_prompt_profile(
        wechatapp.agent,
        extra_env_names=(IM_SUPERVISOR_PROMPT_ENV,),
    )

    _emit(
        out,
        platform="wechat",
        state="starting",
        logPath=str(state_dir / "wechat.log"),
    )

    if args.relogin:
        token_file.unlink(missing_ok=True)
        qr_file.unlink(missing_ok=True)

    bot = wechatapp.WxBotClient(token_file=str(token_file))
    if args.relogin or not bot.token:
        qr_file.unlink(missing_ok=True)
        _emit(
            out,
            platform="wechat",
            state="waiting_scan",
            logPath=str(state_dir / "wechat.log"),
        )
        login_result: dict[str, Any] = {"done": False, "error": None}

        def _login() -> None:
            try:
                bot.login_qr()
            except Exception as e:  # pragma: no cover - network/platform path
                login_result["error"] = e
            finally:
                login_result["done"] = True

        login_thread = threading.Thread(target=_login, daemon=True)
        login_thread.start()
        qr_announced = False
        while not login_result["done"]:
            if qr_file.exists() and not qr_announced:
                _emit(
                    out,
                    platform="wechat",
                    state="waiting_scan",
                    qrImagePath=str(qr_file),
                    logPath=str(state_dir / "wechat.log"),
                )
                qr_announced = True
            login_thread.join(timeout=0.25)
        if login_result["error"] is not None:
            _emit(out, platform="wechat", state="error", lastError=str(login_result["error"]))
            return 1

    threading.Thread(target=wechatapp.agent.run, daemon=True).start()
    _emit(
        out,
        platform="wechat",
        state="running",
        botId=bot.bot_id,
        qrImagePath=str(qr_file) if qr_file.exists() else None,
        logPath=str(state_dir / "wechat.log"),
    )

    try:
        bot.run_loop(wechatapp.on_message)
    except wechatapp.AuthExpired:
        _emit(out, platform="wechat", state="expired", lastError="WeChat login expired")
        return 2
    except KeyboardInterrupt:
        _emit(out, platform="wechat", state="stopped")
        return 0
    except Exception as e:
        _emit(out, platform="wechat", state="error", lastError=str(e))
        return 1
    finally:
        try:
            logf.flush()
        except Exception:
            pass
    return 0


def _run_feishu(args: argparse.Namespace, out: IO[str]) -> int:
    state_dir = Path(args.state_dir).expanduser().resolve()
    temp_dir = state_dir / "temp"
    user_data_dir = state_dir / "ga_config"
    logf = _redirect_logs(state_dir / "feishu.log")
    state_dir.mkdir(parents=True, exist_ok=True)
    temp_dir.mkdir(parents=True, exist_ok=True)
    user_data_dir.mkdir(parents=True, exist_ok=True)
    os.environ["GA_WORKSPACE_ROOT"] = str(state_dir)
    os.environ["GA_USER_DATA_DIR"] = str(user_data_dir)
    os.environ["GALLEY_FEISHU_TEMP_DIR"] = str(temp_dir)

    _install_paths(args.ga_path)
    managed_runtime.install_managed_mykey_loader()
    managed_state_root = managed_runtime.managed_state_root()
    if managed_state_root:
        os.chdir(managed_state_root)

    try:
        import frontends.fsapp as fsapp  # type: ignore[import-not-found]
    except Exception as e:
        _emit(out, platform="feishu", state="error", lastError=f"import failed: {e}")
        return 1

    os.chdir(state_dir)
    original_get_agent = fsapp.get_agent

    def _managed_get_agent() -> Any:
        agent = original_get_agent()
        if not getattr(agent, "_galley_im_prompt_installed", False):
            agent.verbose = False
            managed_runtime.install_managed_prompt_profile(
                agent,
                extra_env_names=(IM_SUPERVISOR_PROMPT_ENV,),
            )
            agent._galley_im_prompt_installed = True
        return agent

    fsapp.get_agent = _managed_get_agent
    fsapp.GALLEY_STATUS_HOOK = lambda state, last_error=None: _emit(
        out,
        platform="feishu",
        state=state,
        lastError=last_error,
        logPath=str(state_dir / "feishu.log"),
    )

    _emit(
        out,
        platform="feishu",
        state="starting",
        logPath=str(state_dir / "feishu.log"),
    )

    try:
        config = fsapp.check_config(init_agent=False)
    except Exception as e:
        _emit(out, platform="feishu", state="error", lastError=f"config check failed: {e}")
        return 1
    if not config.get("ready"):
        _emit(
            out,
            platform="feishu",
            state="error",
            lastError="Feishu App ID and App Secret are required",
            logPath=str(state_dir / "feishu.log"),
        )
        return 1

    try:
        code = fsapp.main()
        return int(code or 0)
    except KeyboardInterrupt:
        _emit(out, platform="feishu", state="stopped")
        return 0
    except Exception as e:
        _emit(out, platform="feishu", state="error", lastError=str(e))
        return 1
    finally:
        try:
            logf.flush()
        except Exception:
            pass
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run a Galley-managed IM Supervisor.")
    parser.add_argument("--platform", choices=["wechat", "feishu"], required=True)
    parser.add_argument("--ga-path", required=True)
    parser.add_argument("--state-dir", required=True)
    parser.add_argument("--sop-path", required=True)
    parser.add_argument("--relogin", action="store_true")
    args = parser.parse_args(argv)

    out = _capture_real_stdout()
    if not managed_runtime.is_managed_runtime():
        _emit(out, platform=args.platform, state="error", lastError="not a managed runtime")
        return 1
    if args.platform == "wechat":
        return _run_wechat(args, out)
    if args.platform == "feishu":
        return _run_feishu(args, out)
    _emit(out, platform=args.platform, state="error", lastError="unsupported platform")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
