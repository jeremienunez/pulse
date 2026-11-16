"""Frozen case contracts and evidence-backed behavioural judgments."""

from __future__ import annotations

import json
from typing import Any

from .contracts import digest


class EvaluationError(ValueError):
    pass


def freeze_cases(cases: list[dict[str, Any]]) -> dict:
    if len(cases) != 3 or {row.get("role") for row in cases} != {"trigger", "negative", "unrelated"}:
        raise EvaluationError("cases must contain exactly trigger, negative and unrelated roles")
    identifiers = [row.get("case_id") for row in cases]
    if any(not isinstance(value, str) or not value for value in identifiers) or len(set(identifiers)) != 3:
        raise EvaluationError("case ids must be unique nonempty strings")
    frozen = json.loads(json.dumps(cases))
    for case in frozen:
        if not isinstance(case.get("prompt"), str) or not case["prompt"].strip():
            raise EvaluationError("case prompt must be nonempty")
        expectations = case.get("expectations")
        if not isinstance(expectations, list) or not expectations or any(
                not isinstance(value, str) or not value.strip() for value in expectations):
            raise EvaluationError("every case needs frozen expectations")
        if len(expectations) > 8 or len(set(expectations)) != len(expectations):
            raise EvaluationError("case criteria must be unique and bounded")
    frozen.sort(key=lambda row: row["case_id"])
    return {"schema_version": "1.0", "cases": frozen, "digest": digest(frozen)}


def score_response(case: dict, response: str, judgments: list[dict] | None = None) -> dict:
    if not isinstance(response, str) or not response.strip():
        raise EvaluationError("response is empty")
    if judgments is None:
        return {"case_id": case["case_id"], "role": case["role"], "passed": None, "criteria": []}
    expected = [f"{case['case_id']}:e{index + 1}" for index in range(len(case["expectations"]))]
    if len(judgments) != len(expected) or {row.get("criterion_id") for row in judgments} != set(expected):
        raise EvaluationError("judgment coverage differs from frozen criteria")
    by_id = {row["criterion_id"]: row for row in judgments}
    for identifier in expected:
        row = by_id[identifier]
        if row.get("verdict") not in {"pass", "fail", "uncertain"}:
            raise EvaluationError("unknown criterion verdict")
        if not isinstance(row.get("quote"), str) or not row["quote"] or row["quote"] not in response:
            raise EvaluationError("judgment quote must occur in the actual response")
        if not isinstance(row.get("reason"), str) or not row["reason"].strip():
            raise EvaluationError("judgment must explain its criterion verdict")
    ordered = [by_id[identifier] for identifier in expected]
    passed = None if any(row["verdict"] == "uncertain" for row in ordered) else all(
        row["verdict"] == "pass" for row in ordered)
    return {"case_id": case["case_id"], "role": case["role"], "passed": passed, "criteria": ordered}


def compare_runs(*, baseline: list[dict], candidate: list[dict]) -> dict:
    base = {row["case_id"]: row for row in baseline}
    current = {row["case_id"]: row for row in candidate}
    if len(base) != len(baseline) or len(current) != len(candidate) or set(base) != set(current):
        raise EvaluationError("duplicated or mismatched frozen cases")
    if any(base[key]["role"] != current[key]["role"] for key in base):
        raise EvaluationError("case role changed between conditions")
    uncertain = any(row.get("passed") is None for row in [*baseline, *candidate])
    regressions = [key for key in base if base[key].get("passed") is True and current[key].get("passed") is False]
    corrected = [key for key in base if base[key]["role"] == "trigger"
                 and base[key].get("passed") is False and current[key].get("passed") is True]
    all_pass = all(row.get("passed") is True for row in candidate)
    return {"comparable": not uncertain, "regressions": sorted(regressions),
            "corrected": sorted(corrected), "candidate_pass": all_pass,
            "eligible": not uncertain and all_pass and bool(corrected) and not regressions}
