from __future__ import annotations

import json
import shutil
import sys
import tempfile
import threading
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

SCRIPTS_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SCRIPTS_ROOT))

from instincts.store import Store, StoreError


def observation(identifier: str = "obs:1", sequence: int = 0) -> dict[str, object]:
    return {
        "schema_version": "1.0",
        "observation_id": identifier,
        "source": "claude",
        "project_id": "pulse",
        "session_id": "session:1",
        "sequence": sequence,
        "observed_at": "2026-11-06T00:00:00Z",
        "selected_instincts": [],
        "summary": "An attributed observation.",
    }


def closure(identifier: str = "close:1", upper: int = 0) -> dict[str, object]:
    return {
        "schema_version": "1.0",
        "closure_id": identifier,
        "source": "claude",
        "project_id": "pulse",
        "session_id": "session:1",
        "upper_sequence": upper,
        "closed_at": "2026-11-06T00:01:00Z",
    }


class StoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = Path(tempfile.mkdtemp(prefix="instinct-store-"))
        self.store = Store(self.temp / "store", capacity_bytes=256 * 1024)
        self.store.initialize()

    def tearDown(self) -> None:
        shutil.rmtree(self.temp)

    def test_admission_is_idempotent_and_conflicts_are_refused(self) -> None:
        self.assertFalse(self.store.admit_observation(observation())["idempotent"])
        self.assertTrue(self.store.admit_observation(observation())["idempotent"])
        changed = observation()
        changed["summary"] = "Different bytes."
        with self.assertRaisesRegex(StoreError, "different bytes"):
            self.store.admit_observation(changed)

    def test_close_range_records_only_bound_observations_and_is_idempotent(self) -> None:
        self.store.admit_observation(observation("obs:0", 0))
        self.store.admit_observation(observation("obs:1", 1))
        first = self.store.close_range(closure("close:0", 0))
        self.assertEqual(first["observation_count"], 1)
        self.assertTrue(self.store.close_range(closure("close:0", 0))["idempotent"])
        with self.assertRaisesRegex(StoreError, "different bounds"):
            self.store.close_range(closure("close:0", 1))
        self.assertEqual(self.store.close_range(closure("close:1", 1))["observation_count"], 1)
        with self.assertRaisesRegex(StoreError, "already consumed"):
            self.store.close_range(closure("close:duplicate", 1))

    def test_concurrent_admission_has_one_writer_and_no_loss(self) -> None:
        errors: list[Exception] = []
        def add(index: int) -> None:
            try:
                self.store.admit_observation(observation(f"obs:{index}", index))
            except Exception as error:  # pragma: no cover - asserted below.
                errors.append(error)
        threads = [threading.Thread(target=add, args=(index,)) for index in range(12)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])
        admitted = list((self.temp / "store/inbox/observations").glob("*.json"))
        self.assertEqual(len(admitted), 12)

    def test_capacity_rejects_without_creating_a_receipt(self) -> None:
        store = Store(self.temp / "tiny", capacity_bytes=512, reserve_bytes=128)
        oversized = observation()
        oversized["summary"] = "x" * 300
        with self.assertRaisesRegex(StoreError, "capacity"):
            store.admit_observation(oversized)
        self.assertFalse((self.temp / "tiny/inbox/observations/obs:1.json").exists())

    def test_credits_are_daily_and_fail_closed_at_limit(self) -> None:
        now = datetime(2026, 11, 6, 23, 30, tzinfo=ZoneInfo("Europe/Paris"))
        self.assertEqual(self.store.reserve_call_credit(now=now, limit=2)["used"], 1)
        self.assertEqual(self.store.reserve_call_credit(now=now, limit=2)["used"], 2)
        with self.assertRaisesRegex(StoreError, "exhausted"):
            self.store.reserve_call_credit(now=now, limit=2)
        tomorrow = datetime(2026, 11, 7, 0, 1, tzinfo=ZoneInfo("Europe/Paris"))
        self.assertEqual(self.store.reserve_call_credit(now=tomorrow, limit=2)["used"], 1)

    def test_recovery_finishes_an_interrupted_version_transaction(self) -> None:
        payload = {"schema_version": "1.0", "version_id": "version:1", "definition": {"id": "jerem/example"}, "evidence": {"kind": "fixture"}}
        path = self.temp / "store/transactions/version:1.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        self.assertEqual(self.store.recover()["recovered"], ["version:1"])
        self.assertTrue((self.temp / "store/versions/version:1.json").exists())
        self.assertTrue((self.temp / "store/receipts/version:1.json").exists())
        self.assertFalse(path.exists())


if __name__ == "__main__":
    unittest.main()
