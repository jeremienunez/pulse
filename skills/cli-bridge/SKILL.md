---
name: cli-bridge
description: Use when the user asks coding CLIs to call one another, hand a bounded task to another CLI, or retrieve a result from an inter-CLI delegation.
metadata:
  version: '1.1'
  ecosystem: pulse
---

# CLI Bridge

Use the helper bundled with this skill for Antigravity (`agy`), Claude Code and
Codex. DeepSeek exposes its direct MCP route through the same discovery
interface. The calling agent retains its existing task and Pulse run.

Resolve `<skill-dir>` from the real path of this loaded `SKILL.md`; the helper
remains available when the skill is installed independently of the Pulse plugin.

```sh
node <skill-dir>/scripts/cli_bridge.mjs list
node <skill-dir>/scripts/cli_bridge.mjs prepare --request <request.json>
node <skill-dir>/scripts/cli_bridge.mjs run --request <request.json>
```

Prepare a JSON request with the recipient, the actual caller, a concrete task and
only the excerpts needed. Create it through a file-writing API; the helper
passes its prompt as data. For example:

```json
{
  "caller": "codex",
  "target": "antigravity",
  "cwd": "/absolute/path/to/project",
  "mode": "consult",
  "prompt": "Review this supplied function and return a concise proposal: ...",
  "output_dir": "/absolute/path/to/call-artifacts/new-call",
  "timeout_ms": 180000
}
```

`prepare` resolves capabilities without launching a recipient. `run` creates the
new call directory and records the submission, raw logs and result there. Choose
`work` only for authorized execution in a separate workspace; the helper checks
it against the coordinator's current working directory. An optional `model`
selects a model for this call. See [transports](references/transports.md) for
runtime requirements and adapter differences.

For `requires_mcp`, use the returned server/tool route on the current agent's
tool surface. `deepseek-coder` provides `delegate_code`. Availability is
checked by the caller; a listed route does not establish a connected server.

Read `result.json` and the logs to report the recipient's answer and any
restriction. The result distinguishes response completion, refusal, timeout and
unusable output. `task_verified` remains false until the caller checks the
requested outcome. For an interrupted existing call, inspect its original
directory; the helper preserves it and refuses another submission to that path.
