from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
import http.client
from unittest.mock import patch
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SCRIPTS_ROOT))

from instincts.provider import ProviderError, RequestGuard, build_evaluation_prompt, invoke_claude_evaluation


class ProviderTests(unittest.TestCase):
    def test_wire_guard_blocks_extra_requests_and_nonempty_tool_projection(self) -> None:
        forwarded = []
        class Response:
            status = 200
            def __init__(self):
                self.sent = False
            def getheader(self, key, default=None):
                return "application/json"
            def read1(self, size):
                if self.sent:
                    return b""
                self.sent = True
                return b'{"ok": true}'
        class Connection:
            def __init__(self, host, timeout):
                self.host = host
            def request(self, method, path, body, headers):
                forwarded.append((self.host, path))
            def getresponse(self):
                return Response()
            def close(self):
                pass
        reserved = []
        with patch("instincts.provider.http.client.HTTPSConnection", Connection):
            with RequestGuard(reserved.append) as guard:
                def send(tools):
                    connection = http.client.HTTPConnection("127.0.0.1", guard.server.server_port, timeout=3)
                    connection.request("POST", "/v1/messages", body=json.dumps({"model": "claude-test",
                        "tools": tools, "output_config": {"effort": "low"}}),
                        headers={"x-pulse-call": guard.token, "Content-Type": "application/json"})
                    response = connection.getresponse()
                    code = response.status
                    response.read()
                    connection.close()
                    return code
                self.assertEqual(send([{"name": "Bash"}]), 403)
                self.assertEqual(send([]), 200)
                self.assertEqual(send([]), 429)
        self.assertEqual(len(reserved), 1)
        self.assertEqual(forwarded, [("api.anthropic.com", "/v1/messages")])
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
