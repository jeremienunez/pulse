from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SCRIPTS_ROOT))

from instincts.install import InstallError, OWNERSHIP_MARKER, build_dry_run


class InstallTests(unittest.TestCase):
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
