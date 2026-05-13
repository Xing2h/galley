"""Unit tests for module-level helpers in bridge.workbench_bridge.

Heavy integration is in test_e2e.py. This file covers pure-function helpers
that don't need a GA subprocess: error classification and LLM name
prettification.
"""
from __future__ import annotations

import pytest

from bridge.workbench_bridge import (
    Bridge,
    _classify_error,
    _simplify_llm_name,
)

# ---------------- _classify_error ----------------


@pytest.mark.parametrize(
    "message,expected_hint",
    [
        # check_llm_config: auth-class keywords
        ("Authentication failed: invalid api_key", "check_llm_config"),
        ("HTTP 401 Unauthorized", "check_llm_config"),
        ("403 Forbidden: invalid key", "check_llm_config"),
        ("Authentication error", "check_llm_config"),
        # quota_exceeded: rate / quota keywords
        ("Quota exceeded for this month", "quota_exceeded"),
        ("HTTP 429 Too Many Requests", "quota_exceeded"),
        ("rate_limit triggered", "quota_exceeded"),
        # network: transport-class keywords
        ("Connection refused by api.anthropic.com", "network"),
        ("Request timed out after 30s", "network"),
        ("DNS resolution failed", "network"),
    ],
)
def test_classify_runtime_error_with_hint(message: str, expected_hint: str) -> None:
    """Runtime errors with known patterns get the matching hint."""
    hint, retryable = _classify_error(message, "runtime")
    assert hint == expected_hint
    assert retryable is True


def test_classify_runtime_error_unclassified() -> None:
    """Runtime errors without a keyword match stay retryable but get no hint."""
    hint, retryable = _classify_error("Something weird happened", "runtime")
    assert hint is None
    assert retryable is True


def test_classify_bridge_error_no_hint() -> None:
    """Bridge errors don't get hints — they're internal faults the user can't act on.

    Even if the bridge error message happens to contain LLM-related
    keywords, we don't surface a hint because the rendering location
    differs (toast, not inline) and the actionable advice differs.
    """
    hint, retryable = _classify_error("api_key parse failure in bridge config", "bridge")
    assert hint is None
    assert retryable is False


def test_classify_business_error_no_hint() -> None:
    """Business errors (user input issues) also skip hints."""
    hint, retryable = _classify_error("llmIndex 99 out of range", "business")
    assert hint is None
    assert retryable is False


def test_classify_first_match_wins() -> None:
    """When a message matches multiple categories, first-listed pattern wins.

    Pattern order in workbench_bridge is: check_llm_config -> quota -> network.
    A message containing both 'unauthorized' and 'rate limit' should classify
    as check_llm_config because auth is checked first.
    """
    hint, _ = _classify_error("Unauthorized: rate limit enforced", "runtime")
    assert hint == "check_llm_config"


def test_classify_case_insensitive() -> None:
    """Keyword matching is case-insensitive against the error message."""
    hint, _ = _classify_error("AUTHENTICATION DENIED", "runtime")
    assert hint == "check_llm_config"


# ---------------- _simplify_llm_name ----------------


@pytest.mark.parametrize(
    "raw,expected",
    [
        # Standard ClassName/model-name forms
        ("NativeClaudeSession/glm-5.1", "GLM 5.1"),
        ("NativeOAISession/gpt-4o", "GPT 4o"),
        ("ClaudeSession/claude-3-5-sonnet", "Claude 3-5-sonnet"),
        ("LLMSession/qwen-max", "Qwen max"),
        ("MixinSession/deepseek-v3", "DeepSeek v3"),
        ("Session/kimi-k2", "Kimi k2"),
        # No slash: treat the whole thing as the model id
        ("BADCONFIG_MIXIN", "BADCONFIG_MIXIN"),
        # Single-token model with unknown brand keeps the original token
        ("FooSession/CustomModel", "CustomModel"),
    ],
)
def test_simplify_llm_name(raw: str, expected: str) -> None:
    assert _simplify_llm_name(raw) == expected


# ---------------- _extract_ask_user ----------------


def test_extract_ask_user_matches_first_ask_user_call() -> None:
    tool_calls = [
        {
            "tool_name": "ask_user",
            "args": {
                "question": "Continue with React 19?",
                "candidates": ["yes", "no, use 18"],
            },
        },
    ]
    result = Bridge._extract_ask_user(tool_calls)
    assert result == ("Continue with React 19?", ["yes", "no, use 18"])


def test_extract_ask_user_returns_none_when_absent() -> None:
    tool_calls = [
        {"tool_name": "file_read", "args": {"path": "agentmain.py"}},
        {"tool_name": "code_run", "args": {"code": "print('hi')"}},
    ]
    assert Bridge._extract_ask_user(tool_calls) is None


def test_extract_ask_user_handles_missing_candidates() -> None:
    """GA's ask_user accepts an open-ended question (no candidates).
    Bridge must coerce missing candidates to an empty list — desktop
    AskUserBubble renders the question without chips in that case."""
    tool_calls = [
        {"tool_name": "ask_user", "args": {"question": "What now?"}},
    ]
    result = Bridge._extract_ask_user(tool_calls)
    assert result == ("What now?", [])


def test_extract_ask_user_coerces_non_string_candidates() -> None:
    """Defensive: tool args come from LLM JSON and could in principle
    arrive with non-string entries. `_extract_ask_user` should str()
    them so downstream `[str(c) for c in candidates]` doesn't crash."""
    tool_calls = [
        {
            "tool_name": "ask_user",
            "args": {"question": "Pick one", "candidates": [1, "two", 3.0]},
        },
    ]
    result = Bridge._extract_ask_user(tool_calls)
    assert result == ("Pick one", ["1", "two", "3.0"])
