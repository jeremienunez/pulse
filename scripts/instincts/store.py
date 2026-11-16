"""Durable admission, publication and maintenance for shared instincts."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import stat
import shutil
import subprocess
import tempfile
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo

import yaml

from .contracts import canonical_json, digest, redact_observation, validate_definition_set, validate_record


STORE_SCHEMA_VERSION = "1.0"
DEFAULT_CAPACITY_BYTES = 256 * 1024 * 1024
DEFAULT_RESERVE_BYTES = 4096
MAX_OBSERVATION_BYTES = 16 * 1024
MAX_RANGE_OBSERVATIONS = 64
VOLUME_ROOT = Path("/media/jerem/ubuntu2")
VOLUME_UUID = "8462a270-abd6-4f27-9f49-41485bc20d4a"
SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
TABLES = ("observations", "closures", "candidates", "versions", "active_versions",
          "session_cursors", "used_call_credits", "calls", "jobs", "deliveries", "preferences", "launches",
          "space_reservations", "runtime_evidence")
DIRECTORIES = ("inbox/observations", "inbox/closures", "receipts", "candidates",
               ".instincts", "definitions", "versions", "transactions", "tmp", "profiles")


class StoreError(RuntimeError):
    """An operation was refused before a successful acknowledgement."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_bytes(value: object) -> bytes:
    if isinstance(value, bytes):
        return value
    return (canonical_json(value) + "\n").encode("utf-8")


def _safe_name(value: str) -> str:
    if not isinstance(value, str) or not SAFE_NAME.fullmatch(value):
        raise StoreError("record id is not safe for a file name")
    return value


def session_key(record: dict) -> str:
    return digest([record["source"], record["project_id"], record["session_id"]])


