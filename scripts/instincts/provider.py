"""One guarded Anthropic request through the user's native Claude Code login."""

from __future__ import annotations

import gzip
import io
import http.client
import http.server
import json
import os
import subprocess
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable
from uuid import uuid4

from .contracts import canonical_json, digest


class ProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class ProviderResult:
    status: str
    response: str | None
    model_requested: str
    model_reported: str | None
    reason: str | None = None
    evidence: dict = field(default_factory=dict)

    def as_record(self) -> dict:
        return asdict(self)


def build_evaluation_prompt(*, case_id: str, guidance: str, prompt: str) -> str:
    return ("Use only the supplied guidance and case. Do not use tools, read files, "
            "consult other agents, call providers, or claim an action was executed. "
            "State the decision, proposed action and reason.\n\n"
            f"CASE ID: {case_id}\nGUIDANCE:\n{guidance}\nCASE:\n{prompt}")


class RequestGuard:
    """Loopback relay limiting each child to one accepted model request."""

    def __init__(self, reserve: Callable[[dict], None] | None = None):
        self.reserve = reserve
        self.token = str(uuid4())
        self.requests: list[dict] = []
        self.attempted = False
        self.mutex = threading.Lock()
        self.server = None

    def __enter__(self):
        guard = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                self.send_error(404)

            def do_POST(self):
                try:
                    guard.relay(self)
                except Exception:
                    # Headers and authentication are intentionally never logged.
                    self.send_error(502, "Guarded model request failed")

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        return self

    def __exit__(self, *args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def relay(self, handler) -> None:
        if handler.headers.get("x-pulse-call") != self.token or handler.path.split("?")[0] != "/v1/messages":
            handler.send_error(403)
            return
        length = int(handler.headers.get("Content-Length", "0"))
        if not 0 < length <= 1024 * 1024:
            handler.send_error(413)
            return
        raw = handler.rfile.read(length)
        body = gzip.GzipFile(fileobj=io.BytesIO(raw)).read(1024 * 1024 + 1) if handler.headers.get("Content-Encoding") == "gzip" else raw
        if len(body) > 1024 * 1024:
            handler.send_error(413)
            return
        request = json.loads(body)
        if request.get("tools") or not str(request.get("model", "")).startswith("claude-"):
            handler.send_error(403, "Model tool exposure refused")
            return
        captured = {"request_digest": digest(request), "model": request["model"],
                    "effort": request.get("output_config", {}).get("effort"), "tools": []}
        with self.mutex:
            if self.attempted:
                handler.send_error(429, "Additional model request refused")
                return
            self.attempted = True
            if self.reserve:
                self.reserve(captured)
            self.requests.append(captured)
        excluded = {"host", "connection", "transfer-encoding", "x-pulse-call", "accept-encoding"}
        headers = {key: value for key, value in handler.headers.items() if key.lower() not in excluded}
        headers["Accept-Encoding"] = "identity"
        connection = http.client.HTTPSConnection("api.anthropic.com", timeout=110)
        try:
            connection.request("POST", handler.path, body=raw, headers=headers)
            response = connection.getresponse()
            handler.send_response(response.status)
            handler.send_header("Content-Type", response.getheader("Content-Type", "application/json"))
            handler.send_header("Connection", "close")
            handler.end_headers()
            total = 0
            while chunk := response.read1(16384):
                total += len(chunk)
                if total > 2 * 1024 * 1024:
                    raise ProviderError("model response exceeds the capture limit")
                handler.wfile.write(chunk)
                handler.wfile.flush()
            captured.update(http_status=response.status, response_bytes=total)
        finally:
            connection.close()
            handler.close_connection = True


def invoke_claude_evaluation(*, bridge: Path, workspace: Path, call_dir: Path,
                            prompt: str, model: str, effort: str = "low",
                            timeout_ms: int = 120000, runner=None,
                            reserve: Callable[[dict], None] | None = None) -> ProviderResult:
    if call_dir.exists():
        raise ProviderError("call directory already exists; submitted work must not be replayed")
    if not 100 <= timeout_ms <= 120000 or effort not in {"low", "medium", "high", "xhigh", "max"}:
        raise ProviderError("invalid evaluation deadline or effort")
    request = {"caller": "pulse", "target": "claude", "mode": "evaluate",
               "cwd": str(workspace.resolve()), "prompt": prompt,
               "output_dir": str(call_dir.resolve()), "timeout_ms": timeout_ms,
               "model": model, "effort": effort}
    call_dir.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    request_path = call_dir.parent / f"{call_dir.name}.request.json"
    try:
        descriptor = os.open(request_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    except FileExistsError as error:
        raise ProviderError("request receipt already exists; submitted work must not be replayed") from error
    with os.fdopen(descriptor, "w") as handle:
        handle.write(canonical_json(request) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    command = ["node", str(bridge), "run", "--request", str(request_path)]
    if runner:
        completed = runner(command)
        wire = []
    else:
        with RequestGuard(reserve) as guard:
            environment = dict(os.environ)
            for name in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK",
                         "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"):
                environment.pop(name, None)
            environment.update(ANTHROPIC_BASE_URL=guard.url,
                ANTHROPIC_CUSTOM_HEADERS=f"x-pulse-call: {guard.token}",
                PULSE_CLI_BRIDGE_CHAIN='["pulse"]',
                PULSE_INSTINCTS_ORIGIN="dream",
                CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1",
                DISABLE_TELEMETRY="1", DISABLE_ERROR_REPORTING="1")
            try:
                completed = subprocess.run(command, text=True, capture_output=True,
                    timeout=timeout_ms / 1000 + 10, check=False, env=environment)
            except subprocess.TimeoutExpired as error:
                raise ProviderError("guarded transport timed out; submission remains uncertain") from error
            wire = deepcopy_requests(guard.requests)
    try:
        payload = json.loads(completed.stdout)
    except ValueError as error:
        raise ProviderError("bridge did not return JSON; receipt must be inspected") from error
    proof = {"execution_kind": "fixture" if runner else "native", "wire_requests": wire,
             "requested_effort": effort, "request_digest": digest(request)}
    if payload.get("status") != "completed" or completed.returncode:
        return ProviderResult("blocked_unknown", None, model, None, "transport did not complete", proof)
    if payload.get("tool_denied") or payload.get("effect_uncertain"):
        return ProviderResult("blocked_unknown", None, model, None, "transport reported uncertainty", proof)
    response = payload.get("response")
    if not isinstance(response, str) or not response.strip():
        return ProviderResult("blocked_unknown", None, model, None, "empty response", proof)
    reported = payload.get("model_reported")
    if not isinstance(reported, str) or not reported:
        return ProviderResult("pending", response, model, None, "effective model was not reported", proof)
    if not runner and (len(wire) != 1 or wire[0]["model"] != reported or wire[0]["effort"] != effort):
        return ProviderResult("pending", response, model, reported, "native profile was not established", proof)
    return ProviderResult("completed", response, model, reported, evidence=proof)


def deepcopy_requests(requests: list[dict]) -> list[dict]:
    return json.loads(canonical_json(requests))
