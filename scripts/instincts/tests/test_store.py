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
from unittest.mock import patch

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
    def test_legacy_evidence_is_redacted_on_read_after_its_immutable_digest_check(self) -> None:
        record = observation()
        record["summary"] = json.dumps({"api_key": "legacy-secret-marker"})
        with patch("instincts.store.redact_observation", side_effect=lambda value: value):
            self.store.admit_observation(record)
        self.store.close_range(closure())
        metadata = self.store.snapshot()["observations"][record["observation_id"]]
        path = self.store.root / metadata["path"]
        original = path.read_bytes()
        selected = self.store.observations_for(self.store.snapshot()["closures"]["close:1"])
        self.assertNotIn("legacy-secret-marker", selected[0]["summary"])
        self.assertEqual(path.read_bytes(), original)
        self.assertIn("legacy-secret-marker", json.loads(original)["summary"])

    def test_concurrent_agent_templates_receive_atomic_sequences(self) -> None:
        errors = []
        def add(index):
            try:
                self.store.admit_observation(observation(f"parallel:{index}", 0), assign_sequence=True)
            except Exception as error:
                errors.append(error)
        threads = [threading.Thread(target=add, args=(index,)) for index in range(12)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])
        self.assertEqual(sorted(row["sequence"] for row in self.store.snapshot()["observations"].values()), list(range(12)))
        self.assertTrue(self.store.admit_observation(observation("parallel:0", 0), assign_sequence=True)["idempotent"])
        self.assertEqual(self.store.close_range(closure("parallel-close", 11))["observation_count"], 12)

    def test_range_capacity_is_refused_before_acknowledging_an_unclosable_input(self) -> None:
        for sequence in range(64):
            self.store.admit_observation(observation(f"o{sequence}", sequence))
        with self.assertRaisesRegex(StoreError, "admission limit"):
            self.store.admit_observation(observation("overflow", 64))
        self.assertEqual(self.store.close_range(closure("bounded", 63))["observation_count"], 64)
        self.assertEqual(self.store.admit_observation(observation("resumed", 0), assign_sequence=True)["sequence"], 64)

    def test_later_failed_verification_invalidates_prior_candidate_and_stale_writes(self) -> None:
        from instincts.contracts import digest
        row = {"evidence": [{"project_id": "pulse", "run_ref": "history/project/run.json", "run_verified": True}],
               "qualification": {"activation_eligible": True}, "status": "pending_review"}
        self.store.save_candidate("candidate", row)
        failure = observation()
        failure.update(run_ref="history/project/run.json", run_verified=False, evidence_kind="verified")
        self.store.admit_observation(failure)
        candidate = self.store.snapshot()["candidates"]["candidate"]
        self.assertFalse(candidate["qualification"]["activation_eligible"])
        self.assertEqual(candidate["evidence_updates"], ["obs:1"])
        with self.assertRaisesRegex(StoreError, "changed"):
            self.store.save_candidate("candidate", row, expected_digest=digest(row))

    def version_fixture(self, identifier: str, version: str, base=None, critical=False) -> dict:
        # Controlled traces exercise publication. They certify no native runtime.
        from instincts.contracts import canonical_json
        from instincts.engine import build_job, decide, record_result
        from instincts.tests.test_engine import CASES
        from instincts.tests.test_recall import definition
        profile = {"runtime": "claude", "model": "claude-opus-5-5", "effort": "low"}
        value = definition("jerem/naming", version)
        job = build_job(candidate_id=identifier, profile=profile, baseline_guidance="baseline",
                        candidate_guidance=canonical_json(value), cases=CASES)
        results = []
        for condition in ("baseline", "candidate"):
            for repetition in (1, 2):
                for case in CASES:
                    passed = condition != "baseline" or case["role"] != "trigger"
                    results.append(record_result(job=job, condition=condition, repetition=repetition,
                        case_id=case["case_id"], response="controlled response", model_reported=profile["model"], tools=[],
                        judgments=[{"criterion_id": case["case_id"] + ":e1", "verdict": "pass" if passed else "fail",
                                    "quote": "controlled response", "reason": "Controlled trace."}],
                        proof={"execution_kind": "native", "wire_requests": [{"model": profile["model"],
                            "effort": profile["effort"], "tools": [], "http_status": 200}]}))
        row = {"definition": value, "scope": "project", "project_id": "pulse", "profile": canonical_json(profile),
            "base_active": base, "version_id": identifier, "status": "pending_review", "keywords": ["naming"],
            "critical": critical, "job": job, "results": results,
            "qualification": {**decide(job=job, results=results), "execution_kind": "native"}}
        self.store.prepare_version(identifier, value, {"job": job, "results": results})
        self.store.save_candidate(identifier, row)
        return row

    def test_publication_crash_keeps_previous_version_and_explicit_rollback_is_cas_bound(self) -> None:
        from instincts.contracts import digest
        first = self.version_fixture("v1", "0.1.0")
        self.store.review("v1", "accept", expected_digest=digest(first))
        second = self.version_fixture("v2", "0.1.1", base="v1")
        write = self.store._atomic_write
        def fail_state(path, value):
            if path == self.store.state_path:
                raise OSError("interruption before pointer publication")
            write(path, value)
        with patch.object(self.store, "_atomic_write", side_effect=fail_state):
            with self.assertRaises(OSError):
                self.store.review("v2", "accept", expected_digest=digest(second))
        self.assertEqual(set(self.store.snapshot()["active_versions"].values()), {"v1"})
        self.store.review("v2", "accept", expected_digest=digest(second))
        old = self.store.snapshot()["candidates"]["v1"]
        with self.assertRaisesRegex(StoreError, "active version changed"):
            self.store.review("v1", "rollback", expected_digest=digest(old), expected_active="wrong-version")
        self.store.review("v1", "rollback", expected_digest=digest(old), expected_active="v2")
        self.assertEqual(set(self.store.snapshot()["active_versions"].values()), {"v1"})
        self.assertTrue((self.store.root / ".instincts/v1.instinct.yaml").is_file())

    def test_critical_rule_and_changed_evidence_cannot_bypass_review(self) -> None:
        from instincts.contracts import digest
        row = self.version_fixture("critical", "0.1.0", critical=True)
        with self.assertRaisesRegex(StoreError, "user approval"):
            self.store.review("critical", "accept", expected_digest=digest(row))
        self.store.review("critical", "accept", expected_digest=digest(row), approval="explicit-user-approval")
        second = self.version_fixture("altered", "0.1.1", base="critical")
        (self.store.root / "versions/altered.json").write_text('{"definition":{}}')
        with self.assertRaisesRegex(StoreError, "integrity"):
            self.store.review("altered", "accept", expected_digest=digest(second))

    def test_active_recall_checks_integrity_and_shares_with_attributed_consumer_evidence(self) -> None:
        from instincts.contracts import digest
        from instincts.recall import RecallError, select_from_store
        row = self.version_fixture("v1", "0.1.0")
        self.store.review("v1", "accept", expected_digest=digest(row))
        request = {"project_id": "pulse", "profile": row["profile"], "event": "before_file_edit", "terms": ["naming"]}
        self.assertEqual(select_from_store(self.store, request)["items"][0]["version"], "0.1.0")
        other = select_from_store(self.store, {**request, "profile": "other-runtime"})["items"][0]
        self.assertEqual(other["id"], "jerem/naming")
        self.assertEqual(other["verification"]["consumer_qualification"], "unverified")
        self.assertEqual(other["verification"]["evaluation_profiles"], [row["profile"]])
        self.assertEqual(select_from_store(self.store, {**request, "project_id": "other-project"})["items"], [])
        (self.store.root / "versions/v1.json").write_text('{}')
        with self.assertRaisesRegex(RecallError, "integrity"):
            select_from_store(self.store, request)

    def test_preferences_with_same_name_remain_separate_and_project_overrides_common(self) -> None:
        from instincts.recall import select_from_store
        for scope, project, text in (("common", None, "Use French."), ("project", "pulse", "Use English here."),
                                     ("project", "other", "Use Spanish here.")):
            self.store.save_preference({"id": "language", "scope": scope, "project_id": project, "text": text})
        request = {"project_id": "pulse", "profile": "any", "event": "context_refresh", "terms": []}
        self.assertEqual(select_from_store(self.store, request)["items"][0]["text"], "Use English here.")
        self.assertEqual(select_from_store(self.store, {**request, "project_id": "third"})["items"][0]["text"], "Use French.")
        self.assertEqual(len(self.store.snapshot()["preferences"]), 3)

    def test_automatic_intake_retries_preserve_time_id_and_runtime_evidence(self) -> None:
        data = observation()
        for key in ("observation_id", "sequence", "observed_at"):
            del data[key]
        data["selected_instincts"] = [{"id": "jerem/naming", "version": "0.1.0"}]
        first = self.store.admit_observation(data, assign_sequence=True)
        second = self.store.admit_observation(data, assign_sequence=True)
        self.assertEqual(first["observation_id"], second["observation_id"])
        self.assertTrue(second["idempotent"])
        self.assertEqual(next(iter(self.store.snapshot()["runtime_evidence"].values()))["observations"], 1)

    def test_only_unsubmitted_slots_are_released_and_explicit_resume_reserves_remainder(self) -> None:
        self.store.reserve_job("j")
        self.store.reserve_call_credit(call_id="c", job_id="j")
        self.store.complete_call("c", {"status": "completed", "response": "known"})
        self.assertEqual(self.store.finalize_job("j")["released_unsubmitted"], 15)
        self.assertEqual(sum(self.store.snapshot()["used_call_credits"].values()), 1)
        self.store.reserve_job("j")
        self.assertEqual(sum(self.store.snapshot()["used_call_credits"].values()), 16)
        self.store.reserve_call_credit(call_id="c2", job_id="j")
        self.store.finalize_job("j")
        self.assertEqual(sum(self.store.snapshot()["used_call_credits"].values()), 2)
        self.store.recover()
        self.assertEqual(self.store.snapshot()["calls"]["c2"]["status"], "blocked_unknown")

    def test_reserved_io_space_cannot_be_taken_by_new_admissions(self) -> None:
        remaining = self.store.capacity_bytes - self.store.bytes_used() - self.store.reserve_bytes - 4096
        self.store.reserve_space("call", remaining)
        item = observation()
        item["summary"] = "x" * 8192
        with self.assertRaisesRegex(StoreError, "capacity"):
            self.store.admit_observation(item)
        self.store.reserve_space("call", 0)
        self.assertEqual(self.store.admit_observation(item)["status"], "ok")

    def test_atomic_admission_can_resume_after_object_written_before_state(self) -> None:
        original = self.store._atomic_write
        def interrupted(path, content):
            if path == self.store.state_path:
                raise OSError("simulated crash before state publication")
            original(path, content)
        with patch.object(self.store, "_atomic_write", side_effect=interrupted):
            with self.assertRaises(OSError):
                self.store.admit_observation(observation())
        self.assertEqual(self.store.snapshot()["observations"], {})
        self.assertEqual(self.store.admit_observation(observation())["status"], "ok")
        self.assertEqual(len(self.store.snapshot()["observations"]), 1)

    def test_clock_rollback_cannot_restore_exhausted_credit(self) -> None:
        later = datetime(2026, 11, 17, 12, tzinfo=ZoneInfo("Europe/Paris"))
        earlier = datetime(2026, 11, 16, 12, tzinfo=ZoneInfo("Europe/Paris"))
        self.store.reserve_call_credit(now=later, limit=1)
        with self.assertRaisesRegex(StoreError, "exhausted"):
            self.store.reserve_call_credit(now=earlier, limit=1)

    def test_symlink_and_missing_volume_are_refused_before_writes(self) -> None:
        (self.store.root / "versions/foreign").symlink_to(self.temp)
        with self.assertRaisesRegex(StoreError, "symbolic"):
            self.store.admit_observation(observation())
        target = self.temp / "unmounted"
        unavailable = Store(target, volume_uuid="volume-that-does-not-exist")
        with self.assertRaisesRegex(StoreError, "unavailable"):
            unavailable.initialize()
        self.assertFalse(target.exists())

    def test_interrupted_calls_become_unknown_and_never_refund_credit(self) -> None:
        self.store.reserve_call_credit(call_id="reserved", limit=1)
        self.store.recover()
        self.assertEqual(self.store.snapshot()["calls"]["reserved"]["status"], "blocked_unknown")
        with self.assertRaises(StoreError):
            self.store.reserve_call_credit(call_id="reserved", limit=1)

    def test_prepared_version_id_cannot_hide_different_bytes(self) -> None:
        self.store.prepare_version("v1", {"id": "jerem/name"}, {"source": "fixture"})
        with self.assertRaisesRegex(StoreError, "different bytes"):
            self.store.prepare_version("v1", {"id": "jerem/changed"}, {"source": "fixture"})

    def test_purge_only_successful_temporary_copies_after_seven_days(self) -> None:
        self.store.admit_observation(observation())
        self.store.close_range(closure())
        self.store.update_closure("close:1", expected_status="admitted", status="complete",
                                  disposition="no-signal", completed_at="2026-11-01T00:00:00+00:00")
        temporary = self.store.root / "tmp/close:1.json"
        temporary.write_text('{"copy": true}')
        self.assertEqual(self.store.gc(now=datetime(2026, 11, 7, tzinfo=ZoneInfo("UTC")))["removed"], [])
        self.assertEqual(self.store.gc(now=datetime(2026, 11, 8, tzinfo=ZoneInfo("UTC")))["removed"], ["tmp/close:1.json"])
        self.assertTrue((self.store.root / "inbox/observations/obs:1.json").exists())

    def test_pending_candidate_temporary_evidence_survives_maintenance(self) -> None:
        self.store.admit_observation(observation())
        self.store.close_range(closure())
        self.store.update_closure("close:1", expected_status="admitted", status="complete",
            disposition="pending_review", completed_at="2026-11-01T00:00:00+00:00")
        temporary = self.store.root / "tmp/close:1.json"
        temporary.write_text('{"unresolved":true}')
        self.assertEqual(self.store.gc(now=datetime(2026, 11, 16, tzinfo=ZoneInfo("UTC")))["removed"], [])
        self.assertTrue(temporary.exists())
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
        self.assertTrue(self.store.close_range(closure("close:duplicate", 1))["idempotent"])

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
