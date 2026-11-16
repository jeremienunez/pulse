"""Build reviewable installation deltas; never mutate a runtime profile."""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from typing import Any
import json
import shlex
import tomllib
from pathlib import Path

from .contracts import canonical_json


class InstallError(ValueError):
    pass


OWNERSHIP_MARKER = "pulse-shared-instincts-v1"
RUNTIME_PYTHON = Path("/media/jerem/ubuntu2/agent-instincts/runtime/venv/bin/python3")
MCP_SERVER_NAME = "pulse_instincts"


def build_mcp_plan(*, runtime: str, root: Path, controller: Path) -> dict:
    arguments = [str(controller), "adapter", "--stdio", "--root", str(root)]
    paths = {"claude": Path.home() / ".claude.json", "codex": Path.home() / ".codex/config.toml",
             "antigravity": Path.home() / ".gemini/config/mcp_config.json"}
    target = paths[runtime]
    before = target.read_bytes() if target.is_file() else b""
    if len(before) > 1024 * 1024:
        raise InstallError("MCP configuration exceeds the 1 MiB inspection limit")
    server = {"command": str(RUNTIME_PYTHON), "args": arguments}
    if runtime == "codex":
        config = tomllib.loads(before.decode()) if before else {}
        servers = config.get("mcp_servers", {})
        if not isinstance(servers, dict):
            raise InstallError("Codex MCP servers must be a table")
        existing = servers.get(MCP_SERVER_NAME)
        if existing is not None and (not isinstance(existing, dict) or existing.get("command") != server["command"] or existing.get("args") != arguments):
            raise InstallError("MCP server name already belongs to a different command")
        block = ""
        if existing is None:
            block = (f"\n[mcp_servers.{MCP_SERVER_NAME}]\ncommand = {json.dumps(str(RUNTIME_PYTHON))}\n"
                f"args = {json.dumps(arguments)}\nstartup_timeout_sec = 5\ntool_timeout_sec = 5\n"
                'default_tools_approval_mode = "approve"\n'
                f"\n[mcp_servers.{MCP_SERVER_NAME}.tools.select]\noutput_token_limit = 20000\n")
        after = before + block.encode()
        tomllib.loads(after.decode())
        delta = {"append": block}
    else:
        config = json.loads(before) if before else {}
        if not isinstance(config, dict) or not isinstance(config.get("mcpServers", {}), dict):
            raise InstallError("MCP server configuration must be an object")
        if runtime == "claude":
            server["type"] = "stdio"
        server["env"] = {}
        existing = config.get("mcpServers", {}).get(MCP_SERVER_NAME)
        if existing is not None and (not isinstance(existing, dict) or existing.get("command") != server["command"] or existing.get("args") != arguments):
            raise InstallError("MCP server name already belongs to a different command")
        if existing is None:
            config.setdefault("mcpServers", {})[MCP_SERVER_NAME] = server
            after = (json.dumps(config, indent=2) + "\n").encode()
            delta = {"add_server": server}
        else:
            after, delta = before, {}
    return {"target": str(target), "server_name": MCP_SERVER_NAME,
        "before_sha256": sha256(before).hexdigest(), "after_sha256": sha256(after).hexdigest(),
        "delta": delta, "ownership": OWNERSHIP_MARKER,
        "rollback": "remove the exact owned server entry after checking its command and arguments"}


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


