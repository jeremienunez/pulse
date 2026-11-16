"""Normalize runtime lifecycle events without guessing session closure."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import subprocess
import json
import shlex
import sys
import os
import shutil
from uuid import uuid4
from pathlib import Path
from jsonschema import Draft7Validator
from jsonschema.exceptions import ValidationError

from .contracts import ContractError, RECORDS_SCHEMA_PATH, canonical_json, digest, redact_observation
from .recall import MAX_PACKET_BYTES, select_from_store
from .store import StoreError, session_key, utc_now


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
        if kind in {"session_start", "user_prompt_submit"}:
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


def project_identity(cwd: str) -> str:
    root = Path(cwd).resolve()
    probe = subprocess.run(["git", "-C", str(root), "rev-parse", "--path-format=absolute", "--git-common-dir"],
                           text=True, capture_output=True, timeout=2, check=False)
    owner = probe.stdout.strip() if probe.returncode == 0 else str(root)
    return digest(owner).removeprefix("sha256:")[:32]


def handle_native_event(store, runtime: str, payload: dict, *, profile: str | None = None) -> dict:
    native_kind = payload.get("hook_event_name") or payload.get("hookEventName") or payload.get("kind")
    kinds = {"SessionStart": "session_start", "SessionEnd": "session_end",
             "PreInvocation": "pre_invocation", "Stop": "stop", "UserPromptSubmit": "user_prompt_submit"}
    kind = kinds.get(native_kind, native_kind)
    session = payload.get("session_id") or payload.get("conversationId") or payload.get("conversation_id") or payload.get("thread_id")
    if payload.get("source") == "dream" or os.environ.get("PULSE_INSTINCTS_ORIGIN") == "dream":
        return {"status": "ignored", "reason": "Dream source event"}
    if os.environ.get("PULSE_INSTINCTS_ORIGIN") == "openbot" and runtime != "openbot":
        return {"status": "ignored", "reason": "canonical OpenBot bridge owns this hosted session"}
    folders = payload.get("workspacePaths") or payload.get("workspace_paths") or [str(Path.cwd())]
    project = payload.get("project_id") or project_identity(payload.get("cwd", folders[0]))
    event = {**payload, "kind": kind, "project_id": project,
             "session_id": session, "conversation_id": session, "thread_id": session}
    decision = normalize_event(runtime, event)
    if decision.action == "none":
        return {"status": decision.status, "reason": decision.reason}
    launch = os.environ.get("PULSE_INSTINCTS_MANAGED_SESSION")
    if launch and runtime == "antigravity" and kind == "session_start":
        store.bind_launch(launch, {"project_id": project, "conversation_id": session})
    if decision.action == "enqueue_closure":
        snapshot = store.snapshot()
        identity = {"source": runtime, "project_id": project, "session_id": session}
        upper = max((row["sequence"] for row in snapshot["observations"].values()
                     if row["session_key"] == session_key(identity)), default=-1)
        if upper < 0:
            return {"status": "ignored", "reason": "session has no admitted observations"}
        identifier = digest([identity, upper]).removeprefix("sha256:")
        existing = snapshot["closures"].get(identifier)
        receipt = store.close_range({"schema_version": "1.0", "closure_id": identifier, **identity,
            "upper_sequence": upper, "closed_at": existing["closed_at"] if existing else utc_now()})
        store.wake_queue()
        return receipt
    terms = payload.get("terms") or payload.get("lastUserInput") or payload.get("last_user_input") or payload.get("prompt") or []
    supplied_profile = profile or payload.get("profile")
    if isinstance(supplied_profile, dict):
        supplied_profile = canonical_json(supplied_profile)
    actual_model = payload.get("model") or payload.get("modelName") or payload.get("model_name")
    if not supplied_profile and actual_model and payload.get("effort"):
        supplied_profile = canonical_json({"runtime": runtime, "model": actual_model, "effort": payload["effort"]})
    if supplied_profile:
        try:
            parsed_profile = json.loads(supplied_profile)
        except (TypeError, ValueError) as error:
            raise AdapterError("profile must be a canonical runtime/model/effort object") from error
        if not isinstance(parsed_profile, dict):
            raise AdapterError("profile must be an object")
        if parsed_profile.get("runtime") != runtime or (
            actual_model and parsed_profile.get("model") != actual_model):
            supplied_profile = None
        else:
            supplied_profile = canonical_json(parsed_profile)
    request = {"project_id": project, "profile": supplied_profile or "unqualified-runtime",
               "runtime": runtime, "event": payload.get("event", "context_refresh"), "terms": terms}
    # Leave space for the session identity and observe instructions in the
    # complete context delivered to the runtime.
    packet = select_from_store(store, request, max_packet_bytes=12 * 1024)
    store.wake_queue()
    identity = {"source": runtime, "project_id": project, "session_id": session}
    template = {"schema_version": "1.0", "source": runtime,
        "project_id": project, "session_id": session,
        "selected_instincts": [{"id": row["id"], "version": row["version"]}
                               for row in packet["items"] if row["kind"] == "instinct"],
        "selected_preferences": [row["id"] for row in packet["items"] if row["kind"] == "preference"],
        "evidence_kind": "reported", "evidence_refs": [], "evidence_excerpt": "",
        "summary": "compact durable experience"}
    command = shlex.join([sys.executable, str(Path(__file__).resolve().parents[1] / "pulse_instincts.py"),
                         "observe", "--auto-sequence", "--root", str(store.root)])
    displayed = [{key: value for key, value in item.items() if key not in {"reasons", "depth"}}
                 for item in packet["items"]]
    context = ("Shared procedural instincts and attributed preferences. Apply the reflexes within their triggers, "
        "under the user's directions and the project's ICM decisions.\n" + canonical_json(displayed) +
        "\nAt mission completion, record a reusable naming, decomposition or action-choice observation "
        "with the pulse_instincts MCP observe tool using this session identity. "
        "The intake assigns stable identifiers, timestamps and sequences. "
        "Skip observations without a durable signal. Use evidence_kind reported, observed, verified "
        "or user_preference, supported by compact redacted evidence. For Pulse outcomes, include "
        "the optional run_ref and run_verified fields according to the actual verification. "
        "The native session lifecycle owns the closure.\n" + command +
        "\nThe CLI accepts the same observation JSON on stdin.\n" + canonical_json(template))
    if len(context.encode("utf-8")) > MAX_PACKET_BYTES:
        raise AdapterError("complete runtime context exceeds the 16 KiB limit")
    receipt = store.record_delivery({"stage": "prepared", "runtime": runtime,
        "session_id": session, "packet": packet, "context": context})
    event_name = {"user_prompt_submit": "UserPromptSubmit", "pre_invocation": "PreInvocation"}.get(kind, "SessionStart")
    if runtime == "antigravity":
        steps = [{"ephemeral_message": context}] if event_name == "PreInvocation" else [{"system_message": {"system_message": context}}]
        return {"status": "ok", "inject_steps": steps,
                "delivery_id": receipt["delivery_id"]}
    return {"status": "ok", "hookSpecificOutput": {"hookEventName": event_name, "additionalContext": context},
            "delivery_id": receipt["delivery_id"]}


def launch_antigravity(store, *, runner=None) -> dict:
    binary = shutil.which("agy")
    if not binary:
        raise AdapterError("Antigravity CLI is unavailable")
    identifier = str(uuid4())
    environment = {**os.environ, "PULSE_INSTINCTS_MANAGED_SESSION": identifier}
    completed = (runner or subprocess.run)([binary], env=environment, check=False)
    binding = store.snapshot()["launches"].get(identifier)
    if completed.returncode or not binding:
        return {"status": "degraded", "native_exit_code": completed.returncode,
                "reason": "managed session has no verified normal-exit binding"}
    return handle_native_event(store, "antigravity", {"kind": "managed_session_closed",
        "launcher_owned": True, **binding})


def _inline_schema(value, definitions):
    if isinstance(value, list):
        return [_inline_schema(item, definitions) for item in value]
    if not isinstance(value, dict):
        return value
    if "$ref" in value:
        return _inline_schema(definitions[value["$ref"].split("/")[-1]], definitions)
    return {key: _inline_schema(item, definitions) for key, item in value.items()}


def mcp_tools() -> list[dict]:
    definitions = json.loads(RECORDS_SCHEMA_PATH.read_text())["$defs"]
    observation = _inline_schema(definitions["observation"], definitions)
    observation["required"] = [key for key in observation["required"]
                                if key not in {"observation_id", "observed_at", "sequence"}]
    identifier = definitions["identifier"]
    selection = {"type": "object", "additionalProperties": False, "required": ["project_id", "terms"],
        "properties": {"project_id": identifier, "terms": {"oneOf": [{"type": "string", "maxLength": 16384},
            {"type": "array", "maxItems": 64, "items": {"type": "string", "maxLength": 256}}]},
            "profile": {"type": "string", "maxLength": 512}, "runtime": {"type": "string", "maxLength": 32},
            "event": {"type": "string", "maxLength": 128}}}
    preference = {"type": "object", "additionalProperties": False,
        "required": ["id", "scope", "text", "source_ref"],
        "properties": {"id": identifier, "scope": {"enum": ["common", "project"]},
            "project_id": identifier, "text": {"type": "string", "minLength": 1, "maxLength": 16384},
            "source_ref": {"type": "string", "minLength": 1, "maxLength": 512}}}
    specs = [
        ("select", "Read relevant evaluated reflexes and attributed preferences for the current project and task.", selection, True),
        ("observe", "Record a compact redacted naming, decomposition or action experience. Admission assigns missing identity fields. Native lifecycle owns closure.", observation, False),
        ("remember_preference", "Record a directly expressed user preference with its source reference. Use project scope by default and common scope when explicitly requested. Inferred habits belong in observe.", preference, False),
    ]
    return [{"name": name, "description": description, "inputSchema": schema,
             "annotations": {"readOnlyHint": readonly, "destructiveHint": False,
                             "idempotentHint": True, "openWorldHint": False}}
            for name, description, schema, readonly in specs]


def _mcp_tool_call(store, name: str, arguments: dict, tools: list[dict]) -> dict:
    if os.environ.get("PULSE_INSTINCTS_ORIGIN") == "dream":
        raise AdapterError("Dream evaluation uses its supplied evidence and isolated transport")
    tool = next((entry for entry in tools if entry["name"] == name), None)
    if tool is None:
        raise AdapterError("unknown shared-instinct tool")
    data = dict(arguments)
    if name == "observe":
        data = redact_observation(data)
    if name == "remember_preference" and isinstance(data.get("text"), str):
        data["text"] = redact_observation({"summary": data["text"]})["summary"]
    Draft7Validator(tool["inputSchema"]).validate(data)
    if name == "select":
        data.setdefault("profile", "unknown")
        data.setdefault("event", "context_refresh")
        packet = select_from_store(store, data, max_packet_bytes=12 * 1024)
        visible = {key: packet[key] for key in ("project_id", "profile", "event", "items", "packet_bytes", "delivery_digest")}
        return {"status": "ok", **visible, "omitted_count": len(packet["omitted"])}
    if name == "observe":
        return store.admit_observation(data, assign_sequence=True)
    return store.save_preference({**data, "source": "user"})


def serve_mcp(store, *, input_stream=None, output_stream=None) -> int:
    """Serve bounded controller data operations over local stdio JSON-RPC."""
    incoming = input_stream or sys.stdin.buffer
    outgoing = output_stream or sys.stdout.buffer
    tools = mcp_tools()
    versions = ("2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25")
    initialized = False
    limit = 1024 * 1024

    def response(message):
        outgoing.write((canonical_json(message) + "\n").encode("utf-8"))
        outgoing.flush()

    while raw := incoming.readline(limit + 1):
        identifier = None
        try:
            if len(raw) > limit:
                while raw and not raw.endswith(b"\n"):
                    raw = incoming.readline(limit)
                raise AdapterError("request exceeds the 1 MiB protocol limit")
            request = json.loads(raw)
            if not isinstance(request, dict) or request.get("jsonrpc") != "2.0":
                raise AdapterError("invalid JSON-RPC request")
            if "id" not in request:
                continue
            identifier = request["id"]
            if isinstance(identifier, bool) or not isinstance(identifier, (int, str)):
                identifier = None
                raise AdapterError("invalid JSON-RPC request id")
            params = request.get("params", {})
            if not isinstance(params, dict):
                raise AdapterError("JSON-RPC params must be an object")
            method = request.get("method")
            if method == "initialize":
                proposed = params.get("protocolVersion")
                result = {"protocolVersion": proposed if proposed in versions else versions[-1],
                    "capabilities": {"tools": {}}, "serverInfo": {"name": "pulse_instincts", "version": "1.0.0"}}
                initialized = True
            elif method == "ping":
                result = {}
            elif not initialized:
                raise AdapterError("initialize the MCP connection first")
            elif method == "tools/list":
                result = {"tools": tools}
            elif method == "tools/call":
                arguments = params.get("arguments", {})
                if not isinstance(arguments, dict) or not isinstance(params.get("name"), str):
                    raise AdapterError("tool call needs a name and object arguments")
                try:
                    value = _mcp_tool_call(store, params["name"], arguments, tools)
                    result = {"content": [{"type": "text", "text": canonical_json(value)}], "isError": False}
                except ValidationError as error:
                    result = {"content": [{"type": "text", "text": f"input failed schema validation ({error.validator})"}], "isError": True}
                except (ContractError, StoreError, ValueError, TypeError, OSError) as error:
                    result = {"content": [{"type": "text", "text": str(error)[:2048]}], "isError": True}
            else:
                response({"jsonrpc": "2.0", "id": identifier,
                          "error": {"code": -32601, "message": "method not found"}})
                continue
            response({"jsonrpc": "2.0", "id": identifier, "result": result})
        except (AdapterError, json.JSONDecodeError, UnicodeDecodeError) as error:
            try:
                code = -32700 if isinstance(error, (json.JSONDecodeError, UnicodeDecodeError)) else -32600
                response({"jsonrpc": "2.0", "id": identifier,
                          "error": {"code": code, "message": str(error)}})
            except BrokenPipeError:
                return 0
        except BrokenPipeError:
            return 0
    return 0
