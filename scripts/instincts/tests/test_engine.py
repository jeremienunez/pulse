from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SCRIPTS_ROOT))

from instincts.engine import EngineError, build_job, decide, record_result


CASES = [
    {"case_id": "trigger", "role": "trigger", "prompt": "Name an invoice state.", "expectations": ["invoice"]},
    {"case_id": "negative", "role": "negative", "prompt": "Fix one typo.", "expectations": ["typo"]},
    {"case_id": "unrelated", "role": "unrelated", "prompt": "Report branch.", "expectations": ["branch"]},
]


class EngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.job = build_job(candidate_id="candidate:1", profile={"runtime": "claude", "model": "claude-opus-5-5", "effort": "low"}, baseline_guidance="Use existing terms.", candidate_guidance="Use invoice vocabulary.", cases=CASES)

    def test_freezes_exact_three_case_corpus(self) -> None:
        self.assertEqual(self.job["repetitions"], 2)
        self.assertEqual(self.job["max_model_calls"], 12)
        with self.assertRaisesRegex(EngineError, "profile"):
            build_job(candidate_id="x", profile={"runtime": "claude"}, baseline_guidance="a", candidate_guidance="b", cases=CASES)

    def test_tool_or_model_mismatch_is_rejected(self) -> None:
        with self.assertRaisesRegex(EngineError, "tool"):
            record_result(job=self.job, condition="baseline", repetition=1, case_id="trigger", response="invoice", model_reported="claude-opus-5-5", tools=["Read"])
        with self.assertRaisesRegex(EngineError, "model"):
            record_result(job=self.job, condition="baseline", repetition=1, case_id="trigger", response="invoice", model_reported="other", tools=[])

    def test_incomplete_and_regressing_results_do_not_qualify(self) -> None:
        self.assertEqual(decide(job=self.job, results=[])["status"], "pending")
        rows = []
        for condition in ("baseline", "candidate"):
            for repetition in (1, 2):
                for case in CASES:
                    response = case["expectations"][0]
                    if condition == "candidate" and case["case_id"] == "negative":
                        response = "different answer"
                    rows.append(record_result(job=self.job, condition=condition, repetition=repetition, case_id=case["case_id"], response=response, model_reported="claude-opus-5-5", tools=[]))
        self.assertEqual(decide(job=self.job, results=rows)["status"], "rejected")

    def test_two_frozen_repetitions_can_qualify_one_trigger_improvement(self) -> None:
        rows = []
        for condition in ("baseline", "candidate"):
            for repetition in (1, 2):
                for case in CASES:
                    response = case["expectations"][0]
                    if condition == "baseline" and case["case_id"] == "trigger":
                        response = "different wording"
                    rows.append(record_result(job=self.job, condition=condition, repetition=repetition, case_id=case["case_id"], response=response, model_reported="claude-opus-5-5", tools=[]))
        self.assertEqual(decide(job=self.job, results=rows)["status"], "qualified")


if __name__ == "__main__":
    unittest.main()
