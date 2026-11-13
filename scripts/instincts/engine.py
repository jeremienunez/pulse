"""Pure job construction and decision logic for bounded Dream qualification."""

from __future__ import annotations

from typing import Any

from .evaluation import EvaluationError, compare_runs, digest, freeze_cases, score_response


class EngineError(ValueError):
    pass


def build_job(*, candidate_id: str, profile: dict[str, str], baseline_guidance: str, candidate_guidance: str, cases: list[dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(candidate_id, str) or not candidate_id:
        raise EngineError("candidate_id is required")
    if not all(isinstance(profile.get(field), str) and profile[field] for field in ("runtime", "model", "effort")):
        raise EngineError("profile needs runtime, model, and effort")
    if not isinstance(baseline_guidance, str) or not isinstance(candidate_guidance, str):
        raise EngineError("guidance must be strings")
    frozen = freeze_cases(cases)
    job = {
        "schema_version": "1.0",
        "candidate_id": candidate_id,
        "profile": profile,
        "frozen_cases": frozen,
        "conditions": {
            "baseline": {"guidance": baseline_guidance, "digest": digest(baseline_guidance)},
            "candidate": {"guidance": candidate_guidance, "digest": digest(candidate_guidance)},
        },
        "repetitions": 2,
        "max_model_calls": 12,
    }
    job["digest"] = digest(job)
    return job


def record_result(*, job: dict[str, Any], condition: str, repetition: int, case_id: str, response: str, model_reported: str | None, tools: list[str], outcome: str = "completed") -> dict[str, Any]:
    if condition not in {"baseline", "candidate"} or repetition not in {1, 2}:
        raise EngineError("invalid condition or repetition")
    if outcome != "completed":
        return {"job_digest": job["digest"], "condition": condition, "repetition": repetition, "case_id": case_id, "outcome": "blocked_unknown"}
    if tools:
        raise EngineError("tool use invalidates evaluation evidence")
    if model_reported != job["profile"]["model"]:
        raise EngineError("reported model does not match the frozen profile")
    cases = {case["case_id"]: case for case in job["frozen_cases"]["cases"]}
    if case_id not in cases:
        raise EngineError("result case is absent from the frozen corpus")
    return {
        "job_digest": job["digest"], "condition": condition, "repetition": repetition,
        "case_id": case_id, "outcome": "completed", "model_reported": model_reported,
        "tools": [], "response": response, "score": score_response(cases[case_id], response),
    }


def decide(*, job: dict[str, Any], results: list[dict[str, Any]]) -> dict[str, Any]:
    expected = {(condition, repetition, case["case_id"]) for condition in ("baseline", "candidate") for repetition in (1, 2) for case in job["frozen_cases"]["cases"]}
    actual = {(item.get("condition"), item.get("repetition"), item.get("case_id")) for item in results}
    if actual != expected or any(item.get("job_digest") != job["digest"] or item.get("outcome") != "completed" for item in results):
        return {"status": "pending", "reason": "incomplete-or-uncertain-evidence"}
    by_condition: dict[str, dict[int, list[dict[str, Any]]]] = {"baseline": {1: [], 2: []}, "candidate": {1: [], 2: []}}
    for result in results:
        by_condition[result["condition"]][result["repetition"]].append(result["score"])
    try:
        comparisons = [
            compare_runs(baseline=by_condition["baseline"][repetition], candidate=by_condition["candidate"][repetition])
            for repetition in (1, 2)
        ]
    except EvaluationError as error:
        return {"status": "pending", "reason": str(error)}
    if any(not comparison["eligible"] for comparison in comparisons):
        return {"status": "rejected", "reason": "no-demonstrated-improvement-or-regression", "comparisons": comparisons}
    return {"status": "qualified", "comparisons": comparisons}
