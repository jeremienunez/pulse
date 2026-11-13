#!/usr/bin/env python3
"""Bounded local control plane for shared procedural instincts.

The command intentionally exposes a small JSON interface.  It does not launch a
model, install hooks, or mutate a runtime profile.  Later nodes add the store,
recall, provider, and adapter implementations behind these command names.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from instincts.contracts import ContractError, contract_status, validate_definition_text, validate_record


COMMANDS = ("status", "select", "observe", "close", "drain", "review", "gc", "adapter", "install")


def parse_json_stdin() -> object:
    try:
        return json.load(sys.stdin)
    except json.JSONDecodeError as error:
        raise ContractError(f"stdin must contain one JSON value: {error.msg}") from error


def result(status: str, **fields: object) -> dict[str, object]:
    return {"schema_version": "1.0", "status": status, **fields}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=COMMANDS)
    parser.add_argument("--root", type=Path, default=Path("/media/jerem/ubuntu2/agent-instincts/jerem"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--definition", type=Path)
    args = parser.parse_args(argv)

    try:
        if args.command == "status":
            payload = result("ok", **contract_status(args.root))
        elif args.command == "install":
            if not args.dry_run:
                raise ContractError("install requires --dry-run until a reviewed activation exists")
            payload = result("pending", root=str(args.root), reason="installation is not implemented")
        elif args.command == "adapter":
            payload = result("pending", reason="runtime adapters are not implemented")
        elif args.command in {"select", "observe", "close", "drain", "review", "gc"}:
            if args.command == "observe":
                validate_record(parse_json_stdin(), "observation")
            elif args.command == "close":
                validate_record(parse_json_stdin(), "closure")
            elif args.command == "review":
                validate_record(parse_json_stdin(), "candidate")
            payload = result("pending", reason=f"{args.command} is reserved for a later graph node")
        else:  # pragma: no cover - argparse makes this unreachable.
            raise ContractError("unknown command")

        if args.definition is not None:
            payload["definition"] = validate_definition_text(args.definition.read_text(encoding="utf-8"))
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        return 0
    except (ContractError, OSError) as error:
        print(json.dumps(result("rejected", error=str(error)), ensure_ascii=False, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