def build_runtime_plan(*, runtime: str, root: Path, controller: Path, profile: str | None = None) -> dict:
    if runtime not in {"claude", "codex", "antigravity", "openbot"}:
        raise InstallError("unsupported runtime")
    if runtime == "openbot":
        return {"status": "pending", "runtime": runtime, "patch": "integrations/openbot/shared-instincts.patch",
                "mcp": {"server_name": MCP_SERVER_NAME, "integration": "source-bound host injection"},
                "reason": "host adapter requires the source-bound patch and application verification"}
    command = [str(RUNTIME_PYTHON), str(controller), "adapter", "--root", str(root), "--runtime", runtime]
    if profile:
        command.extend(["--profile", profile])
    paths = {"claude": Path.home() / ".claude/settings.json",
             "codex": Path.home() / ".codex/hooks.json",
             "antigravity": Path.home() / ".gemini/config/hooks.json"}
    target = paths[runtime]
    before_bytes = target.read_bytes() if target.is_file() else b""
    if len(before_bytes) > 1024 * 1024:
        raise InstallError("runtime configuration exceeds the 1 MiB inspection limit")
    before = json.loads(before_bytes) if before_bytes else {}
    if not isinstance(before, dict):
        raise InstallError("runtime configuration must be an object")
    events = ("SessionStart", "UserPromptSubmit", "SessionEnd") if runtime != "antigravity" else ("SessionStart", "PreInvocation")
    additions = {event: [{"hooks": [{"type": "command", "command": shlex.join([*command, "--event", event]), "timeout": 3}]}]
                 for event in events}
    if runtime == "codex":
        additions["SessionStart"][0]["hooks"][0]["additionalContextLimit"] = 0
        additions["UserPromptSubmit"][0]["hooks"][0]["additionalContextLimit"] = 0
    if runtime == "antigravity":
        additions = {OWNERSHIP_MARKER: {event: [{"type": "command", "command": shlex.join([*command, "--event", event]), "timeout": 3}]
                                      for event in events}}
        previous = before.get(OWNERSHIP_MARKER)
        if previous is not None and previous != additions[OWNERSHIP_MARKER]:
            raise InstallError("owned hook name already has a different definition")
        after = {**before, **additions}
        if previous is not None:
            additions = {}
    else:
        after = deepcopy(before)
        hooks = after.setdefault("hooks", {})
        if not isinstance(hooks, dict):
            raise InstallError("hooks configuration must be an object")
        inserted = {}
        for event, entries in additions.items():
            existing = hooks.setdefault(event, [])
            if not isinstance(existing, list):
                raise InstallError("hook event configuration must be an array")
            for entry in entries:
                if entry not in existing:
                    existing.append(entry)
                    inserted.setdefault(event, []).append(entry)
        additions = inserted
    permission_additions = []
    if runtime == "claude":
        permissions = after.setdefault("permissions", {})
        if not isinstance(permissions, dict) or not isinstance(permissions.get("allow", []), list):
            raise InstallError("Claude permission allow rules must be an array")
        allowed = permissions.setdefault("allow", [])
        for name in ("select", "observe", "remember_preference"):
            rule = f"mcp__{MCP_SERVER_NAME}__{name}"
            if rule not in allowed:
                allowed.append(rule)
                permission_additions.append(rule)
    services = Path(__file__).with_name("service")
    return {"schema_version": "1.0", "status": "pending", "mode": "dry-run",
        "runtime": runtime, "root": str(root), "target": str(target),
        "target_realpath": str(target.resolve()),
        "before_sha256": sha256(before_bytes).hexdigest(),
        "after_sha256": sha256((json.dumps(after, indent=2) + "\n").encode() if additions or permission_additions else before_bytes).hexdigest(),
        "additions": additions, "ownership": OWNERSHIP_MARKER,
        "permission_additions": permission_additions,
        "mcp": build_mcp_plan(runtime=runtime, root=root, controller=controller),
        "rollback": {"configuration": "remove only exact additions after checking current hashes",
                     "services": ["pulse-instincts.path", "pulse-instincts.service"],
                     "store": "retain all records and versions"},
        "service_templates": {path.name: path.read_text().replace(
            "%h/.local/share/pulse/shared-instincts/current/scripts/pulse_instincts.py",
            shlex.quote(str(controller))).replace(
            "/media/jerem/ubuntu2/agent-instincts/jerem", str(root)) for path in services.glob("pulse-instincts.*")},
        "activation": "awaiting reviewed configuration delta"}
