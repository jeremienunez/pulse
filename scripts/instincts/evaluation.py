"""Frozen behavioural cases and conservative, deterministic result comparison."""

from __future__ import annotations

from hashlib import sha256
from typing import Any

from .contracts import canonical_json


class EvaluationError(ValueError):
    pass


def digest(value: object) -> str:
    return "sha256:" + sha256(canonical_json(value).encode("utf-8")).hexdigest()


def freeze_cases(cases: list[dict[str, Any]]) -> dict[str, Any]:
    if len(cases) != 3:
        raise EvaluationError("each evaluation requires trigger, negative, and unrelated cases")
    allowed_roles = {"trigger", "negative", "unrelated"}
    if {case.get("role") for case in cases} != allowed_roles:
        raise EvaluationError("case roles must be exactly trigger, negative, unrelated")
    identifiers = [case.get("case_id") for case in cases]
    if len(set(identifiers)) != len(identifiers) or any(not isinstance(identifier, str) or not identifier for identifier in identifiers):
        raise EvaluationError("case ids must be unique nonempty strings")
    for case in cases:
        if not isinstance(case.get("prompt"), str) or not case["prompt"].strip():
            raise EvaluationError("case prompt must be nonempty")
        expectations = case.get("expectations")
        if not isinstance(expectations, list) or not expectations or any(not isinstance(item, str) or not item for item in expectations):
            raise EvaluationError("each case needs frozen expectations")
    ordered = sorted(cases, key=lambda item: item["case_id"])
    return {"schema_version": "1.0", "cases": ordered, "digest": digest(ordered)}


def score_response(case: dict[str, Any], response: str) -> dict[str, Any]:
    if not isinstance(response, str) or not response.strip():
        raise EvaluationError("response is empty")
    lowered = response.lower()
    results = []
    for expectation in case["expectations"]:
        tokens = [token for token in expectation.lower().replace("/", " ").split() if len(token) > 3]
        passed = bool(tokens) and any(token in lowered for token in tokens)
        results.append({"expectation": expectation, "passed": passed})
    return {"case_id": case["case_id"], "role": case["role"], "passed": all(item["passed"] for item in results), "criteria": results}


def compare_runs(*, baseline: list[dict[str, Any]], candidate: list[dict[str, Any]]) -> dict[str, Any]:
    base = {item.get("case_id"): item for item in baseline}
    current = {item.get("case_id"): item for item in candidate}
    if set(base) != set(current) or None in base:
        raise EvaluationError("baseline and candidate must cover the same frozen cases")
    regressions = sorted(identifier for identifier in base if base[identifier].get("passed") and not current[identifier].get("passed"))
    trigger_ids = [identifier for identifier, item in current.items() if item.get("role") == "trigger"]
    corrected = sorted(identifier for identifier in trigger_ids if not base[identifier].get("passed") and current[identifier].get("passed"))
    candidate_pass = all(item.get("passed") for item in current.values())
    return {"comparable": True, "regressions": regressions, "corrected": corrected, "candidate_pass": candidate_pass, "eligible": candidate_pass and bool(corrected) and not regressions}
