from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SCRIPTS_ROOT))

from instincts.qualify import QualificationError, build_manifest, complete_fixture, runtime_matrix


CASES = [
    {"case_id": "trigger", "role": "trigger", "prompt": "Name invoice state.", "expectations": ["invoice"]},
    {"case_id": "negative", "role": "negative", "prompt": "Fix typo.", "expectations": ["typo"]},
    {"case_id": "unrelated", "role": "unrelated", "prompt": "Report branch.", "expectations": ["branch"]},
]
PROFILE = {"runtime": "claude", "model": "claude-opus-5-5", "effort": "low"}


class QualificationTests(unittest.TestCase):
    def manifest(self) -> dict[str, object]:
        return build_manifest(candidate_id="candidate:1", profile=PROFILE, baseline_guidance="baseline", candidate_guidance="candidate", cases=CASES, budget_remaining=12)

    def test_full_budget_is_reserved_before_a_fixture_runs(self) -> None:
        self.assertEqual(self.manifest()["budget_reserved"], 12)
        with self.assertRaisesRegex(QualificationError, "budget"):
            build_manifest(candidate_id="candidate:1", profile=PROFILE, baseline_guidance="baseline", candidate_guidance="candidate", cases=CASES, budget_remaining=11)

    def test_fixture_result_stays_non_activating(self) -> None:
        def respond(condition: str, _: int, case: dict[str, str]) -> dict[str, object]:
            response = case["expectations"][0]
            if condition == "baseline" and case["case_id"] == "trigger":
                response = "other wording"
            judgments = [{"criterion_id": f"{case['case_id']}:e1", "quote": response,
                "verdict": "fail" if condition == "baseline" and case["case_id"] == "trigger" else "pass",
                "reason": "Controlled fixture judgement."}]
            return {"response": response, "model_reported": "claude-opus-5-5", "tools": [], "judgments": judgments}
        result = complete_fixture(self.manifest(), respond)
        self.assertEqual(result["status"], "qualified")
        self.assertFalse(result["activation_eligible"])

    def test_fixture_tool_use_is_rejected(self) -> None:
        def respond(_: str, __: int, case: dict[str, str]) -> dict[str, object]:
            return {"response": case["expectations"][0], "model_reported": "claude-opus-5-5", "tools": ["Read"]}
        with self.assertRaisesRegex(Exception, "tool"):
            complete_fixture(self.manifest(), respond)

    def test_runtime_matrix_keeps_unsupported_and_not_tested_visible(self) -> None:
        matrix = runtime_matrix([
            {"runtime": "claude", "context_delivery": "complete", "closure": "complete", "behaviour": "not-tested", "evidence": ["receipt"]},
            {"runtime": "openbot", "context_delivery": "not-tested", "closure": "not-tested", "behaviour": "not-tested", "evidence": []},
        ])
        self.assertEqual(matrix["rows"][0]["runtime"], "claude")
        with self.assertRaises(QualificationError):
            runtime_matrix([{"runtime": "bad", "context_delivery": "yes", "closure": "no", "behaviour": "no"}])


if __name__ == "__main__":
    unittest.main()
