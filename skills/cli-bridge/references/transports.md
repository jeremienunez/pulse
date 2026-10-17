# CLI transports

This adapter currently runs on Linux with Node.js 18+ and the installed
`bwrap` command. `list` reports these capabilities without installing anything.
The coordinator invokes it from its own workspace and supplies the recipient's
workspace through the request.

| Recipient | Invocation | Consultation restrictions |
| --- | --- | --- |
| `antigravity` / `agy` | `agy --print … --output-format json` | `--mode plan` and a read-only project mount |
| `claude` / `claude-code` | `claude --print … --output-format json` | Plan mode, Read/Glob/Grep tools, explicit empty MCP config, no session persistence |
| `codex` | `codex --no-daemon exec --json … -` | Native read-only sandbox, explicit cwd, ephemeral session; local execution stays inside the filesystem launcher |
| `deepseek` | Caller uses `deepseek-coder.delegate_code` MCP | Proposal-only direct API; no filesystem or execution tools |

The launcher mounts the host filesystem read-only and permits writes to the
call directory, the recipient's existing user runtime directory and cache. Work
mode additionally makes the isolated recipient workspace writable. Runtime
state is necessary for native credentials, logs and caches. This is filesystem
confinement of local subprocesses, not isolation of remote services or an
authorization grant for MCP effects. The marker `PULSE_CLI_BRIDGE_CHAIN` records
participants and limits call depth; it is a coordination mechanism.

`--mode plan` in Antigravity adds a planning instruction. The filesystem launcher
implements the local write restrictions rather than relying on the mode name.
Existing native permission policies still apply to work mode.

The helper accepts only the documented request fields. A request file is at most
256 KiB, its prompt at most 64 KiB, process output at most 2 MiB and its timeout
between 100 ms and 15 minutes (default 3 minutes). These are process and capture
limits; the helper sets no model token allowance or financial budget. Output
and timeout limits stop this process group and preserve an uncertain result.

`request.json` is written before launching the recipient; `stdout.log`,
`stderr.log` and `result.json` remain in that call directory. Files are private
to the user. A nonempty answer with a terminal native envelope can produce
`status: completed`; it does not establish that tests passed, files changed
correctly or an external action settled. Known tool refusals produce `denied`,
including Antigravity's exit-0 soft denial. Partial/invalid JSON, a failed exit,
interruptions and missing terminal events remain distinct from completion.

Validated CLI syntax: Antigravity 1.4.0, Claude Code 2.1.295 and Codex 0.162.1.
Actual account access and model selection are checked per call. Gemini CLI and
OpenCode were retired by the operator and are not advertised or accepted targets.

Sources: [Antigravity headless](https://www.antigravity.google/docs/cli/headless/),
[Antigravity modes](https://www.antigravity.google/docs/cli/modes/),
[Codex non-interactive](https://developers.openai.com/codex/noninteractive),
and local CLI help.
