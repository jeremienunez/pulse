# Installation

Pulse is installed into a coding agent. Use the `tuned/main` branch of `jeremienunez/pulse`; the repository default branch can carry a different release. Package manifests use `pulse`, the marketplace uses `pulse-dev`, and the display name is **Pulse Tuned**.

## Prerequisites

- A maintained coding agent: Codex, Claude Code or Antigravity CLI.
- Git when installing from a repository.
- Node.js 18 or later for the ICM helpers. The repository's broader quality toolchain is verified on Linux with Node.js 24; see [code quality](code-quality.md).
- Python 3 and Bash for the repository's documentation and raw-skill synchronization scripts, when contributing.

An installation does not establish account access, model availability or a live MCP connection. Authentication and external tools belong to the selected runtime and task.

## Codex

Register the branch-specific marketplace and install the plugin:

```bash
codex plugin marketplace add jeremienunez/pulse --ref tuned/main
codex plugin add pulse@pulse-dev
```

Inspect discovery with:

```bash
codex plugin marketplace list
codex plugin list --marketplace pulse-dev --json
```

The [marketplace catalog](../.agents/plugins/marketplace.json) also pins its plugin source to `tuned/main`. In the desktop app, select **Pulse Tuned** from **pulse-dev**. Start a fresh session after installation so the session receives the installed skill catalog.

If an older installation uses a marketplace named `pulse`, inspect the registered marketplaces first. Remove that obsolete registration only when it is the one you intend to replace:

```bash
codex plugin marketplace remove pulse
```

## Claude Code

Clone the distribution branch, then register the checkout:

```bash
git clone --branch tuned/main --single-branch https://github.com/jeremienunez/pulse.git pulse-tuned
cd pulse-tuned
claude plugin marketplace add "$PWD"
claude plugin install pulse@pulse-dev --scope user
```

Inspect the installed plugin with:

```bash
claude plugin list
```

Start a fresh session and verify that `pulse:using-pulse` is available. Claude and Codex manifests share the package version; buildability alone does not establish equivalent behavioral evaluation on each runtime.

## Antigravity CLI

From a source checkout, build a native package into a new directory outside the repository:

```bash
pulse_dist="$(mktemp -d)/pulse"
node scripts/build-antigravity-dist.mjs \
  --source . \
  --output "$pulse_dist" \
  --install-root "$HOME/.gemini/config/plugins/pulse" \
  --exclude-mcp opencode-models
agy plugin validate "$pulse_dist" --strict --json
agy plugin install "$pulse_dist"
agy plugin list --json
```

`--output` must not already exist. `--install-root` must be an absolute path for the final plugin directory; the constructor uses it when binding retained path-dependent MCP scripts. The command above uses the shared Antigravity 1.4 location. Inspect `agy plugin list --json` to confirm the actual destination. If it differs, rebuild into another fresh output directory with that destination before installing.

`pulse-package.json` records the source version, commit, snapshot digest, install root and excluded MCP servers. A dirty source tree can have different bytes from its HEAD commit; use the content manifest and digest when comparing built and installed payloads.

Antigravity's use of a `.gemini` directory is part of its storage layout. Gemini CLI is a retired target. See [CLI integration](cli-integration.md) for packaging and transport details.

## Optional integrations

The current source [MCP manifest](../.mcp.json) declares three entries:

| Entry | Requirement and boundary |
| --- | --- |
| `MCP_DOCKER` | Docker's MCP gateway and separately available tools |
| `morph-mcp` | The Morph MCP package and its runtime requirements |
| `opencode-models` | Historical source definition; OpenCode is retired from the maintained local workflow |

The Antigravity command above explicitly excludes `opencode-models`, leaving two definitions. A listed definition does not prove that its command, credentials or tools work. Do not restore retired providers to satisfy a task. GitNexus is retired and is absent from the current source package.

REA and specialized visual engines are external capabilities. Beads, reservations and native worker adapters are relevant to approved swarm work. None of these is a universal prerequisite for a single-worker run.

## Standalone CLI bridge

To expose only the bounded CLI delegation skill independently of the full plugin:

```bash
node scripts/install-cli-bridge.mjs --dry-run
node scripts/install-cli-bridge.mjs
```

Review the dry-run destinations before installation. This installer preserves foreign destinations and uses a content-addressed snapshot. Its process adapter requires Linux, Node.js and Bubblewrap (`bwrap`). It targets Antigravity, Claude Code and Codex; DeepSeek uses its direct MCP route. Read [CLI integration](cli-integration.md) for isolation, result semantics and limits.

## Start using Pulse

In the target repository, invoke `pulse:using-pulse` with the task you want to perform. It resolves the current ICM state and selects the appropriate stage.

```text
Use pulse:using-pulse to implement a small CSV export.
Inspect the repository, record the scope and acceptance evidence,
and present the decisions at Gate 1.
```

`pulse:preflight` is available when you explicitly want a readiness or onboarding check. Pulse installs no plugin lifecycle hooks. The optional Git quality hook is a separate source-maintainer action described in [Git quality checks](git-quality-hooks.md).

## Check a problem at the right layer

| Symptom | First check |
| --- | --- |
| Plugin or skills missing | Marketplace name, branch, installed plugin and a fresh agent session |
| An older package appears | Both marketplace registration and plugin source must select `tuned/main` |
| Antigravity validation fails | Native package shape, final install root and excluded MCP names |
| Optional tool cannot start | Its executable, runtime configuration and credentials; discovery alone is insufficient |
| Task cannot advance | ICM status, current stage and content-bound approvals; see [workflow](workflow.md) |

An installation check establishes discovery. A real task with returned artifacts and verification establishes execution on the selected runtime.
