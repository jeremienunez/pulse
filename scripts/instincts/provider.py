"""Claude evaluation transport that never grants the model filesystem authority."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


class ProviderError(RuntimeError):
    """A request cannot establish a qualified model response."""


@dataclass(frozen=True)
class ProviderResult:
    status: str
    response: str | None
    model_requested: str
    model_reported: str | None
    reason: str | None = None


def build_evaluation_prompt(*, case_id: str, guidance: str, prompt: str) -> str:
    return (
        "Answer one frozen behavioral case. Use only the guidance and case below. "
        "Do not use tools, read files, consult other agents, call providers, or claim an action was executed. "
        "Return a decision, the next action you would take, and a concise reason.\n\n"
        f"CASE ID: {case_id}\n\nGUIDANCE:\n{guidance}\n\nCASE:\n{prompt}"
    )


def _bridge_command(bridge: Path, request_path: Path) -> list[str]:
    return ["node", str(bridge), "run", "--request", str(request_path)]


def invoke_claude_evaluation(
    *,
    bridge: Path,
    workspace: Path,
    call_dir: Path,
    prompt: str,
    model: str,
    effort: str = "low",
    timeout_ms: int = 120_000,
    runner: Callable[[list[str]], subprocess.CompletedProcess[str]] | None = None,
) -> ProviderResult:
    """Submit once through bridge evaluate mode; unknown effects are never retried."""

    if call_dir.exists():
        raise ProviderError("call directory already exists; submitted work must not be replayed")
    if timeout_ms < 100 or timeout_ms > 120_000:
        raise ProviderError("evaluation timeout must be between 100 and 120000 milliseconds")
    request = {
        "caller": "codex",
        "target": "claude",
        "mode": "evaluate",
        "cwd": str(workspace.resolve()),
        "prompt": prompt,
        "output_dir": str(call_dir.resolve()),
        "timeout_ms": timeout_ms,
        "model": model,
        "effort": effort,
    }
    call_dir.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    request_path = call_dir.parent / f"{call_dir.name}.request.json"
    if request_path.exists():
        raise ProviderError("request receipt already exists; submitted work must not be replayed")
    request_path.write_text(json.dumps(request, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    command = _bridge_command(bridge, request_path)
    execute = runner or (lambda args: subprocess.run(args, text=True, capture_output=True, check=False, timeout=(timeout_ms / 1000) + 10))
    completed = execute(command)
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise ProviderError("bridge did not return JSON") from error
    if payload.get("status") != "completed":
        return ProviderResult("blocked_unknown", None, model, None, str(payload.get("status", "invalid_output")))
    if payload.get("tool_denied") or payload.get("effect_uncertain"):
        return ProviderResult("blocked_unknown", None, model, None, "transport reported uncertainty")
    response = payload.get("response")
    if not isinstance(response, str) or not response.strip():
        return ProviderResult("blocked_unknown", None, model, None, "empty response")
    reported = payload.get("model_reported")
    if not isinstance(reported, str) or not reported:
        return ProviderResult("pending", response, model, None, "effective model was not reported")
    return ProviderResult("completed", response, model, reported)
