"""Build reviewable installation deltas; never mutate a runtime profile."""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from typing import Any

from .contracts import canonical_json


class InstallError(ValueError):
    pass


OWNERSHIP_MARKER = "pulse-shared-instincts-v1"


def _digest(value: object) -> str:
    return "sha256:" + sha256(canonical_json(value).encode("utf-8")).hexdigest()


def build_dry_run(*, runtime: str, existing_hooks: dict[str, Any], command: str) -> dict[str, Any]:
    if runtime not in {"claude", "codex", "antigravity", "openbot"}:
        raise InstallError("unsupported runtime")
    if not isinstance(existing_hooks, dict):
        raise InstallError("existing_hooks must be an object")
    if not isinstance(command, str) or not command:
        raise InstallError("command is required")
    before = deepcopy(existing_hooks)
    event = {"claude": "SessionEnd", "codex": "SessionEnd", "antigravity": "SessionStart", "openbot": "host-bridge"}[runtime]
    hook = {"owner": OWNERSHIP_MARKER, "command": command, "event": event, "mode": "enqueue-only"}
    after = deepcopy(before)
    owned = after.setdefault(OWNERSHIP_MARKER, {})
    if not isinstance(owned, dict):
        raise InstallError("existing ownership marker is malformed")
    owned[runtime] = hook
    return {
        "schema_version": "1.0",
        "status": "pending-review",
        "runtime": runtime,
        "mode": "dry-run",
        "before_digest": _digest(before),
        "after_digest": _digest(after),
        "before": before,
        "after": after,
        "ownership": {"marker": OWNERSHIP_MARKER, "runtime": runtime, "rollback": "remove only this marker/runtime entry"},
    }
