from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SCRIPTS_ROOT))

from instincts.contracts import ContractError, canonical_json, digest, validate_definition, validate_definition_set, validate_definition_text, validate_record


def definition() -> dict[str, object]:
    return {
        "namespace": "jerem",
        "name": "meaningful-names",
        "id": "jerem/meaningful-names",
        "type": "agent_instinct",
        "version": "0.1.0",
        "purpose": "Choose names from responsibility and established project vocabulary.",
        "status": "experimental",
        "priority": "medium",
        "trigger_conditions": ["A new domain name is needed."],
        "watched_events": ["before_file_edit"],
        "default_behavior": ["Inspect local vocabulary first."],
        "failure_patterns": ["Inventing a synonym for an established term."],
        "intervention_rules": ["Reuse the established term when it fits."],
        "escalation_rules": ["Ask when two domain terms remain equally plausible."],
        "confidence_rules": {"require_high_confidence_for": ["renaming public APIs"]},
        "output_contract": {"required_sections": ["reason"]},
        "examples": [{"input": "Name a new invoice state.", "response": "Use the accounting vocabulary."}],
        "anti_examples": [{"input": "Name a new invoice state.", "problem": "Do not rename unrelated stable APIs."}],
    }


class ContractTests(unittest.TestCase):
    def test_accepts_complete_definition(self) -> None:
        self.assertEqual(validate_definition(definition())["id"], "jerem/meaningful-names")

    def test_rejects_mismatched_identity(self) -> None:
        value = definition()
        value["id"] = "jerem/wrong-name"
        with self.assertRaisesRegex(ContractError, "namespace/name"):
            validate_definition(value)

    def test_rejects_unknown_event_and_parent_cycle(self) -> None:
        value = definition()
        value["watched_events"] = ["after_magic"]
        with self.assertRaisesRegex(ContractError, "unsupported"):
            validate_definition(value)
        value = definition()
        value["extends"] = ["jerem/meaningful-names"]
        with self.assertRaisesRegex(ContractError, "itself"):
            validate_definition(value)

    def test_definition_set_rejects_unknown_parent_and_cycle(self) -> None:
        child = definition()
        child["extends"] = ["jerem/parent"]
        with self.assertRaisesRegex(ContractError, "unknown"):
            validate_definition_set([child])
        parent = definition()
        parent["name"] = "parent"
        parent["id"] = "jerem/parent"
        parent["extends"] = ["jerem/meaningful-names"]
        with self.assertRaisesRegex(ContractError, "cycle"):
            validate_definition_set([child, parent])

    def test_rejects_anchors_and_extra_properties(self) -> None:
        with self.assertRaisesRegex(ContractError, "anchors"):
            validate_definition_text("base: &anchor {x: y}\n")
        value = definition()
        value["unexpected"] = True
        with self.assertRaisesRegex(ContractError, "(?i)additional properties"):
            validate_definition(value)

    def test_canonical_digest_is_order_independent(self) -> None:
        self.assertEqual(canonical_json({"b": 1, "a": 2}), '{"a":2,"b":1}')
        self.assertEqual(digest({"a": 2, "b": 1}), digest({"b": 1, "a": 2}))

    def test_records_validate_bounded_observation_and_close(self) -> None:
        observation = {"schema_version": "1.0", "observation_id": "obs:1", "source": "claude", "project_id": "pulse", "session_id": "session:1", "sequence": 0, "observed_at": "2026-11-06T00:00:00Z", "selected_instincts": [], "summary": "A user correction was observed."}
        self.assertEqual(validate_record(observation, "observation")["observation_id"], "obs:1")
        close = {"schema_version": "1.0", "closure_id": "close:1", "source": "claude", "project_id": "pulse", "session_id": "session:1", "upper_sequence": 0, "closed_at": "2026-11-06T00:00:01Z"}
        self.assertEqual(validate_record(close, "closure")["closure_id"], "close:1")
        observation["summary"] = ""
        with self.assertRaises(ContractError):
            validate_record(observation, "observation")

    def test_cli_refuses_real_install_and_validates_json_input(self) -> None:
        command = [sys.executable, str(SCRIPTS_ROOT / "pulse_instincts.py"), "install"]
        refused = subprocess.run(command, input="{}", text=True, capture_output=True, check=False)
        self.assertEqual(refused.returncode, 2)
        self.assertEqual(json.loads(refused.stdout)["status"], "rejected")
        status = subprocess.run([sys.executable, str(SCRIPTS_ROOT / "pulse_instincts.py"), "status"], text=True, capture_output=True, check=True)
        self.assertEqual(json.loads(status.stdout)["activation"], "not-installed")


if __name__ == "__main__":
    unittest.main()
