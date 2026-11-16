"""Deterministic, bounded selection of instincts and attributed preferences."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

from .contracts import canonical_json, digest, validate_definition


MAX_INSTINCTS = 6
MAX_LINK_DEPTH = 2
MAX_PACKET_BYTES = 16 * 1024
TOKEN_RE = re.compile(r"[^\W_]+(?:[-_][^\W_]+)*", re.UNICODE)


class RecallError(ValueError):
    """A selection request or registry entry is inconsistent or unsafe."""


def _tokens(value: object) -> set[str]:
    if isinstance(value, str):
        normalized = unicodedata.normalize("NFKD", value.casefold())
        normalized = "".join(char for char in normalized if not unicodedata.combining(char))
        return set(TOKEN_RE.findall(normalized))
    if isinstance(value, list):
        return {token for item in value for token in _tokens(item)}
    return set()


def _bytes(value: object) -> int:
    return len(canonical_json(value).encode("utf-8"))


@dataclass(frozen=True)
class Candidate:
    key: tuple[str, str]
    entry: dict[str, Any]
    definition: dict[str, Any]
    score: int
    depth: int
    reasons: tuple[str, ...]


def _valid_scope(entry: dict[str, Any], project_id: str, event: str, terms: set[str]) -> tuple[int, tuple[str, ...]] | None:
    scope = entry.get("scope")
    if scope not in {"common", "project"}:
        raise RecallError("registry scope must be common or project")
    if scope == "project" and entry.get("project_id") != project_id:
        return None
    profiles = entry.get("evaluation_profiles", entry.get("qualified_profiles", []))
    if not isinstance(profiles, list) or not profiles:
        return None
    events = entry.get("events", [])
    if not isinstance(events, list) or (event != "context_refresh" and event not in events):
        return None
    keywords = _tokens(entry.get("keywords", []))
    overlap = sorted(keywords & terms)
    if not overlap and (scope == "common" or keywords):
        return None
    score = (100 if scope == "project" else 10) + 10 * len(overlap)
    reasons = [f"scope:{scope}", f"event:{event}"]
    reasons.extend(f"keyword:{token}" for token in overlap)
    return score, tuple(reasons)


def _preference_items(preferences: list[dict[str, Any]], project_id: str) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    selected: dict[str, dict[str, Any]] = {}
    omitted: list[dict[str, str]] = []
    for preference in sorted(preferences, key=lambda item: (item.get("scope") == "project", str(item.get("id", "")))):
        identifier = preference.get("id")
        scope = preference.get("scope")
        text = preference.get("text")
        if not isinstance(identifier, str) or not identifier or not isinstance(text, str) or not text:
            raise RecallError("preference needs nonempty id and text")
        if scope not in {"common", "project"}:
            raise RecallError("preference scope must be common or project")
        if scope == "project" and preference.get("project_id") != project_id:
            omitted.append({"id": identifier, "reason": "other-project"})
            continue
        if identifier in selected and selected[identifier]["scope"] == scope:
            raise RecallError("preference ids must be unique within their scope")
        item = {"kind": "preference", "id": identifier, "scope": scope, "text": text,
                "source": preference.get("source", "user")}
        if preference.get("source_ref"):
            item["source_ref"] = preference["source_ref"]
        selected[identifier] = item
    return sorted(selected.values(), key=lambda item: (item["scope"] != "project", item["id"])), omitted


def select_context(
    *,
    definitions: list[object],
    registry: list[dict[str, Any]],
    preferences: list[dict[str, Any]],
    request: dict[str, Any],
    max_instincts: int = MAX_INSTINCTS,
    max_link_depth: int = MAX_LINK_DEPTH,
    max_packet_bytes: int = MAX_PACKET_BYTES,
) -> dict[str, Any]:
    """Return a reproducible, complete-rule-only packet plus an omission trace."""

    project_id = request.get("project_id")
    profile = request.get("profile")
    event = request.get("event")
    if not all(isinstance(value, str) and value for value in (project_id, profile, event)):
        raise RecallError("request needs project_id, profile and event")
    if max_instincts < 0 or max_link_depth < 0 or max_packet_bytes <= 0:
        raise RecallError("selection limits must be positive")

    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for raw in definitions:
        definition = validate_definition(raw)
        key = (definition["id"], definition["version"])
        if key in by_key:
            raise RecallError("definitions must not repeat id/version")
        by_key[key] = definition

    terms = _tokens(request.get("terms", []))
    entries: dict[tuple[str, str], dict[str, Any]] = {}
    candidates: list[Candidate] = []
    omitted: list[dict[str, str]] = []
    for entry in registry:
        identifier, version = entry.get("id"), entry.get("version")
        if not isinstance(identifier, str) or not isinstance(version, str):
            raise RecallError("registry entry needs id and version")
        key = (identifier, version)
        if key in entries:
            raise RecallError("registry entries must not repeat id/version")
        entries[key] = entry
        if entry.get("linked_only", False) is not False and entry.get("linked_only") is not True:
            raise RecallError("linked_only must be boolean when provided")
        if entry.get("linked_only", False):
            continue
        definition = by_key.get(key)
        if definition is None:
            omitted.append({"id": f"{identifier}@{version}", "reason": "definition-unavailable"})
            continue
        match = _valid_scope(entry, project_id, event, terms)
        if match is None:
            omitted.append({"id": f"{identifier}@{version}", "reason": "not-applicable"})
            continue
        score, reasons = match
        candidates.append(Candidate(key, entry, definition, score, 0, reasons))

    selected: dict[tuple[str, str], Candidate] = {}
    queue = sorted(candidates, key=lambda item: (-item.score, item.key))
    while queue:
        candidate = queue.pop(0)
        if candidate.key in selected:
            continue
        selected[candidate.key] = candidate
        if candidate.depth >= max_link_depth:
            continue
        for link in candidate.entry.get("links", []):
            if not isinstance(link, dict) or not isinstance(link.get("id"), str) or not isinstance(link.get("version"), str):
                raise RecallError("links require id and version")
            linked_key = (link["id"], link["version"])
            linked_entry = entries.get(linked_key)
            linked_definition = by_key.get(linked_key)
            if linked_entry is None or linked_definition is None:
                omitted.append({"id": f"{linked_key[0]}@{linked_key[1]}", "reason": "linked-definition-unavailable"})
                continue
            linked_match = _valid_scope(linked_entry, project_id, event, terms)
            if linked_match is None:
                omitted.append({"id": f"{linked_key[0]}@{linked_key[1]}", "reason": "linked-not-applicable"})
                continue
            score, reasons = linked_match
            queue.append(Candidate(linked_key, linked_entry, linked_definition, score, candidate.depth + 1, reasons + (f"link:{candidate.key[0]}",)))
        queue.sort(key=lambda item: (-item.score, item.depth, item.key))

    selected_preferences, omitted_preferences = _preference_items(preferences, project_id)
    omitted.extend(omitted_preferences)
    if _bytes({"schema_version": "1.0", "items": selected_preferences}) > max_packet_bytes:
        raise RecallError("preferences alone exceed the packet limit")
    packet: list[dict[str, Any]] = selected_preferences.copy()
    for candidate in sorted(selected.values(), key=lambda item: (-item.score, item.depth, item.key)):
        item = {
            "kind": "instinct",
            "id": candidate.key[0],
            "version": candidate.key[1],
            "definition": candidate.definition,
            "reasons": list(candidate.reasons),
            "depth": candidate.depth,
            "verification": {
                "evaluation_profiles": candidate.entry.get("evaluation_profiles", candidate.entry.get("qualified_profiles", [])),
                "consumer_profile": profile, "consumer_qualification": "unverified",
                "consumer_observations": candidate.entry.get("consumer_observations", 0),
            },
        }
        if len([row for row in packet if row["kind"] == "instinct"]) >= max_instincts:
            omitted.append({"id": f"{candidate.key[0]}@{candidate.key[1]}", "reason": "instinct-limit"})
            continue
        prospective = {"schema_version": "1.0", "items": [*packet, item]}
        if _bytes(prospective) > max_packet_bytes:
            omitted.append({"id": f"{candidate.key[0]}@{candidate.key[1]}", "reason": "packet-limit"})
            continue
        packet.append(item)

    delivered = {"schema_version": "1.0", "items": packet}
    output = {
        "schema_version": "1.0",
        "project_id": project_id,
        "profile": profile,
        "event": event,
        "items": packet,
        "omitted": sorted(omitted, key=lambda item: (item["id"], item["reason"])),
    }
    output["packet_bytes"] = _bytes(delivered)
    output["delivery_digest"] = "sha256:" + __import__("hashlib").sha256(canonical_json(output).encode("utf-8")).hexdigest()
    return output


def select_from_store(store, request: dict, *, record_receipt: bool = False,
                      max_packet_bytes: int = MAX_PACKET_BYTES) -> dict:
    state = store.snapshot()
    active = set(state["active_versions"].values())
    definitions = {}
    registry = {}
    rows = sorted(state["candidates"].values(), key=lambda row: row.get("scope") == "project")
    for row in rows:
        version_id = row.get("version_id")
        if version_id not in active or row.get("status") != "active" or not row.get("qualification", {}).get("activation_eligible"):
            continue
        if row["scope"] == "project" and row.get("project_id") != request.get("project_id"):
            continue
        version = state["versions"].get(version_id)
        if not version:
            raise RecallError("active version has no durable record")
        payload = store._read_json(store._path(version["path"]))
        if digest(payload) != version["digest"] or payload["definition"] != row["definition"]:
            raise RecallError("active version integrity check failed")
        definition = payload["definition"]
        same_scope = store._active_versions_for(state, definition["id"], row["scope"], row.get("project_id"))
        if len(same_scope) > 1:
            raise RecallError("legacy active versions conflict and need explicit review")
        key = (definition["id"], definition["version"])
        if key in definitions and definitions[key] != definition:
            raise RecallError("active definition id/version has conflicting bytes")
        definitions[key] = definition
        registry[key] = {"id": key[0], "version": key[1],
            "scope": row["scope"], "project_id": row.get("project_id"),
            "events": definition["watched_events"], "keywords": row["keywords"],
            "links": row.get("links", []), "evaluation_profiles": [row["profile"]],
            "consumer_observations": sum(evidence["observations"] for evidence in state["runtime_evidence"].values()
                if evidence["instinct_id"] == key[0] and evidence["version"] == key[1]
                and evidence["source"] == request.get("runtime")
                and evidence["project_id"] == request.get("project_id"))}
    packet = select_context(definitions=list(definitions.values()), registry=list(registry.values()),
        preferences=list(state["preferences"].values()), request=request, max_packet_bytes=max_packet_bytes)
    if record_receipt:
        packet["receipt"] = store.record_delivery({"stage": "prepared", "packet": packet})
    return packet
