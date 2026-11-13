"""Normalize runtime lifecycle events without guessing session closure."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


class AdapterError(ValueError):
    pass


@dataclass(frozen=True)
class AdapterDecision:
    status: str
    action: str
    source: str
    project_id: str | None = None
    session_id: str | None = None
    reason: str | None = None


def _required(event: dict[str, Any], key: str) -> str:
    value = event.get(key)
    if not isinstance(value, str) or not value:
        raise AdapterError(f"{key} is required")
    return value


def _context(source: str, event: dict[str, Any], session_key: str = "session_id") -> AdapterDecision:
    return AdapterDecision("ok", "select_context", source, _required(event, "project_id"), _required(event, session_key))


def _close(source: str, event: dict[str, Any], session_key: str = "session_id") -> AdapterDecision:
    return AdapterDecision("ok", "enqueue_closure", source, _required(event, "project_id"), _required(event, session_key))


def normalize_event(runtime: str, event: dict[str, Any]) -> AdapterDecision:
    """Convert only documented/host-owned lifecycle boundaries into actions.

    Callers must persist the returned action.  This pure function never starts
    Dream itself, so Dream-origin events cannot recursively enqueue Dream.
    """

    if not isinstance(event, dict):
        raise AdapterError("event must be an object")
    source = event.get("source", runtime)
    if source == "dream":
        return AdapterDecision("ignored", "none", runtime, reason="dream-origin events never enqueue Dream")
    if runtime not in {"claude", "codex", "antigravity", "openbot"}:
        raise AdapterError("unsupported runtime")
    kind = event.get("kind")
    if not isinstance(kind, str):
        raise AdapterError("event kind is required")
    if runtime in {"claude", "codex"}:
        if kind == "session_start":
            return _context(runtime, event)
        if kind == "session_end":
            return _close(runtime, event)
        if kind in {"turn_completed", "subagent_stopped", "compacted"}:
            return AdapterDecision("ignored", "none", runtime, reason="turn/subagent/compaction is not session closure")
    if runtime == "antigravity":
        if kind in {"session_start", "pre_invocation"}:
            return _context(runtime, event, "conversation_id")
        if kind == "managed_session_closed":
            if event.get("launcher_owned") is not True:
                return AdapterDecision("pending", "none", runtime, reason="unowned Antigravity closure cannot be attributed")
            return _close(runtime, event, "conversation_id")
        if kind in {"stop", "post_invocation"}:
            return AdapterDecision("pending", "none", runtime, reason="Antigravity execution stop is not chat closure")
    if runtime == "openbot":
        if kind == "chat_context":
            return _context(runtime, event, "thread_id")
        if kind in {"task_closed", "chat_cleared"}:
            return _close(runtime, event, "thread_id")
        if kind in {"turn_completed", "provider_replaced", "context_compacted"}:
            return AdapterDecision("ignored", "none", runtime, reason="OpenBot provider/turn event is not canonical chat closure")
    return AdapterDecision("pending", "none", runtime, reason="runtime event is not covered for automatic handling")
