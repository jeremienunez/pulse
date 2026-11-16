"""Qualification manifests that keep fixture and native runtime evidence distinct."""

from __future__ import annotations

from typing import Any, Callable

from .engine import build_job, decide, record_result


class QualificationError(ValueError):
    pass


def build_manifest(*, candidate_id: str, profile: dict[str, str], baseline_guidance: str, candidate_guidance: str, cases: list[dict[str, Any]], budget_remaining: int) -> dict[str, Any]:
    job = build_job(candidate_id=candidate_id, profile=profile, baseline_guidance=baseline_guidance, candidate_guidance=candidate_guidance, cases=cases)
    if budget_remaining < job["max_model_calls"]:
        raise QualificationError("remaining daily budget cannot cover the full frozen qualification")
    return {"schema_version": "1.0", "kind": "instinct-qualification", "job": job, "budget_reserved": job["max_model_calls"], "runtime": profile["runtime"], "status": "prepared"}


def complete_fixture(manifest: dict[str, Any], respond: Callable[[str, int, dict[str, Any]], dict[str, Any]]) -> dict[str, Any]:
    """Run a declared fixture/evidence producer; it never certifies a live runtime."""

    job = manifest.get("job")
    if not isinstance(job, dict) or manifest.get("status") != "prepared":
        raise QualificationError("qualification manifest is not prepared")
    results = []
    for condition in ("baseline", "candidate"):
        for repetition in (1, 2):
            for case in job["frozen_cases"]["cases"]:
                answer = respond(condition, repetition, case)
                results.append(
                    record_result(
                        job=job,
                        condition=condition,
                        repetition=repetition,
                        case_id=case["case_id"],
                        response=answer["response"],
                        model_reported=answer.get("model_reported"),
                        tools=answer.get("tools", []),
                        outcome=answer.get("outcome", "completed"),
                        judgments=answer.get("judgments"),
                    )
                )
    verdict = decide(job=job, results=results)
    return {"schema_version": "1.0", "kind": "instinct-qualification-result", "execution_kind": "fixture", "manifest_digest": job["digest"], "status": verdict["status"], "results": results, "verdict": verdict, "activation_eligible": False}


def runtime_matrix(rows: list[dict[str, Any]]) -> dict[str, Any]:
    allowed = {"complete", "not-tested", "unsupported", "blocked"}
    matrix = []
    for row in rows:
        runtime = row.get("runtime")
        context = row.get("context_delivery")
        closure = row.get("closure")
        behaviour = row.get("behaviour")
        if not isinstance(runtime, str) or any(value not in allowed for value in (context, closure, behaviour)):
            raise QualificationError("runtime matrix rows need known statuses")
        matrix.append({"runtime": runtime, "context_delivery": context, "closure": closure, "behaviour": behaviour, "evidence": row.get("evidence", [])})
    return {"schema_version": "1.0", "rows": sorted(matrix, key=lambda row: row["runtime"])}
