# Antigravity and inter-CLI integration

Pulse keeps one source for its contracts and skills. The Antigravity constructor
uses the common distributor, adds the native `plugin.json` and `mcp_config.json`,
and records source identity in `pulse-package.json`. The explicit `--install-root`
binds the packaged OpenCode MCP script to its final location. Rebuild for a
different installation directory; a staged package is not path-independent.
Use `--exclude-mcp opencode-models` for the current installation, where the
operator retired OpenCode. The exclusion is recorded in package metadata and
leaves the common Pulse source intact.

Install with `agy plugin install <native-package>` after strict validation.
Verify the directory reported by `agy plugin list --json`, then the payload
hashes and helper execution. Antigravity does not need a separate workflow engine
or lifecycle hook. The single-worker chain uses the same ICM gates and artifacts.

## Standalone cli-bridge

`node scripts/install-cli-bridge.mjs` creates a content-addressed snapshot under
`~/.local/share/pulse/cli-bridge/` (or `XDG_DATA_HOME`) and discovery links at:

| Surface | Skill location |
| --- | --- |
| Codex | `~/.agents/skills/cli-bridge/` |
| Claude Code | `~/.claude/skills/cli-bridge/` |
| Antigravity CLI | Its installed Pulse plugin's `skills/cli-bridge/` |

The standalone snapshot contains `SKILL.md`, its helper and transport reference.
It remains usable independently of a temporary package or the Antigravity plugin.
The installer refuses foreign destinations and verifies existing snapshots rather
than overwriting altered files. `--dry-run` performs discovery without writes.
Gemini CLI and OpenCode are retired targets. They are neither advertised nor
accepted by the helper, even if obsolete executables remain in a caller's PATH.
The installer no longer accepts `--gemini-root`. Antigravity's data under
`~/.gemini` is retained.

Use the [skill](../skills/cli-bridge/SKILL.md) for the JSON request and commands.
`consult` keeps the project filesystem read-only; `work` additionally permits the
explicitly separate workspace. CLI runtime state and the call directory remain
writable. Codex uses `--no-daemon` so local subprocess execution retains this
filesystem boundary. The [transport reference](../skills/cli-bridge/references/transports.md)
describes native policies, remote-MCP limits, failure states and process limits.

An installed executable or discovered skill does not establish account access.
`completed` means a usable terminal answer was received, while `task_verified`
remains false for coordinator readback. DeepSeek uses its direct MCP route;
the helper does not change providers when tools are absent.

## Verification

```bash
node --test scripts/test-build-antigravity-dist.mjs scripts/test-cli-bridge.mjs scripts/test-install-cli-bridge.mjs scripts/test-build-plugin-dist.mjs workflow/scripts/test_workflow_contracts.mjs
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" skills/cli-bridge
```

The [creation log](evaluation/cli-bridge/CREATION-LOG.md) distinguishes frozen
decision evaluations, subprocess fixtures and actual installed CLI evidence.
Authenticated runtime checks belong to the owning Pulse run rather than shipped
plugin state. Native credentials and user conversation history are not packaged.
