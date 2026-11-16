from __future__ import annotations

import sys
import unittest
import json
import tempfile
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SCRIPTS_ROOT))

from instincts.engine import DreamWorker, EngineError, build_job, decide, record_result, response_object, _native_proof
from instincts.evaluation import EvaluationError, score_response
from instincts.provider import ProviderResult
from instincts.store import Store


CASES = [
    {"case_id": "trigger", "role": "trigger", "prompt": "Name an invoice state.", "expectations": ["invoice"]},
    {"case_id": "negative", "role": "negative", "prompt": "Fix one typo.", "expectations": ["typo"]},
    {"case_id": "unrelated", "role": "unrelated", "prompt": "Report branch.", "expectations": ["branch"]},
]


class EngineTests(unittest.TestCase):
    def test_claude_native_proof_never_certifies_another_runtime(self) -> None:
        profile = {"runtime": "claude", "model": "claude-opus-5-5", "effort": "low"}
        proof = {"execution_kind": "native", "wire_requests": [{"model": profile["model"],
            "effort": "low", "tools": [], "http_status": 200}]}
        self.assertTrue(_native_proof(proof, profile))
        for runtime in ("codex", "antigravity", "openbot"):
            self.assertFalse(_native_proof(proof, {**profile, "runtime": runtime}))

    def test_real_queue_path_with_simulated_provider_is_processed_exactly_once(self) -> None:
        definition = {
            "namespace": "jerem", "name": "naming", "id": "jerem/naming", "type": "agent_instinct",
            "version": "0.1.0", "purpose": "Use project vocabulary", "status": "experimental",
            "priority": "medium", "trigger_conditions": ["new name"], "watched_events": ["before_file_edit"],
            "default_behavior": ["Inspect domain vocabulary"], "failure_patterns": ["invent synonyms"],
            "intervention_rules": ["Reuse an appropriate term"], "escalation_rules": ["Unresolved ambiguity"],
            "confidence_rules": {"require_high_confidence_for": ["public API naming"]},
            "output_contract": {"required_sections": ["reason"]},
            "examples": [{"input": "Name invoice status", "response": "Use invoice status vocabulary"}],
            "anti_examples": [{"input": "Fix typo", "problem": "Do not rename stable APIs"}]}
        calls = []
        def invoke(**kwargs):
            prompt = kwargs["prompt"]
            calls.append(prompt)
            if prompt.startswith("Return one JSON object"):
                answer = json.dumps({"decision": "candidate", "domain": "naming", "critical": False,
                    "definition": definition, "keywords": ["naming"], "cases": CASES})
            elif prompt.startswith("Judge every"):
                data = json.loads(prompt.split("\n", 1)[1])
                self.assertEqual(data["definition"], definition)
                self.assertEqual(data["scope"], "project")
                judgments = []
                for row in data["responses"]:
                    passed = row["condition"] != "baseline" or row["case_id"] != "trigger"
                    judgments.append({"condition": row["condition"], "repetition": row["repetition"],
                        "case_id": row["case_id"], "criteria": [{"criterion_id": row["case_id"] + ":e1",
                        "verdict": "pass" if passed else "fail", "quote": row["response"], "reason": "Fixture verdict"}]})
                answer = json.dumps({"critical": False, "judgments": judgments})
            else:
                self.assertNotIn('"expectations"', prompt)
                answer = "Use established vocabulary" if "No additional instinct." not in prompt else "Invent a synonym"
            return ProviderResult("completed", answer, kwargs["model"], "claude-opus-5-5", evidence={"execution_kind": "fixture"})
        with tempfile.TemporaryDirectory(prefix="dream-queue-") as folder:
            store = Store(Path(folder) / "store")
            store.admit_observation({"schema_version": "1.0", "observation_id": "o1", "source": "claude",
                "project_id": "p", "session_id": "s", "sequence": 0, "observed_at": "2026-11-16T10:00:00Z",
                "selected_instincts": [], "summary": "A naming correction", "evidence_kind": "verified"})
            store.close_range({"schema_version": "1.0", "closure_id": "c1", "source": "claude",
                "project_id": "p", "session_id": "s", "upper_sequence": 0, "closed_at": "2026-11-16T10:01:00Z"})
            worker = DreamWorker(store, model="opus", invoke=invoke)
            first = worker.drain()
            self.assertEqual(first["processed"], 1)
            self.assertEqual(first["disposition"], "pending_review")
            self.assertEqual(len(calls), 14)
            self.assertEqual(worker.drain()["processed"], 0)
            self.assertEqual(len(calls), 14)
            self.assertEqual(store.snapshot()["active_versions"], {})
            candidate = store.snapshot()["candidates"]["c1"]
            self.assertFalse(candidate["qualification"]["activation_eligible"])
            store.admit_observation({"schema_version": "1.0", "observation_id": "o2", "source": "codex",
                "project_id": "p", "session_id": "another", "sequence": 0, "observed_at": "2026-11-16T10:02:00Z",
                "selected_instincts": [], "summary": "A naming correction", "evidence_kind": "verified"})
            store.close_range({"schema_version": "1.0", "closure_id": "c2", "source": "codex",
                "project_id": "p", "session_id": "another", "upper_sequence": 0, "closed_at": "2026-11-16T10:03:00Z"})
            self.assertEqual(worker.drain()["disposition"], "merged")
            self.assertEqual(len(calls), 14)
            self.assertEqual(store.snapshot()["candidates"]["c1"]["provenance"], ["o1", "o2"])

    def test_fenced_json_is_exactly_parsed_without_prose_or_semantic_repairs(self) -> None:
        self.assertEqual(response_object('```json\n{"decision":"skip"}\n```'), {"decision": "skip"})
        with self.assertRaises(ValueError):
            response_object('Some prose\n{"decision":"skip"}')
    def test_word_overlap_is_never_a_semantic_pass(self) -> None:
        response = "Ignore the invoice naming convention and invent synonyms."
        self.assertIsNone(score_response(CASES[0], response)["passed"])
        with self.assertRaisesRegex(EvaluationError, "quote"):
            score_response(CASES[0], response, [{"criterion_id": "trigger:e1", "verdict": "pass",
                "quote": "I followed the convention", "reason": "Fabricated quotation"}])

    def test_mutated_job_and_missing_trace_cannot_qualify(self) -> None:
        with self.assertRaisesRegex(EngineError, "tool"):
            record_result(job=self.job, condition="baseline", repetition=1, case_id="trigger",
                response="invoice", model_reported="claude-opus-5-5", tools=None)
        self.job["frozen_cases"]["cases"][0]["prompt"] = "A changed case"
        with self.assertRaisesRegex(EngineError, "changed"):
            decide(job=self.job, results=[])
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
                    judgments = [{"criterion_id": f"{case['case_id']}:e1", "quote": response,
                        "verdict": "fail" if condition == "candidate" and case["case_id"] == "negative" else "pass",
                        "reason": "Controlled fixture judgement."}]
                    rows.append(record_result(job=self.job, condition=condition, repetition=repetition, case_id=case["case_id"], response=response, model_reported="claude-opus-5-5", tools=[], judgments=judgments))
        self.assertEqual(decide(job=self.job, results=rows)["status"], "rejected")

    def test_two_frozen_repetitions_can_qualify_one_trigger_improvement(self) -> None:
        rows = []
        for condition in ("baseline", "candidate"):
            for repetition in (1, 2):
                for case in CASES:
                    response = case["expectations"][0]
                    if condition == "baseline" and case["case_id"] == "trigger":
                        response = "different wording"
                    judgments = [{"criterion_id": f"{case['case_id']}:e1", "quote": response,
                        "verdict": "fail" if condition == "baseline" and case["case_id"] == "trigger" else "pass",
                        "reason": "Controlled fixture judgement."}]
                    rows.append(record_result(job=self.job, condition=condition, repetition=repetition, case_id=case["case_id"], response=response, model_reported="claude-opus-5-5", tools=[], judgments=judgments))
        self.assertEqual(decide(job=self.job, results=rows)["status"], "qualified")
        self.assertFalse(decide(job=self.job, results=rows)["activation_eligible"])


if __name__ == "__main__":
    unittest.main()
