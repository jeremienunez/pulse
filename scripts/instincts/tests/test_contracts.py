from __future__ import annotations

import json
import subprocess
import sys
import unittest
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
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
    def test_stdio_mcp_normal_entry_point_selects_and_records_with_fixed_store(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "store"
            record = {"schema_version": "1.0", "source": "codex", "project_id": "p", "session_id": "s",
                      "selected_instincts": [], "summary": "Use the observed domain vocabulary."}
            private_reference = "synthetic-private-reference-" * 40
            requests = [
                {"id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}},
                {"method": "notifications/initialized"},
                {"id": 2, "method": "tools/list"},
                {"id": 3, "method": "tools/call", "params": {"name": "observe", "arguments": record}},
                {"id": 4, "method": "tools/call", "params": {"name": "observe", "arguments": record}},
                {"id": 5, "method": "tools/call", "params": {"name": "remember_preference", "arguments": {
                    "id": "language", "scope": "project", "project_id": "p", "text": "Use French.", "source_ref": "chat:test"}}},
                {"id": 6, "method": "tools/call", "params": {"name": "select", "arguments": {"project_id": "p", "terms": []}}},
                {"id": 7, "method": "tools/call", "params": {"name": "review", "arguments": {}}},
                {"id": 8, "method": "tools/call", "params": {"name": "remember_preference", "arguments": {
                    "id": "invalid", "scope": "common", "text": "Use French.", "source_ref": private_reference}}},
            ]
            payload = "\n".join(json.dumps({"jsonrpc": "2.0", **entry}) for entry in requests) + "\n"
            process = subprocess.run([sys.executable, "-B", str(SCRIPTS_ROOT / "pulse_instincts.py"),
                "adapter", "--stdio", "--root", str(root)], input=payload, text=True, capture_output=True, check=True)
            responses = {entry["id"]: entry for entry in map(json.loads, process.stdout.splitlines())}
            self.assertEqual(len(responses), 8)
            self.assertEqual({tool["name"] for tool in responses[2]["result"]["tools"]}, {"select", "observe", "remember_preference"})
            self.assertTrue(json.loads(responses[4]["result"]["content"][0]["text"])["idempotent"])
            self.assertEqual(json.loads(responses[6]["result"]["content"][0]["text"])["items"][0]["text"], "Use French.")
            self.assertTrue(responses[7]["result"]["isError"])
            self.assertTrue(responses[8]["result"]["isError"])
            self.assertNotIn(private_reference, process.stdout)
            self.assertIn("schema validation", responses[8]["result"]["content"][0]["text"])

    def test_drain_all_retains_pending_results_from_earlier_passes(self) -> None:
        from pulse_instincts import execute
        with tempfile.TemporaryDirectory() as folder, patch("pulse_instincts.DreamWorker") as worker:
            worker.return_value.drain.side_effect = [{"status": "pending", "processed": 1},
                                                     {"status": "ok", "processed": 0}]
            result = execute(SimpleNamespace(command="drain", root=Path(folder) / "store",
                                            model="opus", effort="low", all=True))
            self.assertEqual(result["status"], "pending")
            self.assertEqual(result["processed"], 1)

    def test_native_hook_entry_point_emits_only_the_native_protocol(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            for runtime in ("claude", "codex", "antigravity", "openbot"):
                request = {"kind": "chat_context" if runtime == "openbot" else "session_start",
                           "project_id": "p", "session_id": "s"}
                result = subprocess.run([sys.executable, "-B", str(SCRIPTS_ROOT / "pulse_instincts.py"),
                    "adapter", "--runtime", runtime, "--root", str(Path(folder) / runtime)],
                    input=json.dumps(request), text=True, capture_output=True, check=True)
                output = json.loads(result.stdout)
                if runtime == "antigravity":
                    self.assertEqual(set(output), {"inject_steps"})
                elif runtime == "openbot":
                    self.assertEqual(output["status"], "ok")
                else:
                    self.assertEqual(set(output), {"hookSpecificOutput"})

    def test_public_commands_persist_close_and_select_attributed_preference(self) -> None:
        with tempfile.TemporaryDirectory(prefix="instinct-cli-") as folder:
            root = Path(folder) / "store"
            def run(command, payload=None):
                response = subprocess.run([sys.executable, "-B", str(SCRIPTS_ROOT / "pulse_instincts.py"),
                    command, "--root", str(root)], input=json.dumps(payload) if payload else None,
                    text=True, capture_output=True, check=True)
                return json.loads(response.stdout)
            self.assertFalse(run("status")["initialized"])
            self.assertFalse(root.exists())
            observation = {"schema_version": "1.0", "observation_id": "obs:public", "source": "claude",
                "project_id": "pulse", "session_id": "s1", "sequence": 0,
                "observed_at": "2026-11-16T10:00:00Z", "selected_instincts": [], "summary": "A bounded naming correction."}
            self.assertEqual(run("observe", observation)["status"], "ok")
            self.assertTrue(run("observe", observation)["idempotent"])
            closure = {"schema_version": "1.0", "closure_id": "close:public", "source": "claude",
                "project_id": "pulse", "session_id": "s1", "upper_sequence": 0, "closed_at": "2026-11-16T10:01:00Z"}
            self.assertEqual(run("close", closure)["observation_count"], 1)
            run("review", {"action": "preference", "preference": {"id": "language", "scope": "project",
                "project_id": "pulse", "text": "Use French", "source": "user"}})
            selected = run("select", {"project_id": "pulse", "profile": "test", "event": "before_file_edit", "terms": []})
            self.assertEqual(selected["items"][0]["text"], "Use French")
            self.assertEqual(run("status")["queue"]["close:public"], "admitted")
            self.assertEqual(run("gc")["removed"], [])

    def test_rejects_duplicate_yaml_and_invalid_timestamp(self) -> None:
        with self.assertRaises(ContractError):
            validate_definition_text("namespace: jerem\nnamespace: another\n")
        record = {"schema_version": "1.0", "closure_id": "c1", "source": "claude",
                  "project_id": "p", "session_id": "s", "upper_sequence": 0, "closed_at": "yesterday"}
        with self.assertRaises(ContractError):
            validate_record(record, "closure")

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
        with self.assertRaisesRegex(ContractError, "watched_events"):
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
