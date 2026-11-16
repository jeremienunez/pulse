from __future__ import annotations

import sys
import unittest
import tempfile
import json
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SCRIPTS_ROOT))

from instincts.adapters import AdapterError, handle_native_event, launch_antigravity, normalize_event
from instincts.store import Store, utc_now


class AdapterTests(unittest.TestCase):
    def test_real_worker_origin_flag_suppresses_native_hooks_before_store_writes(self) -> None:
        with tempfile.TemporaryDirectory() as folder, patch.dict("os.environ", {"PULSE_INSTINCTS_ORIGIN": "dream"}):
            store = Store(Path(folder) / "store")
            for runtime in ("claude", "codex", "antigravity", "openbot"):
                self.assertEqual(handle_native_event(store, runtime, {"hook_event_name": "SessionStart",
                    "source": "startup", "session_id": "s", "cwd": folder})["status"], "ignored")
            self.assertFalse(store.root.exists())

    def test_hosted_provider_hooks_leave_closure_to_the_canonical_openbot_bridge(self) -> None:
        with tempfile.TemporaryDirectory() as folder, patch.dict("os.environ", {"PULSE_INSTINCTS_ORIGIN": "openbot"}):
            store = Store(Path(folder) / "store")
            for runtime in ("claude", "codex", "antigravity"):
                self.assertEqual(handle_native_event(store, runtime, {"hook_event_name": "SessionEnd"})["status"], "ignored")
            self.assertFalse(store.root.exists())
            result = handle_native_event(store, "openbot", {"kind": "chat_context", "project_id": "p", "thread_id": "chat", "cwd": folder})
            self.assertIn('"source":"openbot"', result["hookSpecificOutput"]["additionalContext"])

    def test_native_prompt_refresh_uses_current_request_and_matching_output_event(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            store = Store(Path(folder) / "store")
            for runtime in ("claude", "codex"):
                response = handle_native_event(store, runtime, {"hook_event_name": "UserPromptSubmit",
                    "project_id": "p", "session_id": runtime, "cwd": folder, "prompt": "Nommer le statut facture"})
                self.assertEqual(response["hookSpecificOutput"]["hookEventName"], "UserPromptSubmit")
                receipt = store.snapshot()["deliveries"][response["delivery_id"]]
                packet = json.loads((store.root / receipt["path"]).read_text())["packet"]
                self.assertEqual(packet["event"], "context_refresh")

    def test_real_adapter_context_and_close_use_attributed_session_and_new_ranges(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            store = Store(Path(folder) / "store")
            store.save_preference({"id": "language", "scope": "common", "text": "Use French."})
            for runtime in ("claude", "codex", "openbot"):
                payload = {"kind": "chat_context" if runtime == "openbot" else "session_start",
                    "session_id": runtime + "-s", "project_id": "project", "cwd": folder}
                response = handle_native_event(store, runtime, payload)
                context = response["hookSpecificOutput"]["additionalContext"]
                self.assertIn("Use French.", context)
                self.assertIn('"source":"' + runtime + '"', context)
                self.assertLessEqual(len(context.encode()), 16384)
                for seq in (0, 1):
                    store.admit_observation({"schema_version": "1.0", "observation_id": runtime + str(seq),
                        "source": runtime, "session_id": runtime + "-s", "project_id": "project",
                        "sequence": seq, "observed_at": utc_now(), "selected_instincts": [], "summary": "Synthetic"})
                    close = {**payload, "kind": "task_closed" if runtime == "openbot" else "session_end"}
                    self.assertFalse(handle_native_event(store, runtime, close)["idempotent"])
                    self.assertTrue(handle_native_event(store, runtime, close)["idempotent"])
            self.assertEqual(len(store.snapshot()["closures"]), 6)
            self.assertTrue((store.root / "inbox/closures/.wake").exists())

    def test_managed_antigravity_binds_native_conversation_and_closes_only_normal_exit(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            store = Store(Path(folder) / "store")
            def run(command, env, **kwargs):
                with patch.dict("os.environ", env, clear=True):
                    output = handle_native_event(store, "antigravity", {"kind": "session_start",
                        "project_id": "p", "conversationId": "c", "cwd": folder})
                self.assertIn("system_message", output["inject_steps"][0])
                store.admit_observation({"schema_version": "1.0", "observation_id": "ag0", "source": "antigravity",
                    "session_id": "c", "project_id": "p", "sequence": 0, "observed_at": utc_now(),
                    "selected_instincts": [], "summary": "Synthetic"})
                return SimpleNamespace(returncode=0)
            with patch("instincts.adapters.shutil.which", return_value="/fake/agy"):
                self.assertEqual(launch_antigravity(store, runner=run)["observation_count"], 1)
                self.assertEqual(launch_antigravity(store, runner=lambda *a, **kw: SimpleNamespace(returncode=1))["status"], "degraded")
            self.assertEqual(len(store.snapshot()["closures"]), 1)

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
