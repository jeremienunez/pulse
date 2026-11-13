from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SCRIPTS_ROOT))

from instincts.recall import RecallError, select_context


def definition(identifier: str, version: str = "0.1.0") -> dict[str, object]:
    namespace, name = identifier.split("/")
    return {
        "namespace": namespace, "name": name, "id": identifier, "type": "agent_instinct", "version": version,
        "purpose": "A test instinct.", "status": "experimental", "priority": "medium",
        "trigger_conditions": ["test"], "watched_events": ["before_file_edit"],
        "default_behavior": ["behave"], "failure_patterns": ["fail"], "intervention_rules": ["intervene"],
        "escalation_rules": ["escalate"], "confidence_rules": {"require_high_confidence_for": ["public change"]},
        "output_contract": {"required_sections": ["reason"]},
        "examples": [{"input": "a", "response": "b"}], "anti_examples": [{"input": "a", "problem": "c"}],
    }


def entry(identifier: str, *, scope: str = "common", project: str | None = None, keywords: list[str] | None = None, links: list[dict[str, str]] | None = None, linked_only: bool = False) -> dict[str, object]:
    result = {"id": identifier, "version": "0.1.0", "scope": scope, "qualified_profiles": ["claude-opus-5-5"], "events": ["before_file_edit"], "keywords": keywords or [], "links": links or []}
    if project is not None:
        result["project_id"] = project
    if linked_only:
        result["linked_only"] = True
    return result


REQUEST = {"project_id": "pulse", "profile": "claude-opus-5-5", "event": "before_file_edit", "terms": ["naming", "domain"]}


class RecallTests(unittest.TestCase):
    def test_project_and_keyword_matches_select_without_unrelated_fallback(self) -> None:
        result = select_context(
            definitions=[definition("jerem/project"), definition("jerem/naming"), definition("jerem/unrelated")],
            registry=[entry("jerem/project", scope="project", project="pulse"), entry("jerem/naming", keywords=["naming"]), entry("jerem/unrelated", keywords=["database"])],
            preferences=[], request=REQUEST,
        )
        ids = [item["id"] for item in result["items"] if item["kind"] == "instinct"]
        self.assertEqual(ids, ["jerem/project", "jerem/naming"])
        self.assertIn({"id": "jerem/unrelated@0.1.0", "reason": "not-applicable"}, result["omitted"])

    def test_preferences_are_attributed_and_project_scoped(self) -> None:
        result = select_context(
            definitions=[], registry=[],
            preferences=[{"id": "preference:current", "scope": "project", "project_id": "pulse", "text": "Use French."}, {"id": "preference:other", "scope": "project", "project_id": "other", "text": "Ignore."}],
            request=REQUEST,
        )
        self.assertEqual(result["items"][0]["id"], "preference:current")
        self.assertIn({"id": "preference:other", "reason": "other-project"}, result["omitted"])

    def test_profile_and_packet_limits_are_enforced_without_truncation(self) -> None:
        records = [definition(f"jerem/rule-{index}") for index in range(7)]
        entries = [entry(f"jerem/rule-{index}", keywords=["naming"]) for index in range(7)]
        result = select_context(definitions=records, registry=entries, preferences=[], request=REQUEST)
        self.assertEqual(len(result["items"]), 6)
        self.assertTrue(any(item["reason"] == "instinct-limit" for item in result["omitted"]))
        oversized = select_context(definitions=[definition("jerem/large")], registry=[entry("jerem/large", keywords=["naming"])], preferences=[], request=REQUEST, max_packet_bytes=100)
        self.assertEqual(oversized["items"], [])
        self.assertTrue(any(item["reason"] == "packet-limit" for item in oversized["omitted"]))

    def test_links_are_bounded_and_must_remain_applicable(self) -> None:
        first = entry("jerem/first", keywords=["naming"], links=[{"id": "jerem/second", "version": "0.1.0"}])
        second = entry("jerem/second", scope="project", project="pulse", linked_only=True)
        result = select_context(definitions=[definition("jerem/first"), definition("jerem/second")], registry=[first, second], preferences=[], request=REQUEST)
        items = {item["id"]: item for item in result["items"]}
        self.assertEqual(items["jerem/second"]["depth"], 1)

    def test_invalid_duplicate_registry_is_refused(self) -> None:
        with self.assertRaisesRegex(RecallError, "repeat"):
            select_context(definitions=[definition("jerem/name")], registry=[entry("jerem/name", keywords=["naming"]), entry("jerem/name", keywords=["naming"])], preferences=[], request=REQUEST)


if __name__ == "__main__":
    unittest.main()
