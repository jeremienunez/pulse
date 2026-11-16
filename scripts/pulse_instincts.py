#!/usr/bin/env python3
"""JSON commands for durable shared instincts and deferred Dream processing."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from instincts.adapters import handle_native_event, launch_antigravity, serve_mcp
from instincts.contracts import ContractError, validate_definition_text
from instincts.engine import DreamWorker
from instincts.install import build_runtime_plan
from instincts.recall import select_from_store
from instincts.store import Store, StoreError


COMMANDS = ("status", "select", "observe", "close", "drain", "review", "gc", "adapter", "install")


def parse_json_stdin() -> dict:
    raw = sys.stdin.read(1024 * 1024 + 1)
    if len(raw.encode("utf-8")) > 1024 * 1024:
        raise ContractError("JSON input exceeds the 1 MiB command limit")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ContractError("command input must be a JSON object")
    return value


def configured_model() -> str:
    settings = Path.home() / ".claude/settings.json"
    if settings.is_file():
        value = json.loads(settings.read_text(encoding="utf-8")).get("model", "opus")
        if isinstance(value, str) and value:
            return value
    return "opus"


def execute(args) -> dict:
    store = Store(args.root)
    if args.command == "status":
        return store.status()
    if args.command == "drain":
        worker = DreamWorker(store, model=args.model or configured_model(), effort=args.effort)
        result = worker.drain()
        passes = [result]
        while args.all and result.get("processed") and len(passes) < 16:
            result = worker.drain()
            passes.append(result)
        result = {**result, "passes": passes, "processed": sum(row.get("processed", 0) for row in passes)}
        if any(row.get("status") == "pending" for row in passes) and result.get("status") == "ok":
            result["status"] = "pending"
        result["maintenance"] = store.gc()
        return result
    if args.command == "gc":
        return store.gc()
    if args.command == "install":
        if not args.dry_run:
            raise ContractError("install requires --dry-run until a reviewed activation exists")
        return build_runtime_plan(runtime=args.runtime, root=args.root,
                                  controller=Path(__file__).resolve(), profile=args.profile)
    if args.command == "adapter" and args.launch:
        if args.runtime != "antigravity":
            raise ContractError("--launch belongs to the Antigravity managed-session adapter")
        return launch_antigravity(store)
    request = parse_json_stdin()
    if args.command == "observe":
        return store.admit_observation(request, assign_sequence=args.auto_sequence)
    if args.command == "close":
        return store.close_range(request)
    if args.command == "select":
        return {"status": "ok", **select_from_store(store, request)}
    if args.command == "review":
        if request.get("action") == "resume-closure":
            return store.resume_closure(request["closure_id"], expected_digest=request["expected_digest"])
        if request.get("action") == "preference":
            return store.save_preference(request["preference"])
        if request.get("action") == "list":
            return {"status": "ok", "candidates": store.snapshot()["candidates"]}
        return store.review(request["candidate_id"], request["action"],
            expected_digest=request["expected_digest"], approval=request.get("approval_reference"),
            expected_active=request.get("expected_active"))
    if args.command == "adapter":
        if args.event:
            request.setdefault("hook_event_name", args.event)
        return handle_native_event(store, args.runtime, request, profile=args.profile)
    raise ContractError("unsupported operation")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=COMMANDS)
    parser.add_argument("--root", type=Path, default=Path("/media/jerem/ubuntu2/agent-instincts/jerem"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--definition", type=Path)
    parser.add_argument("--runtime", choices=("claude", "codex", "antigravity", "openbot"), default="claude")
    parser.add_argument("--profile")
    parser.add_argument("--model")
    parser.add_argument("--event")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--auto-sequence", action="store_true")
    parser.add_argument("--stdio", action="store_true")
    parser.add_argument("--launch", action="store_true")
    parser.add_argument("--effort", choices=("low", "medium", "high", "xhigh", "max"), default="low")
    args = parser.parse_args(argv)
    try:
        if args.stdio:
            if args.command != "adapter":
                raise ContractError("--stdio belongs to the MCP adapter")
            return serve_mcp(Store(args.root))
        result = {"schema_version": "1.0", **execute(args)}
        if args.definition:
            result["definition"] = validate_definition_text(args.definition.read_text(encoding="utf-8"))
        exit_code = 1 if result.get("status") in {"blocked_unknown", "rejected", "degraded"} else 0
        if args.command == "adapter" and not args.launch and args.runtime != "openbot":
            result = {key: result[key] for key in ("hookSpecificOutput", "inject_steps") if key in result}
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return exit_code
    except (ContractError, StoreError, OSError, ValueError, KeyError) as error:
        print(json.dumps({"schema_version": "1.0", "status": "rejected", "error": str(error)}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
