"""Crash-conscious file store for shared-instinct observations and versions."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import tempfile
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from .contracts import ContractError, canonical_json, validate_record


STORE_SCHEMA_VERSION = "1.0"
DEFAULT_CAPACITY_BYTES = 256 * 1024 * 1024
DEFAULT_RESERVE_BYTES = 4096
MAX_OBSERVATION_BYTES = 16 * 1024
MAX_RANGE_OBSERVATIONS = 64
SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


class StoreError(RuntimeError):
    """The store refused an operation without silently losing its input."""


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _json_bytes(value: object) -> bytes:
    return (canonical_json(value) + "\n").encode("utf-8")


def _safe_name(value: str) -> str:
    if not SAFE_NAME.fullmatch(value):
        raise StoreError("record id is not safe for a file name")
    return value


def _timestamp_date(now: datetime | None = None) -> str:
    timestamp = now or datetime.now(tz=ZoneInfo("Europe/Paris"))
    if timestamp.tzinfo is None:
        raise StoreError("timestamps must be timezone-aware")
    return timestamp.astimezone(ZoneInfo("Europe/Paris")).date().isoformat()


class Store:
    """One writer at a time; readers only see committed JSON files."""

    def __init__(self, root: Path, *, capacity_bytes: int = DEFAULT_CAPACITY_BYTES, reserve_bytes: int = DEFAULT_RESERVE_BYTES):
        if capacity_bytes <= reserve_bytes or reserve_bytes < 0:
            raise StoreError("invalid capacity or transaction reserve")
        self.root = root
        self.capacity_bytes = capacity_bytes
        self.reserve_bytes = reserve_bytes

    @property
    def state_path(self) -> Path:
        return self.root / "state.json"

    def initialize(self) -> None:
        self._ensure_root()
        for name in ("inbox/observations", "inbox/closures", "receipts", "candidates", "definitions", "versions", "transactions"):
            (self.root / name).mkdir(mode=0o700, parents=True, exist_ok=True)
        if not self.state_path.exists():
            self._atomic_write(
                self.state_path,
                {"schema_version": STORE_SCHEMA_VERSION, "used_call_credits": {}, "active_versions": {}, "session_cursors": {}},
            )

    def _ensure_root(self) -> None:
        if self.root.exists() and self.root.is_symlink():
            raise StoreError("store root must not be a symbolic link")
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if not self.root.is_dir():
            raise StoreError("store root is not a directory")

    def _path(self, relative: str) -> Path:
        target = self.root / relative
        resolved_parent = target.parent.resolve(strict=False)
        resolved_root = self.root.resolve(strict=False)
        if resolved_parent != resolved_root and resolved_root not in resolved_parent.parents:
            raise StoreError("path escapes the store root")
        return target

    @contextmanager
    def _lock(self):
        self.initialize()
        lock_path = self.root / ".write.lock"
        with lock_path.open("a+", encoding="utf-8") as handle:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def _atomic_write(self, path: Path, value: object) -> None:
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        encoded = _json_bytes(value)
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".pending-", delete=False) as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
            temporary = Path(handle.name)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

    def _read_json(self, path: Path) -> object:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise StoreError(f"cannot read {path.name}: {error}") from error

    def _state(self) -> dict[str, object]:
        value = self._read_json(self.state_path)
        if not isinstance(value, dict) or value.get("schema_version") != STORE_SCHEMA_VERSION:
            raise StoreError("store state schema is unsupported")
        return value

    def bytes_used(self) -> int:
        if not self.root.exists():
            return 0
        return sum(path.stat().st_size for path in self.root.rglob("*") if path.is_file() and path.name != ".write.lock")

    def _assert_capacity(self, additional: int) -> None:
        if additional < 0 or self.bytes_used() + additional + self.reserve_bytes > self.capacity_bytes:
            raise StoreError("store capacity is exhausted; observation was not acknowledged")

    def admit_observation(self, record: object) -> dict[str, object]:
        try:
            observation = validate_record(record, "observation")
        except ContractError as error:
            raise StoreError(str(error)) from error
        encoded = _json_bytes(observation)
        if len(encoded) > MAX_OBSERVATION_BYTES:
            raise StoreError("observation exceeds the 16 KiB admission limit")
        name = _safe_name(observation["observation_id"])
        path = self._path(f"inbox/observations/{name}.json")
        with self._lock():
            if path.exists():
                if path.read_bytes() == encoded:
                    return {"status": "ok", "idempotent": True, "observation_id": name}
                raise StoreError("observation id already exists with different bytes")
            self._assert_capacity(len(encoded))
            self._atomic_write(path, observation)
            return {"status": "ok", "idempotent": False, "observation_id": name}

    def close_range(self, record: object) -> dict[str, object]:
        try:
            closure = validate_record(record, "closure")
        except ContractError as error:
            raise StoreError(str(error)) from error
        name = _safe_name(closure["closure_id"])
        path = self._path(f"inbox/closures/{name}.json")
        with self._lock():
            if path.exists():
                existing = self._read_json(path)
                closure_identity = {
                    key: closure[key]
                    for key in ("schema_version", "closure_id", "source", "project_id", "session_id", "upper_sequence", "closed_at")
                }
                if isinstance(existing, dict) and all(existing.get(key) == value for key, value in closure_identity.items()):
                    return {
                        "status": "ok",
                        "idempotent": True,
                        "closure_id": name,
                        "observation_count": len(existing.get("observation_ids", [])),
                    }
                raise StoreError("closure id already exists with different bounds")
            state = self._state()
            cursors = state.get("session_cursors")
            if not isinstance(cursors, dict):
                raise StoreError("store session cursors are malformed")
            cursor_key = f"{closure['source']}:{closure['project_id']}:{closure['session_id']}"
            previous = cursors.get(cursor_key, -1)
            if not isinstance(previous, int) or previous < -1:
                raise StoreError("store session cursor is malformed")
            if closure["upper_sequence"] <= previous:
                raise StoreError("closure upper bound is already consumed")
            matching = []
            for item in (self.root / "inbox/observations").glob("*.json"):
                observation = self._read_json(item)
                if not isinstance(observation, dict):
                    raise StoreError("stored observation is malformed")
                if (
                    observation.get("source") == closure["source"]
                    and observation.get("project_id") == closure["project_id"]
                    and observation.get("session_id") == closure["session_id"]
                    and isinstance(observation.get("sequence"), int)
                    and previous < observation["sequence"] <= closure["upper_sequence"]
                ):
                    matching.append(observation["observation_id"])
            if len(matching) > MAX_RANGE_OBSERVATIONS:
                raise StoreError("closure range exceeds the 64-observation limit")
            payload = {**closure, "observation_ids": sorted(matching), "disposition": "admitted"}
            encoded = _json_bytes(payload)
            self._assert_capacity(len(encoded))
            self._atomic_write(path, payload)
            cursors[cursor_key] = closure["upper_sequence"]
            self._atomic_write(self.state_path, state)
            return {"status": "ok", "idempotent": False, "closure_id": name, "observation_count": len(matching)}

    def reserve_call_credit(self, *, now: datetime | None = None, limit: int = 32) -> dict[str, object]:
        if limit <= 0:
            raise StoreError("daily call limit must be positive")
        date = _timestamp_date(now)
        with self._lock():
            state = self._state()
            credits = state["used_call_credits"]
            if not isinstance(credits, dict):
                raise StoreError("store credits are malformed")
            used = credits.get(date, 0)
            if not isinstance(used, int) or used < 0:
                raise StoreError("store credit value is malformed")
            if used >= limit:
                raise StoreError("daily model-call limit is exhausted")
            credits[date] = used + 1
            self._atomic_write(self.state_path, state)
            return {"status": "ok", "date": date, "used": used + 1, "limit": limit}

    def prepare_version(self, version_id: str, definition: object, evidence: object) -> dict[str, object]:
        """Atomically publish a complete version only after a recovery-safe receipt exists."""

        name = _safe_name(version_id)
        if not isinstance(definition, dict) or not isinstance(evidence, dict):
            raise StoreError("definition and evidence must be objects")
        transaction = self._path(f"transactions/{name}.json")
        version_path = self._path(f"versions/{name}.json")
        receipt_path = self._path(f"receipts/{name}.json")
        with self._lock():
            if version_path.exists() and receipt_path.exists():
                return {"status": "ok", "idempotent": True, "version_id": name}
            payload = {"schema_version": STORE_SCHEMA_VERSION, "version_id": name, "definition": definition, "evidence": evidence}
            self._assert_capacity(sum(len(_json_bytes(item)) for item in (payload, {"version_id": name, "digest": _sha256_bytes(_json_bytes(payload))})))
            self._atomic_write(transaction, payload)
            self._atomic_write(version_path, payload)
            receipt = {"schema_version": STORE_SCHEMA_VERSION, "version_id": name, "digest": _sha256_bytes(_json_bytes(payload)), "status": "prepared"}
            self._atomic_write(receipt_path, receipt)
            transaction.unlink()
            return {"status": "ok", "idempotent": False, "version_id": name}

    def recover(self) -> dict[str, object]:
        with self._lock():
            recovered = []
            for transaction in sorted((self.root / "transactions").glob("*.json")):
                payload = self._read_json(transaction)
                if not isinstance(payload, dict) or not isinstance(payload.get("version_id"), str):
                    raise StoreError("transaction is malformed")
                name = _safe_name(payload["version_id"])
                version_path = self._path(f"versions/{name}.json")
                receipt_path = self._path(f"receipts/{name}.json")
                if not version_path.exists():
                    self._atomic_write(version_path, payload)
                if not receipt_path.exists():
                    self._atomic_write(receipt_path, {"schema_version": STORE_SCHEMA_VERSION, "version_id": name, "digest": _sha256_bytes(_json_bytes(payload)), "status": "prepared"})
                transaction.unlink()
                recovered.append(name)
            return {"status": "ok", "recovered": recovered}
