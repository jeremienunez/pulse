"""Versioned, deterministic contracts for shared-instinct definitions and records."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft7Validator


CONTRACT_VERSION = "1.0"
UPSTREAM_SPEC_VERSION = "0.1.0"
DEFINITION_SCHEMA_PATH = Path(__file__).with_name("schemas") / "definition.schema.json"
RECORDS_SCHEMA_PATH = Path(__file__).with_name("schemas") / "records.schema.json"
NAMESPACE_RE = re.compile(r"^[a-z0-9-]+$")
IDENTIFIER_RE = re.compile(r"^[a-z0-9-]+/[a-z0-9-]+$")
SEMVER_RE = re.compile(r"^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")
ALLOWED_EVENTS = frozenset(
    {
        "before_file_edit",
        "before_shell_command",
        "before_dependency_add",
        "before_architecture_change",
        "before_release",
        "before_claiming_success",
        "after_test_failure",
        "after_user_correction",
        "after_validation_failure",
        "before_docs_update",
        "before_marketing_claim",
        "before_public_api_change",
        "before_security_change",
    }
)


class ContractError(ValueError):
    """An untrusted definition or record violates a local contract."""


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value: object) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _load_schema(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:  # pragma: no cover - packaging failure.
        raise ContractError(f"cannot load schema {path.name}: {error}") from error
    Draft7Validator.check_schema(value)
    return value


def _first_schema_error(schema: dict[str, Any], value: object) -> str | None:
    errors = sorted(Draft7Validator(schema).iter_errors(value), key=lambda item: list(item.path))
    if not errors:
        return None
    error = errors[0]
    location = "/".join(str(part) for part in error.path) or "<root>"
    return f"{location}: {error.message}"


def _load_yaml_no_aliases(text: str) -> object:
    try:
        events = list(yaml.parse(text, Loader=yaml.SafeLoader))
    except yaml.YAMLError as error:
        raise ContractError(f"invalid YAML: {error}") from error
    if any(getattr(event, "anchor", None) is not None for event in events):
        raise ContractError("YAML anchors and aliases are not accepted")
    try:
        return yaml.safe_load(text)
    except yaml.YAMLError as error:  # pragma: no cover - parse normally catches it.
        raise ContractError(f"invalid YAML: {error}") from error


def _require_strings(value: dict[str, Any], fields: tuple[str, ...]) -> None:
    for field in fields:
        if not isinstance(value.get(field), str) or not value[field].strip():
            raise ContractError(f"{field} must be a nonempty string")


def validate_definition(value: object) -> dict[str, Any]:
    error = _first_schema_error(_load_schema(DEFINITION_SCHEMA_PATH), value)
    if error:
        raise ContractError(f"invalid instinct definition: {error}")
    assert isinstance(value, dict)
    _require_strings(value, ("namespace", "name", "id", "version", "purpose"))
    namespace = value["namespace"]
    name = value["name"]
    identifier = value["id"]
    if not NAMESPACE_RE.fullmatch(namespace) or not NAMESPACE_RE.fullmatch(name):
        raise ContractError("namespace and name must use lowercase hyphen-case")
    if not IDENTIFIER_RE.fullmatch(identifier) or identifier != f"{namespace}/{name}":
        raise ContractError("id must exactly equal namespace/name")
    if not SEMVER_RE.fullmatch(value["version"]):
        raise ContractError("version must be semantic versioning")
    watched = value["watched_events"]
    unknown = sorted(set(watched) - ALLOWED_EVENTS)
    if unknown:
        raise ContractError("watched_events contains unsupported values: " + ", ".join(unknown))
    parents = value.get("extends", [])
    if namespace == "core" and parents:
        raise ContractError("core instincts must not declare extends")
    if len(set(parents)) != len(parents):
        raise ContractError("extends must not repeat an instinct id")
    if identifier in parents:
        raise ContractError("an instinct must not extend itself")
    for parent in parents:
        if not isinstance(parent, str) or not IDENTIFIER_RE.fullmatch(parent):
            raise ContractError("extends entries must be fully qualified instinct ids")
    return value


def validate_definition_text(text: str) -> dict[str, Any]:
    return validate_definition(_load_yaml_no_aliases(text))


def validate_definition_set(values: list[object]) -> list[dict[str, Any]]:
    """Validate local inheritance as a complete, acyclic graph.

    A single definition may name an upstream parent.  A set is intentionally
    stricter: every parent must be present, so the active local profile cannot
    silently resolve a different definition later.
    """

    definitions = [validate_definition(value) for value in values]
    by_id = {definition["id"]: definition for definition in definitions}
    if len(by_id) != len(definitions):
        raise ContractError("definition set contains duplicate ids")
    for identifier, definition in by_id.items():
        for parent in definition.get("extends", []):
            if parent not in by_id:
                raise ContractError(f"{identifier} extends unknown local parent {parent}")

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(identifier: str) -> None:
        if identifier in visiting:
            raise ContractError("definition set contains an inheritance cycle")
        if identifier in visited:
            return
        visiting.add(identifier)
        for parent in by_id[identifier].get("extends", []):
            visit(parent)
        visiting.remove(identifier)
        visited.add(identifier)

    for identifier in by_id:
        visit(identifier)
    return definitions


def validate_record(value: object, kind: str) -> dict[str, Any]:
    schema = _load_schema(RECORDS_SCHEMA_PATH)
    definitions = schema["$defs"]
    if kind not in definitions:
        raise ContractError(f"unknown record kind: {kind}")
    error = _first_schema_error({"$ref": f"#/$defs/{kind}", "$defs": definitions}, value)
    if error:
        raise ContractError(f"invalid {kind} record: {error}")
    assert isinstance(value, dict)
    if value.get("schema_version") != CONTRACT_VERSION:
        raise ContractError("record schema_version is unsupported")
    return value


def contract_status(root: Path) -> dict[str, object]:
    resolved = root.resolve(strict=False)
    return {
        "contract_version": CONTRACT_VERSION,
        "upstream_instinct_spec_version": UPSTREAM_SPEC_VERSION,
        "root": str(resolved),
        "root_exists": resolved.exists(),
        "activation": "not-installed",
    }