class Store:
    def __init__(self, root: Path, *, capacity_bytes: int = DEFAULT_CAPACITY_BYTES,
                 reserve_bytes: int = DEFAULT_RESERVE_BYTES, volume_uuid: str | None = None):
        self.root = Path(os.path.abspath(root))
        if self.root == Path("/") or capacity_bytes <= reserve_bytes or reserve_bytes < 0:
            raise StoreError("invalid store root or capacity")
        self.capacity_bytes = capacity_bytes
        self.reserve_bytes = reserve_bytes
        self.volume_uuid = volume_uuid
        if self.root.is_relative_to(VOLUME_ROOT):
            self.volume_uuid = volume_uuid or VOLUME_UUID

    @property
    def state_path(self) -> Path:
        return self.root / "state.json"

    def _check_volume(self) -> None:
        if not self.volume_uuid:
            return
        existing = self.root
        while not existing.exists() and existing != existing.parent:
            existing = existing.parent
        probe = subprocess.run(
            ["findmnt", "--json", "--target", str(existing), "--output", "UUID,TARGET"],
            text=True, capture_output=True, check=False,
        )
        try:
            mounts = json.loads(probe.stdout)["filesystems"]
        except (ValueError, KeyError):
            mounts = []
        if probe.returncode or not mounts or mounts[0].get("uuid") != self.volume_uuid:
            raise StoreError("expected shared-store volume is unavailable")

    def _check_paths(self) -> None:
        for parent in (self.root, *self.root.parents):
            if parent.is_symlink():
                raise StoreError("symbolic links cannot redirect the shared store")
        if self.root.exists():
            for base, directories, files in os.walk(self.root, followlinks=False):
                for name in [*directories, *files]:
                    path = Path(base) / name
                    if path.is_symlink():
                        raise StoreError("symbolic link inside shared store")

    def _path(self, relative: str) -> Path:
        path = self.root / relative
        if Path(relative).is_absolute() or ".." in Path(relative).parts:
            raise StoreError("path escapes shared store")
        if path.is_symlink():
            raise StoreError("symbolic link cannot replace a store record")
        return path

    @contextmanager
    def _lock(self):
        self._check_volume()
        self._check_paths()
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        descriptor = os.open(self.root / ".write.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "a+") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                self._check_volume()
                self._check_paths()
                for name in DIRECTORIES:
                    self._path(name).mkdir(mode=0o700, parents=True, exist_ok=True)
                if not self.state_path.exists():
                    self._atomic_write(self.state_path, self._empty_state())
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    @contextmanager
    def worker_lock(self):
        self.initialize()
        descriptor = os.open(self.root / ".worker.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "a+") as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise StoreError("another Dream worker owns the queue") from error
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    def _empty_state(self) -> dict:
        return {"schema_version": STORE_SCHEMA_VERSION, "store_id": str(uuid4()),
                **{name: {} for name in TABLES}, "clock_date": ""}

    def initialize(self) -> None:
        with self._lock():
            self._state()

    def _atomic_write(self, path: Path, value: object) -> None:
        encoded = _json_bytes(value)
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".pending-", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        self._sync_directory(path.parent)

    @staticmethod
    def _sync_directory(path: Path) -> None:
        descriptor = os.open(path, os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    def _read_json(self, path: Path):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise StoreError(f"invalid store record {path.name}") from error

    def _state(self) -> dict:
        value = self._read_json(self.state_path)
        if not isinstance(value, dict) or value.get("schema_version") != STORE_SCHEMA_VERSION:
            raise StoreError("store state schema is unsupported")
        for table in TABLES:
            value.setdefault(table, {})
            if not isinstance(value[table], dict):
                raise StoreError(f"malformed store table {table}")
        value.setdefault("clock_date", "")
        if "store_id" not in value:
            self._import_legacy_indexes(value)
        return value

    def _import_legacy_indexes(self, state: dict) -> None:
        for path in self._path("inbox/observations").glob("*.json"):
            record = validate_record(self._read_json(path), "observation")
            state["observations"][record["observation_id"]] = {
                "path": str(path.relative_to(self.root)), "digest": digest(record),
                "session_key": session_key(record), "sequence": record["sequence"]}
        fields = ("schema_version", "closure_id", "source", "project_id", "session_id", "upper_sequence", "closed_at")
        for path in self._path("inbox/closures").glob("*.json"):
            legacy = self._read_json(path)
            identity = validate_record({key: legacy[key] for key in fields}, "closure")
            key = session_key(identity)
            state["closures"][identity["closure_id"]] = {
                **identity, "session_key": key, "identity_digest": digest(identity),
                "observation_ids": legacy.get("observation_ids", []),
                "status": "admitted", "created_at": identity["closed_at"]}
            state["session_cursors"][key] = max(state["session_cursors"].get(key, -1), identity["upper_sequence"])
        state["store_id"] = str(uuid4())

    def snapshot(self) -> dict:
        self._check_volume()
        self._check_paths()
        return deepcopy(self._state()) if self.state_path.exists() else self._empty_state()

    def bytes_used(self) -> int:
        self._check_paths()
        return sum(path.lstat().st_size for path in self.root.rglob("*")
                   if stat.S_ISREG(path.lstat().st_mode)) if self.root.exists() else 0

    def _commit(self, state: dict, blobs: dict[str, object] | None = None) -> None:
        blobs = blobs or {}
        additional = len(_json_bytes(state))
        for relative, content in blobs.items():
            path = self._path(relative)
            encoded = _json_bytes(content)
            if path.exists():
                if path.read_bytes() != encoded:
                    raise StoreError("immutable object conflicts with existing bytes")
            else:
                additional += len(encoded)
        reserved = sum(state["space_reservations"].values())
        if self.bytes_used() + additional + reserved + self.reserve_bytes > self.capacity_bytes:
            raise StoreError("store capacity is exhausted; input was not acknowledged")
        for relative, content in blobs.items():
            path = self._path(relative)
            if not path.exists():
                self._atomic_write(path, content)
        self._atomic_write(self.state_path, state)

    def admit_observation(self, record: object, *, assign_sequence: bool = False) -> dict:
        automatic_time = assign_sequence and isinstance(record, dict) and "observed_at" not in record
        if assign_sequence and isinstance(record, dict):
            record = redact_observation(deepcopy(record))
            record.setdefault("observation_id", digest({key: value for key, value in record.items()
                if key not in {"observed_at", "sequence"}}).removeprefix("sha256:"))
            record.setdefault("sequence", 0)
            record.setdefault("observed_at", utc_now())
        observation = redact_observation(validate_record(record, "observation"))
        if len(_json_bytes(observation)) > MAX_OBSERVATION_BYTES:
            raise StoreError("observation exceeds the 16 KiB admission limit")
        identifier = _safe_name(observation["observation_id"])
        with self._lock():
            state = self._state()
            previous = state["observations"].get(identifier)
            if previous:
                if assign_sequence:
                    observation["sequence"] = previous["sequence"]
                if automatic_time:
                    observation["observed_at"] = self._read_json(self._path(previous["path"]))["observed_at"]
                if previous["digest"] != digest(observation):
                    raise StoreError("observation id already exists with different bytes")
                return {"status": "ok", "idempotent": True, "observation_id": identifier,
                        "sequence": previous["sequence"]}
            key = session_key(observation)
            last = state["session_cursors"].get(key, -1)
            pending = [item for item in state["observations"].values()
                       if item["session_key"] == key and item["sequence"] > last]
            if len(pending) >= MAX_RANGE_OBSERVATIONS:
                raise StoreError("unclosed session range has reached its 64-observation admission limit")
            if assign_sequence:
                observation["sequence"] = max((row["sequence"] for row in pending), default=last) + 1
                if len(_json_bytes(observation)) > MAX_OBSERVATION_BYTES:
                    raise StoreError("observation exceeds the 16 KiB admission limit")
            if observation["sequence"] <= last:
                raise StoreError("observation is behind a closed range; submit a new contribution sequence")
            for item in state["observations"].values():
                if item["session_key"] == key and item["sequence"] == observation["sequence"]:
                    raise StoreError("session sequence already belongs to another observation")
            relative = f"inbox/observations/{identifier}.json"
            state["observations"][identifier] = {"path": relative, "digest": digest(observation),
                "session_key": key, "sequence": observation["sequence"],
                "source": observation["source"], "admitted_at": utc_now()}
            for instinct in observation["selected_instincts"]:
                evidence_key = digest([instinct["id"], instinct["version"], observation["source"], observation["project_id"]])
                evidence = state["runtime_evidence"].setdefault(evidence_key, {
                    "instinct_id": instinct["id"], "version": instinct["version"], "source": observation["source"],
                    "project_id": observation["project_id"], "observations": 0, "verified_outcomes": 0})
                evidence["observations"] += 1
                evidence["verified_outcomes"] += observation.get("evidence_kind") == "verified"
                evidence["latest_observation_id"] = identifier
            if observation.get("run_ref") and observation.get("run_verified") is False:
                for candidate in state["candidates"].values():
                    matching = any(item.get("run_ref") == observation["run_ref"] and (
                        item.get("project_id") == observation["project_id"]) for item in candidate.get("evidence", []))
                    if matching:
                        candidate.setdefault("qualification", {})["activation_eligible"] = False
                        candidate.setdefault("evidence_updates", []).append(identifier)
                        candidate["review_reason"] = "linked run outcome was contradicted"
            self._commit(state, {relative: observation})
        return {"status": "ok", "idempotent": False, "observation_id": identifier,
                "sequence": observation["sequence"]}

    def close_range(self, record: object) -> dict:
        closure = validate_record(record, "closure")
        identifier = _safe_name(closure["closure_id"])
        with self._lock():
            state = self._state()
            key = session_key(closure)
            existing = state["closures"].get(identifier)
            if existing:
                if existing["identity_digest"] != digest(closure):
                    raise StoreError("closure id already exists with different bounds")
                return {"status": "ok", "idempotent": True, "closure_id": identifier,
                        "observation_count": len(existing["observation_ids"])}
            lower = state["session_cursors"].get(key, -1)
            if closure["upper_sequence"] <= lower:
                for item in state["closures"].values():
                    if item["session_key"] == key and item["upper_sequence"] == closure["upper_sequence"]:
                        return {"status": "ok", "idempotent": True, "closure_id": item["closure_id"],
                                "observation_count": len(item["observation_ids"])}
                raise StoreError("closure upper bound is already consumed")
            selected = sorted((oid for oid, row in state["observations"].items()
                if row["session_key"] == key and lower < row["sequence"] <= closure["upper_sequence"]),
                key=lambda oid: state["observations"][oid]["sequence"])
            if len(selected) > MAX_RANGE_OBSERVATIONS:
                raise StoreError("closure range exceeds the 64-observation limit")
            # A future bound could silently discard contributions arriving later.
            last = max((row["sequence"] for row in state["observations"].values()
                        if row["session_key"] == key), default=-1)
            if closure["upper_sequence"] > last:
                raise StoreError("closure bound has not been durably observed")
            payload = {**closure, "session_key": key, "lower_sequence": lower,
                "identity_digest": digest(closure), "observation_ids": selected,
                "status": "admitted", "created_at": utc_now()}
            state["closures"][identifier] = payload
            state["session_cursors"][key] = closure["upper_sequence"]
            self._commit(state, {f"inbox/closures/{identifier}.json": closure})
        return {"status": "ok", "idempotent": False, "closure_id": identifier,
                "observation_count": len(selected)}

    def observations_for(self, closure: dict) -> list[dict]:
        state = self.snapshot()
        values = []
        for identifier in closure["observation_ids"]:
            row = state["observations"][identifier]
            value = self._read_json(self._path(row["path"]))
            if digest(value) != row["digest"]:
                raise StoreError("observation bytes changed after admission")
            values.append(value)
        return values

    def update_closure(self, identifier: str, *, expected_status: str, **changes) -> dict:
        with self._lock():
            state = self._state()
            row = state["closures"].get(identifier)
            if not row or row["status"] != expected_status:
                raise StoreError("closure status changed before its update")
            row.update(changes)
            self._commit(state)
            return deepcopy(row)

    def reserve_call_credit(self, *, now: datetime | None = None, limit: int = 32,
                            call_id: str | None = None, job_id: str | None = None,
                            request_digest: str | None = None) -> dict:
        timestamp = now or datetime.now(timezone.utc)
        if timestamp.tzinfo is None or limit <= 0:
            raise StoreError("invalid daily credit request")
        date = timestamp.astimezone(ZoneInfo("Europe/Paris")).date().isoformat()
        identifier = _safe_name(call_id or str(uuid4()))
        with self._lock():
            state = self._state()
            if identifier in state["calls"]:
                raise StoreError("model submission already reserved; uncertain work is never replayed")
            date = max(date, state["clock_date"])
            used = state["used_call_credits"].get(date, 0)
            job = state["jobs"].get(job_id)
            if job and job.get("finished_at"):
                raise StoreError("model job is already finalized")
            if job and job["date"] != date:
                remaining = job["reserved"] - job["consumed"]
                if used + remaining > limit:
                    raise StoreError("new daily budget cannot cover the remaining job")
                state["used_call_credits"][job["date"]] -= remaining
                state["used_call_credits"][date] = used + remaining
                job["date"] = date
            if not job and used >= limit:
                raise StoreError("daily model-call limit is exhausted")
            if job and job["consumed"] >= job["reserved"]:
                raise StoreError("reserved job budget is exhausted")
            if job_id and sum(row.get("job_id") == job_id for row in state["calls"].values()) >= 16:
                raise StoreError("job model-call limit is exhausted")
            state["clock_date"] = date
            if job:
                job["consumed"] += 1
            else:
                state["used_call_credits"][date] = used + 1
            state["calls"][identifier] = {"status": "submitted", "date": date,
                "job_id": job_id, "request_digest": request_digest, "submitted_at": utc_now()}
            self._commit(state)
        return {"status": "ok", "call_id": identifier, "date": date,
                "used": state["used_call_credits"].get(date, used), "limit": limit}

    def reserve_job(self, identifier: str, *, count: int = 16) -> dict:
        _safe_name(identifier)
        if not 1 <= count <= 16:
            raise StoreError("invalid model budget for job")
        with self._lock():
            state = self._state()
            date = max(datetime.now(ZoneInfo("Europe/Paris")).date().isoformat(), state["clock_date"])
            existing = state["jobs"].get(identifier)
            if existing:
                if count < existing["consumed"]:
                    raise StoreError("job budget cannot be smaller than submitted calls")
                finished = bool(existing.get("finished_at"))
                extra = count - existing["consumed"] if finished else max(0, count - existing["reserved"])
                date = date if finished else existing["date"]
                previous = state["used_call_credits"].get(date, 0)
                if previous + extra > 32:
                    raise StoreError("daily budget cannot extend the existing job")
                state["used_call_credits"][date] = previous + extra
                existing.update(date=date, reserved=count)
                existing.pop("finished_at", None)
                existing.pop("released_unsubmitted", None)
                state["clock_date"] = max(date, state["clock_date"])
                self._commit(state)
                return deepcopy(existing)
            used = state["used_call_credits"].get(date, 0)
            if used + count > 32:
                raise StoreError("daily model budget cannot cover this job")
            state["clock_date"] = date
            state["used_call_credits"][date] = used + count
            state["jobs"][identifier] = {"date": date, "reserved": count, "consumed": 0}
            self._commit(state)
            return deepcopy(state["jobs"][identifier])

    def reserve_space(self, identifier: str, size: int) -> None:
        _safe_name(identifier)
        with self._lock():
            state = self._state()
            if size < 0:
                raise StoreError("invalid temporary-space reservation")
            if size:
                state["space_reservations"][identifier] = size
            else:
                state["space_reservations"].pop(identifier, None)
            self._commit(state)

    def finalize_job(self, identifier: str) -> dict:
        with self._lock():
            state = self._state()
            job = state["jobs"].get(identifier)
            if not job:
                return {"status": "ok", "released_unsubmitted": 0}
            if job.get("finished_at"):
                return {"status": "ok", "released_unsubmitted": 0}
            remaining = job["reserved"] - job["consumed"]
            state["used_call_credits"][job["date"]] -= remaining
            job.update(finished_at=utc_now(), released_unsubmitted=remaining)
            self._commit(state)
            return {"status": "ok", "released_unsubmitted": remaining}

    def resume_closure(self, identifier: str, *, expected_digest: str) -> dict:
        with self._lock():
            state = self._state()
            row = state["closures"].get(identifier)
            recoverable = row and (row["status"] == "blocked_unknown" or (
                row["status"] == "complete" and row.get("disposition") == "pending-invalid-output"))
            if not recoverable or digest(row) != expected_digest:
                raise StoreError("closure is not the inspected interrupted range")
            calls = [call for call in state["calls"].values() if call.get("job_id") == identifier]
            if any(call["status"] != "completed" for call in calls):
                raise StoreError("a model call remains uncertain and cannot be replayed")
            row.update(status="admitted", resumed_at=utc_now())
            self._commit(state)
            return {"status": "ok", "closure_id": identifier}

    def save_preference(self, preference: dict) -> dict:
        identifier = _safe_name(preference.get("id"))
        if preference.get("scope") not in {"common", "project"} or not isinstance(preference.get("text"), str) or not preference["text"].strip():
            raise StoreError("preference requires explicit scope and text")
        if preference["scope"] == "project" and not preference.get("project_id"):
            raise StoreError("project preference needs project identity")
        value = deepcopy(preference)
        value["text"] = redact_observation({"summary": value["text"]})["summary"]
        value.setdefault("source", "user")
        if not isinstance(value["source"], str) or not value["source"]:
            raise StoreError("preference attribution must be a nonempty string")
        if "source_ref" in value and not isinstance(value["source_ref"], str):
            raise StoreError("preference source reference must be a string")
        if value.get("source_ref"):
            value["source_ref"] = redact_observation({"evidence_refs": [value["source_ref"]]})["evidence_refs"][0]
        identity = [identifier, value["scope"], value.get("project_id") if value["scope"] == "project" else None]
        key = digest(identity)
        with self._lock():
            state = self._state()
            legacy = state["preferences"].get(identifier)
            if legacy and legacy.get("scope") == value["scope"] and (
                value["scope"] == "common" or legacy.get("project_id") == value.get("project_id")):
                del state["preferences"][identifier]
                state["preferences"].setdefault(key, legacy)
            previous = state["preferences"].get(key)
            if previous and {k: v for k, v in previous.items() if k != "recorded_at"} == value:
                return {"status": "ok", "preference_id": identifier, "idempotent": True}
            state["preferences"][key] = {**value, "recorded_at": utc_now()}
            receipt = {"identity": identity, "value": state["preferences"][key],
                       "previous_digest": digest(previous) if previous else None}
            self._commit(state, {f"receipts/preference-{digest(receipt).removeprefix('sha256:')}.json": receipt})
        return {"status": "ok", "preference_id": identifier}

    def complete_call(self, identifier: str, result: dict) -> None:
        with self._lock():
            state = self._state()
            row = state["calls"].get(identifier)
            if not row or row["status"] != "submitted":
                raise StoreError("call has no unresolved reservation")
            relative = f"receipts/call-{_safe_name(identifier)}.json"
            row.update(status=result["status"], result_path=relative, completed_at=utc_now())
            self._commit(state, {relative: result})

    def save_candidate(self, identifier: str, value: dict, *, expected_digest: str | None = None) -> dict:
        _safe_name(identifier)
        with self._lock():
            state = self._state()
            existing = state["candidates"].get(identifier)
            if existing and digest(existing) != expected_digest:
                raise StoreError("candidate changed before update")
            state["candidates"][identifier] = deepcopy(value)
            self._commit(state)
        return value

    @staticmethod
    def _active_versions_for(state: dict, instinct_id: str, scope: str, project_id: str | None) -> set[str]:
        canonical = state["active_versions"].get(digest([instinct_id, scope, project_id]))
        matching = {row.get("version_id") for row in state["candidates"].values()
            if row.get("definition", {}).get("id") == instinct_id and row.get("scope") == scope
            and row.get("project_id") == project_id}
        result = set(state["active_versions"].values()) & matching
        if canonical:
            result.add(canonical)
        return result

    def active_version(self, instinct_id: str, scope: str, project_id: str | None) -> str | None:
        active = self._active_versions_for(self.snapshot(), instinct_id, scope, project_id)
        if len(active) > 1:
            raise StoreError("legacy active versions conflict; review the exact set before choosing a version")
        return next(iter(active), None)

    def prepare_version(self, version_id: str, definition: object, evidence: object) -> dict:
        identifier = _safe_name(version_id)
        if not isinstance(definition, dict) or not isinstance(evidence, dict):
            raise StoreError("definition and evidence must be objects")
        payload = {"schema_version": "1.0", "version_id": identifier,
                   "definition": definition, "evidence": evidence}
        with self._lock():
            state = self._state()
            existing = state["versions"].get(identifier)
            if existing:
                if existing["digest"] != digest(payload):
                    raise StoreError("version id already owns different bytes")
                return {"status": "ok", "idempotent": True, "version_id": identifier}
            self._check_definition_owner(state, definition)
            state["versions"][identifier] = {"digest": digest(payload), "path": f"versions/{identifier}.json",
                "instinct_id": definition.get("id"), "definition_version": definition.get("version"),
                "definition_digest": digest(definition)}
            definition_path = f".instincts/{identifier}.instinct.yaml"
            encoded_definition = yaml.safe_dump(definition, allow_unicode=True, sort_keys=False).encode("utf-8")
            state["versions"][identifier].update(definition_path=definition_path,
                definition_sha256=hashlib.sha256(encoded_definition).hexdigest())
            receipt = {"schema_version": "1.0", "version_id": identifier,
                       "digest": digest(payload), "status": "prepared"}
            self._commit(state, {f"versions/{identifier}.json": payload,
                                 definition_path: encoded_definition,
                                 f"receipts/{identifier}.json": receipt})
        return {"status": "ok", "idempotent": False, "version_id": identifier}

    def _check_definition_owner(self, state: dict, definition: dict) -> None:
        if not definition.get("id") or not definition.get("version"):
            return
        for metadata in state["versions"].values():
            if "definition_digest" in metadata:
                identity = (metadata.get("instinct_id"), metadata.get("definition_version"))
                owned_digest = metadata["definition_digest"]
            else:
                previous = self._read_json(self._path(metadata["path"]))["definition"]
                identity = (previous.get("id"), previous.get("version"))
                owned_digest = digest(previous)
            if identity == (definition["id"], definition["version"]) and owned_digest != digest(definition):
                raise StoreError("published instinct id/version owns different bytes. Choose a new identifier or version")

    def check_definition_owner(self, definition: dict) -> None:
        self._check_definition_owner(self.snapshot(), definition)

    def review(self, identifier: str, action: str, *, expected_digest: str,
               approval: str | None = None, expected_active: str | list[str] | None = None) -> dict:
        with self._lock():
            state = self._state()
            row = state["candidates"].get(identifier)
            if not row or digest(row) != expected_digest:
                raise StoreError("candidate changed before review")
            if action == "reject":
                if row.get("version_id") in state["active_versions"].values():
                    raise StoreError("reject targets pending candidates. Use rollback for an active version")
                row.update(status="rejected", reviewed_at=utc_now())
            elif action in {"accept", "rollback"}:
                from .engine import decide
                qualification = row.get("qualification", {})
                if not qualification.get("activation_eligible") or qualification.get("execution_kind") != "native":
                    raise StoreError("candidate lacks native behavioural qualification")
                verdict = decide(job=row["job"], results=row["results"])
                if verdict.get("status") != "qualified" or not verdict.get("activation_eligible"):
                    raise StoreError("candidate behavioural evidence no longer qualifies")
                if row.get("critical") and not approval:
                    raise StoreError("critical candidate requires an explicit user approval reference")
                version_id = row["version_id"]
                if version_id not in state["versions"]:
                    raise StoreError("candidate version is not durable")
                version = state["versions"][version_id]
                payload = self._read_json(self._path(version["path"]))
                if digest(payload) != version["digest"] or payload["definition"] != row["definition"]:
                    raise StoreError("candidate version integrity check failed")
                if payload["evidence"].get("job") != row["job"] or payload["evidence"].get("results") != row["results"]:
                    raise StoreError("candidate evidence differs from its immutable version")
                active_key = digest([row["definition"]["id"], row["scope"], row.get("project_id")])
                current = self._active_versions_for(state, row["definition"]["id"], row["scope"], row.get("project_id"))
                expected = expected_active if action == "rollback" else row.get("base_active")
                if action == "rollback" and not expected_active:
                    raise StoreError("rollback requires the inspected active version")
                if current == {version_id} and row.get("status") == "active":
                    return {"status": "ok", "candidate_id": identifier, "disposition": "active", "idempotent": True}
                expected_versions = set(expected) if isinstance(expected, list) else ({expected} if expected else set())
                if current != expected_versions:
                    raise StoreError("active version changed since candidate creation")
                definitions = {}
                for other in sorted(state["candidates"].values(), key=lambda item: item.get("scope") == "project"):
                    if other.get("version_id") not in state["active_versions"].values():
                        continue
                    if other.get("scope") == "common" or (
                        row["scope"] == "project" and other.get("project_id") == row.get("project_id")):
                        definitions[other["definition"]["id"]] = other["definition"]
                definitions[row["definition"]["id"]] = row["definition"]
                validate_definition_set(list(definitions.values()))
                for key, active in list(state["active_versions"].items()):
                    if active in current:
                        del state["active_versions"][key]
                state["active_versions"][active_key] = version_id
                row.update(status="active", reviewed_at=utc_now(), approval_reference=approval)
            else:
                raise StoreError("review action must be accept, reject or rollback")
            receipt = {"candidate_id": identifier, "action": action, "reviewed_at": row["reviewed_at"],
                       "approval_reference": approval, "previous_active": expected_active, "status": "prepared"}
            relative = f"receipts/review-{digest(receipt).removeprefix('sha256:')}.json"
            row["review_receipt"] = relative
            self._commit(state, {relative: receipt})
            return {"status": "ok", "candidate_id": identifier, "disposition": row["status"]}

    def record_delivery(self, packet: dict) -> dict:
        identifier = hashlib.sha256(_json_bytes(packet)).hexdigest()
        with self._lock():
            state = self._state()
            if identifier not in state["deliveries"]:
                relative = f"receipts/delivery-{identifier}.json"
                state["deliveries"][identifier] = {"path": relative, "created_at": utc_now()}
                self._commit(state, {relative: packet})
        return {"status": "ok", "delivery_id": identifier}

    def bind_launch(self, identifier: str, identity: dict) -> None:
        _safe_name(identifier)
        with self._lock():
            state = self._state()
            previous = state["launches"].get(identifier)
            if previous and previous != identity:
                raise StoreError("managed launcher already owns a different conversation")
            state["launches"][identifier] = identity
            self._commit(state)

    def wake_queue(self) -> None:
        with self._lock():
            if any(row["status"] == "admitted" for row in self._state()["closures"].values()):
                self._atomic_write(self._path("inbox/closures/.wake"), {"requested_at": utc_now()})

    def recover(self) -> dict:
        with self._lock():
            state = self._state()
            recovered = []
            # Recover the scaffold's old prepared objects, without activating them.
            for path in sorted(self._path("transactions").glob("*.json")):
                payload = self._read_json(path)
                identifier = _safe_name(payload["version_id"])
                version_path = f"versions/{identifier}.json"
                existing = self._path(version_path)
                if existing.exists() and self._read_json(existing) != payload:
                    raise StoreError("recovery found conflicting version bytes")
                state["versions"][identifier] = {"digest": digest(payload), "path": version_path}
                self._commit(state, {version_path: payload, f"receipts/{identifier}.json": {
                    "schema_version": "1.0", "version_id": identifier,
                    "digest": digest(payload), "status": "prepared"}})
                path.unlink()
                recovered.append(identifier)
            for row in state["calls"].values():
                if row["status"] == "submitted":
                    row["status"] = "blocked_unknown"
            for row in state["closures"].values():
                if row["status"] == "processing":
                    row.update(status="blocked_unknown", reason="worker interrupted before durable finalization")
            state["space_reservations"].clear()
            for identifier, job in state["jobs"].items():
                closure = state["closures"].get(identifier, {})
                if closure.get("status") in {"complete", "blocked_unknown"} and not job.get("finished_at"):
                    remaining = job["reserved"] - job["consumed"]
                    state["used_call_credits"][job["date"]] -= remaining
                    job.update(finished_at=utc_now(), released_unsubmitted=remaining)
            self._commit(state)
            return {"status": "ok", "recovered": recovered}

    def gc(self, *, now: datetime | None = None) -> dict:
        timestamp = now or datetime.now(timezone.utc)
        if timestamp.tzinfo is None:
            raise StoreError("maintenance time must be timezone-aware")
        with self._lock():
            state = self._state()
            removed = []
            for identifier, row in state["closures"].items():
                completed = row.get("completed_at")
                resolved = row.get("disposition") in {"active", "no-signal", "no-improvement", "merged"}
                if row["status"] != "complete" or not completed or not resolved:
                    continue
                age = (timestamp - datetime.fromisoformat(completed)).total_seconds()
                path = self._path(f"tmp/{_safe_name(identifier)}.json")
                if age >= 7 * 86400 and path.is_file():
                    path.unlink()
                    removed.append(str(path.relative_to(self.root)))
                if age >= 7 * 86400:
                    for call_id, call in state["calls"].items():
                        if call.get("job_id") != identifier or not re.fullmatch(r"[a-f0-9]{64}", call_id):
                            continue
                        if not call.get("result_path") or not self._path(call["result_path"]).is_file():
                            continue
                        call_dir = self._path(f"tmp/call-{call_id}")
                        request_file = self._path(f"tmp/call-{call_id}.request.json")
                        if call_dir.is_dir():
                            shutil.rmtree(call_dir)
                            removed.append(str(call_dir.relative_to(self.root)))
                        if request_file.is_file():
                            request_file.unlink()
                            removed.append(str(request_file.relative_to(self.root)))
            self._sync_directory(self._path("tmp"))
            return {"status": "ok", "removed": removed}

    def status(self) -> dict:
        state = self.snapshot()
        used = self.bytes_used()
        completed = [row for row in state["closures"].values() if row.get("completed_at")]
        last = max(completed, key=lambda row: row["completed_at"], default=None)
        return {"schema_version": "1.0", "status": "ok", "root": str(self.root),
            "initialized": self.state_path.exists(), "bytes_used": used,
            "capacity_bytes": self.capacity_bytes, "capacity_warning": used >= 192 * 1024 * 1024,
            "volume": {"expected_uuid": self.volume_uuid, "verified": bool(self.volume_uuid)},
            "queue": {key: row["status"] for key, row in state["closures"].items()},
            "closure_details": {key: {field: row.get(field) for field in ("status", "disposition", "reason", "upper_sequence")}
                                for key, row in state["closures"].items()},
            "last_completed_closure": last,
            "candidate_count": len(state["candidates"]), "active_versions": state["active_versions"],
            "unclosed_observation_count": sum(row["sequence"] > state["session_cursors"].get(row["session_key"], -1)
                                               for row in state["observations"].values()),
            "used_call_credits": state["used_call_credits"],
            "submitted_calls": len(state["calls"]),
            "unsubmitted_reserved_calls": sum(row["reserved"] - row["consumed"] for row in state["jobs"].values()
                                               if not row.get("finished_at")),
            "daily_call_limit": 32,
            "runtime_evidence": state["runtime_evidence"],
            "code_context": {"provider": "repository-sources", "gitnexus": "retired"},
            "activation": "manual-controller" if self.state_path.exists() else "not-installed"}
