from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SCRIPTS_ROOT))

from instincts.provider import ProviderError, build_evaluation_prompt, invoke_claude_evaluation


class ProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="instinct-provider-")
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_prompt_forbids_tools_and_external_work(self) -> None:
        prompt = build_evaluation_prompt(case_id="case-1", guidance="Use existing names.", prompt="Name a state.")
        self.assertIn("Do not use tools", prompt)
        self.assertIn("CASE ID: case-1", prompt)

    def test_completed_response_requires_reported_model(self) -> None:
        def runner(_: list[str]) -> subprocess.CompletedProcess[str]:
            return subprocess.CompletedProcess(_, 0, json.dumps({"status": "completed", "response": "Decision and reason.", "model_reported": "claude-opus-5-5", "tool_denied": False, "effect_uncertain": False}), "")
        result = invoke_claude_evaluation(bridge=self.root / "bridge.mjs", workspace=self.root, call_dir=self.root / "call", prompt="case", model="claude-opus-5-5", runner=runner)
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.model_reported, "claude-opus-5-5")

    def test_unknown_transport_never_replays_or_becomes_a_result(self) -> None:
        def runner(_: list[str]) -> subprocess.CompletedProcess[str]:
            return subprocess.CompletedProcess(_, 1, json.dumps({"status": "timed_out", "effect_uncertain": True}), "")
        call = self.root / "call"
        result = invoke_claude_evaluation(bridge=self.root / "bridge.mjs", workspace=self.root, call_dir=call, prompt="case", model="opus", runner=runner)
        self.assertEqual(result.status, "blocked_unknown")
        with self.assertRaisesRegex(ProviderError, "already exists"):
            invoke_claude_evaluation(bridge=self.root / "bridge.mjs", workspace=self.root, call_dir=call, prompt="case", model="opus", runner=runner)

    def test_missing_effective_model_stays_pending(self) -> None:
        def runner(_: list[str]) -> subprocess.CompletedProcess[str]:
            return subprocess.CompletedProcess(_, 0, json.dumps({"status": "completed", "response": "Decision.", "tool_denied": False, "effect_uncertain": False}), "")
        result = invoke_claude_evaluation(bridge=self.root / "bridge.mjs", workspace=self.root, call_dir=self.root / "call", prompt="case", model="opus", runner=runner)
        self.assertEqual(result.status, "pending")


if __name__ == "__main__":
    unittest.main()
