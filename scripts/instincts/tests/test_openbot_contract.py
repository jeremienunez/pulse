from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
MANIFEST = REPO / "integrations/openbot/shared-instincts-source.json"
PATCH = REPO / "integrations/openbot/shared-instincts.patch"
DEFAULT_SOURCE = Path("/media/jerem/ubuntu2/onii-white-label/2026-10-31/source")


class OpenBotPatchTests(unittest.TestCase):
    def source(self) -> Path:
        return Path(os.environ.get("OPENBOT_SHARED_INSTINCTS_SOURCE", DEFAULT_SOURCE))

    def test_manifest_binds_current_preimages_and_patch_scope(self) -> None:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        source = self.source()
        for entry in manifest["files"]:
            target = source / entry["path"]
            if entry.get("state") == "new-file":
                self.assertFalse(target.exists())
                continue
            self.assertTrue(target.is_file())
            self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), entry["sha256"])
        paths = [line[6:] for line in PATCH.read_text(encoding="utf-8").splitlines() if line.startswith("+++ b/")]
        self.assertEqual(set(paths), {entry["path"] for entry in manifest["files"]})

    def test_patch_applies_to_minimal_isolated_snapshot(self) -> None:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        source = self.source()
        temporary = Path(tempfile.mkdtemp(prefix="openbot-shared-instincts-"))
        try:
            subprocess.run(["git", "init", "-q"], cwd=temporary, check=True)
            for entry in manifest["files"]:
                if entry.get("state") == "new-file":
                    continue
                source_file = source / entry["path"]
                target = temporary / entry["path"]
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source_file, target)
            apply = ["git", "apply", "--unidiff-zero", "--check", str(PATCH)]
            subprocess.run(apply, cwd=temporary, check=True)
            subprocess.run(["git", "apply", "--unidiff-zero", str(PATCH)], cwd=temporary, check=True)
            bridge = temporary / "src/backend/shared-instincts-bridge.ts"
            self.assertIn("NO_SHARED_INSTINCTS_BRIDGE", bridge.read_text(encoding="utf-8"))
            lifecycle = (temporary / "src/backend/agent/thread-lifecycle.ts").read_text(encoding="utf-8")
            service = (temporary / "src/backend/agent-service.ts").read_text(encoding="utf-8")
            self.assertIn("recordSharedInstinctThreadClosed", lifecycle)
            self.assertIn("recordSharedInstinctThreadClosed", service)
            self.assertIn('agentNamesById } from "./delivery-content";\nimport { NO_SHARED_INSTINCTS_BRIDGE', lifecycle)
            self.assertIn('this.#memoryReview.threadClosed(task.agentId, task.threadId);\n    this.#threads.recordSharedInstinctThreadClosed', service)
        finally:
            shutil.rmtree(temporary)


if __name__ == "__main__":
    unittest.main()
