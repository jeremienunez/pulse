from __future__ import annotations

import sys
import unittest
import json
import tempfile
import tomllib
from unittest.mock import patch
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SCRIPTS_ROOT))

from instincts.install import InstallError, OWNERSHIP_MARKER, build_dry_run, build_runtime_plan


class InstallTests(unittest.TestCase):
    def test_mcp_registration_deltas_are_reversible_owned_additions(self) -> None:
        with tempfile.TemporaryDirectory() as folder, patch("instincts.install.Path.home", return_value=Path(folder)):
            from instincts.install import build_mcp_plan
            for runtime in ("claude", "codex", "antigravity"):
                plan = build_mcp_plan(runtime=runtime, root=Path(folder) / "store", controller=SCRIPTS_ROOT / "pulse_instincts.py")
                target = Path(plan["target"])
                target.parent.mkdir(parents=True, exist_ok=True)
                self.assertFalse(target.exists())
                if runtime == "codex":
                    target.write_text('# preserve this comment\nmodel = "unchanged"\n' + plan["delta"]["append"])
                    parsed = tomllib.loads(target.read_text())
                    self.assertEqual(parsed["model"], "unchanged")
                    self.assertEqual(parsed["mcp_servers"]["pulse_instincts"]["default_tools_approval_mode"], "approve")
                else:
                    target.write_text(json.dumps({"unrelated": 1, "mcpServers": {"pulse_instincts": plan["delta"]["add_server"]}}))
                second = build_mcp_plan(runtime=runtime, root=Path(folder) / "store", controller=SCRIPTS_ROOT / "pulse_instincts.py")
                self.assertEqual(second["before_sha256"], second["after_sha256"])

    def test_native_runtime_deltas_preserve_existing_bytes_and_hook_shapes(self) -> None:
        with tempfile.TemporaryDirectory() as folder, patch("instincts.install.Path.home", return_value=Path(folder)):
            for runtime, name in (("claude", ".claude/settings.json"), ("codex", ".codex/hooks.json"),
                                  ("antigravity", ".gemini/config/hooks.json")):
                path = Path(folder) / name
                path.parent.mkdir(parents=True)
                before = {"unrelated": {"value": 1}}
                path.write_text(json.dumps(before))
                original = path.read_bytes()
                result = build_runtime_plan(runtime=runtime, root=Path(folder) / "store",
                                            controller=SCRIPTS_ROOT / "pulse_instincts.py")
                self.assertEqual(path.read_bytes(), original)
                events = result["additions"]
                if runtime == "antigravity":
                    events = events[OWNERSHIP_MARKER]
                    handler = events["SessionStart"][0]
                else:
                    self.assertIn("hooks", events["SessionStart"][0])
                    handler = events["SessionStart"][0]["hooks"][0]
                self.assertIn("--event SessionStart", handler["command"])
                self.assertIn("rollback", result)
                applied = {**before, **result["additions"]} if runtime == "antigravity" else {
                    **before, "hooks": result["additions"]}
                if result["permission_additions"]:
                    applied["permissions"] = {"allow": result["permission_additions"]}
                path.write_text(json.dumps(applied))
                second = build_runtime_plan(runtime=runtime, root=Path(folder) / "store",
                                            controller=SCRIPTS_ROOT / "pulse_instincts.py")
                self.assertEqual(second["additions"], {})
                self.assertEqual(second["before_sha256"], second["after_sha256"])
                self.assertIn("mcp", result)

    def test_dry_run_preserves_unrelated_hooks_and_has_reversible_ownership(self) -> None:
        original = {"other-plugin": {"SessionStart": [{"command": "other"}]}}
        result = build_dry_run(runtime="claude", existing_hooks=original, command="pulse-instincts enqueue")
        self.assertEqual(result["status"], "pending-review")
        self.assertEqual(result["before"], original)
        self.assertEqual(result["after"]["other-plugin"], original["other-plugin"])
        self.assertEqual(result["after"][OWNERSHIP_MARKER]["claude"]["mode"], "enqueue-only")
        self.assertNotEqual(result["before_digest"], result["after_digest"])

    def test_invalid_runtime_or_marker_is_refused(self) -> None:
        with self.assertRaises(InstallError):
            build_dry_run(runtime="unknown", existing_hooks={}, command="x")
        with self.assertRaises(InstallError):
            build_dry_run(runtime="codex", existing_hooks={OWNERSHIP_MARKER: []}, command="x")
