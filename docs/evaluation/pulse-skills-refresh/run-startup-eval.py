#!/usr/bin/env python3
"""Replay frozen, text-only Pulse decisions through an isolated Codex CLI."""
import concurrent.futures
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parent
EVAL = ROOT / "startup-evaluation"
CODEX = "/usr/lib/chatgpt/resources/codex"
MODEL = "gpt-5.6-sol"
REASONING = "high"

def sha(data):
    return hashlib.sha256(data).hexdigest()

def run_case(case, condition):
    target = EVAL / "runs" / condition / case["id"]
    target.mkdir(parents=True, exist_ok=False)
    prompt = case["prompt"] + "\n\nAvailable local guidance:\n"
    for rel in case["context_files"]:
        prompt += f"\n--- {rel} ---\n" + (EVAL / condition / rel).read_text()
    (target / "prompt.txt").write_text(prompt)
    argv = [CODEX, "exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check",
            "--sandbox", "read-only", "--model", MODEL,
            "-c", 'model_reasoning_effort="high"',
            "-c", "project_doc_max_bytes=0",
            "-c", 'developer_instructions="Return only the requested structured decision based on the supplied scenario and guidance. Do not use tools, inspect other files, call other agents, or perform real actions. You are producing the action artifact for this bounded scenario. Do not invent facts absent from the scenario."',
            "--output-schema", str(EVAL / "response.schema.json"),
            "--json", "--output-last-message", str(target / "response.json"), "-"]
    started = time.time()
    with tempfile.TemporaryDirectory(prefix="pulse-eval-empty-") as cwd:
        try:
            result = subprocess.run(argv, cwd=cwd, input=prompt, text=True,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=240)
        except subprocess.TimeoutExpired as error:
            (target / "failure.txt").write_text(str(error))
            print(json.dumps({"case": case["id"], "condition": condition, "error": "timeout"}), flush=True)
            return
    (target / "events.jsonl").write_text(result.stdout)
    (target / "stderr.txt").write_text(result.stderr)
    events = []
    for line in result.stdout.splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    tools = [e for e in events if e.get("item", {}).get("type") in
             ["command_execution", "mcp_tool_call", "web_search", "collab_tool_call"]]
    meta = {"case_id": case["id"], "condition": condition, "model_selector": MODEL,
            "version_identifier": MODEL, "dated_snapshot_exposed": False,
            "reasoning": REASONING, "runtime": subprocess.check_output([CODEX, "--version"], text=True).strip(),
            "argv": argv, "prompt_sha256": sha(prompt.encode()), "exit_code": result.returncode,
            "elapsed_seconds": round(time.time()-started, 3), "tool_event_count": len(tools),
            "usage_events": [e for e in events if e.get("type") == "turn.completed"],
            "scope": "text-only action decisions; not end-to-end agent execution or a dated-model certification"}
    (target / "metadata.json").write_text(json.dumps(meta, indent=2)+"\n")
    print(json.dumps({"case": case["id"], "condition": condition, "exit_code": result.returncode,
                      "tool_events": len(tools), "response_exists": (target / "response.json").exists()}), flush=True)

if __name__ == "__main__":
    condition = sys.argv[1]
    assert condition in ("control", "treatment")
    frozen = json.loads((EVAL / "freeze.json").read_text())
    for rel, digest in frozen["files"].items():
        if sha((EVAL / rel).read_bytes()) != digest:
            raise SystemExit("Frozen evidence changed: " + rel)
    cases = json.loads((EVAL / "cases.json").read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda case: run_case(case, condition), cases))
