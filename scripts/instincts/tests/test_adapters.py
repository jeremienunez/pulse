from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SCRIPTS_ROOT))

from instincts.adapters import AdapterError, normalize_event


class AdapterTests(unittest.TestCase):
    def test_claude_and_codex_use_native_session_boundaries(self) -> None:
        for runtime in ("claude", "codex"):
            self.assertEqual(normalize_event(runtime, {"kind": "session_start", "project_id": "pulse", "session_id": "s1"}).action, "select_context")
            self.assertEqual(normalize_event(runtime, {"kind": "session_end", "project_id": "pulse", "session_id": "s1"}).action, "enqueue_closure")
            self.assertEqual(normalize_event(runtime, {"kind": "turn_completed"}).status, "ignored")

    def test_antigravity_stop_requires_launcher_owned_close(self) -> None:
        self.assertEqual(normalize_event("antigravity", {"kind": "stop"}).status, "pending")
        unowned = normalize_event("antigravity", {"kind": "managed_session_closed", "project_id": "pulse", "conversation_id": "c1", "launcher_owned": False})
        self.assertEqual(unowned.status, "pending")
        owned = normalize_event("antigravity", {"kind": "managed_session_closed", "project_id": "pulse", "conversation_id": "c1", "launcher_owned": True})
        self.assertEqual(owned.action, "enqueue_closure")

    def test_openbot_turn_and_provider_events_do_not_close_chat(self) -> None:
        self.assertEqual(normalize_event("openbot", {"kind": "turn_completed"}).status, "ignored")
        self.assertEqual(normalize_event("openbot", {"kind": "provider_replaced"}).status, "ignored")
        decision = normalize_event("openbot", {"kind": "task_closed", "project_id": "pulse", "thread_id": "thread-1"})
        self.assertEqual(decision.action, "enqueue_closure")

    def test_dream_origin_and_bad_events_are_safe(self) -> None:
        self.assertEqual(normalize_event("claude", {"source": "dream", "kind": "session_end"}).status, "ignored")
        with self.assertRaises(AdapterError):
            normalize_event("unknown", {"kind": "anything"})
