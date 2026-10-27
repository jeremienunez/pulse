<div align="center">

<img src="assets/logo-combination.svg" alt="Pulse logo" width="320" />

# Pulse Tuned

### From request to reviewed work.

A gated delivery workflow for Claude Code, Codex and Antigravity CLI.

<p>
  <a href=".codex-plugin/plugin.json"><img alt="Version" src="https://img.shields.io/badge/version-4.1.0-C96442?style=flat-square" /></a>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-141413?style=flat-square" />
  <a href="docs/skills.md"><img alt="Skills" src="https://img.shields.io/badge/skills-26-141413?style=flat-square" /></a>
</p>

[Install Pulse](docs/installation.md) · [Follow one run](docs/examples/golden-path.md) · [Browse the docs](docs/README.md)

</div>

## What Pulse does

Pulse gives coding agents a shared way to turn a request into reviewed work. The agent records decisions, builds a plan, verifies it against the repository, implements the approved scope, and returns evidence for review. Human approvals bind the exact artifacts being approved.

Everything is inspectable: Markdown carries the reasoning, JSON carries run and execution state, and local Node.js helpers check paths, hashes, gates and graph structure. Pulse ships as a skill plugin; it runs inside your coding agent without a separate orchestration service.

Use it when you want to:

- agree on the outcome before implementation starts;
- resume work from explicit files instead of reconstructing a chat;
- keep one approved plan across single-worker and parallel execution;
- distinguish implementation claims from tests, runtime checks and human acceptance.

Small changes and prototypes use the same cycle with shorter decisions, plans and checks. Preflight and onboarding are explicit diagnostics, so unrelated tooling does not become an automatic prerequisite.

## Get started

Install the plugin for your coding agent. The distribution branch is **`tuned/main`**, the plugin is **`pulse`**, and the marketplace is **`pulse-dev`**.

### Codex

```bash
codex plugin marketplace add jeremienunez/pulse --ref tuned/main
codex plugin add pulse@pulse-dev
```

### Claude Code

```bash
git clone --branch tuned/main --single-branch https://github.com/jeremienunez/pulse.git pulse-tuned
cd pulse-tuned
claude plugin marketplace add "$PWD"
claude plugin install pulse@pulse-dev --scope user
```

### Antigravity CLI

Build and install the native package from the same source. The [installation guide](docs/installation.md) covers its destination-bound configuration, validation and optional MCP servers.

### Your first task

Open the target repository in a fresh agent session and ask:

```text
Use pulse:using-pulse to add a CSV export to this project.
Resolve the current repository state, keep the scope small,
and present the decisions for approval before planning.
```

The router initializes a run or resumes the matching work. Review each gate's actual artifacts before approving. See the [workflow guide](docs/workflow.md) and [worked example](docs/examples/golden-path.md) for the full path.

## The delivery cycle

```text
using-pulse → explore → plan → validate → execute → review → compound
```

| Stage | Result | Human gate |
| --- | --- | --- |
| Explore | Decisions about the outcome and boundaries | **1:** approve decisions |
| Plan | One implementation plan and work graph | **2:** approve plan and graph |
| Validate | Repository evidence, feasibility and execution strategy | **3:** approve execution |
| Execute | Implemented graph nodes and verification evidence | — |
| Review | Findings and human acceptance evidence | **4:** approve merge |
| Compound | Durable learnings from the completed work | — |

**Single-worker is the default recommendation.** Separate graph components with disjoint file scopes can qualify for swarm, capped at four workers. Gate 3 explicitly selects the strategy. Beads can coordinate approved swarm work; the JSON graph stays authoritative.

Approvals record artifact hashes. If the approved content changes, the helper blocks downstream progress until the relevant stage is revised and approved again. Open P1 findings block Gate 4. These checks validate workflow mechanics; the agent and reviewer still have to establish that the implementation works.

## Beyond the core workflow

| Need | Pulse support |
| --- | --- |
| Understand a repository or refresh its docs | `bootstrap-project-context`, `refresh-project-docs` |
| Diagnose a failure or protect existing changes | `systematic-debug-fix`, `worktree-isolation` |
| Assess architecture or govern a cross-cutting change | `architecture-rescue`, `governed-feature` |
| Shape an interface, direct an image or choose visual production | `design`, `visual-assets` |
| Investigate a shipped app or runtime | `reverse-engineering` |
| Hand a bounded task between maintained coding CLIs | `cli-bridge` |
| Capture notes or consolidate runtime learnings | `dev-note`, `dev-note-distil`, `dream` |

The [skill guide](docs/skills.md) lists the full catalog and its activation rules. Design references retain selected Impeccable, awwwards and Visual Direction methods; specialized media engines and REA remain separate capabilities with their own availability and evidence requirements.

## Documentation

| Start here | What it covers |
| --- | --- |
| [Installation](docs/installation.md) | Prerequisites, each CLI, discovery checks and MCP boundaries |
| [Workflow](docs/workflow.md) | Artifacts, approvals, strategy, resume and revision |
| [Skills](docs/skills.md) | The 26 packaged entries and when to use them |
| [Architecture](docs/ARCHITECTURE.md) | Source ownership, helper guarantees and package boundaries |
| [CLI integration](docs/cli-integration.md) | Native Antigravity packaging and standalone CLI bridge |
| [Contributing](CONTRIBUTING.md) | Skill authoring, generation and repository checks |
| [All documentation](docs/README.md) | Design provenance, evaluations and maintainer references |

## Developing Pulse

Core routing and stage contracts live in [`workflow/`](workflow); their skill adapters are generated. Support skills live in [`skills/`](skills). For documentation and metadata checks:

```bash
bash scripts/check-markdown-links.sh
bash scripts/sync-skills.sh --dry-run
node scripts/build-workflow-skills.mjs --check
node scripts/build-skill-catalog.mjs --check
```

The optional Git hook and CI share `scripts/pulse-quality.mjs`. Its `commit` and `ci` profiles check the **Git index**, so stage the intended candidate before using them. See [Git quality checks](docs/git-quality-hooks.md) and [code quality](docs/code-quality.md) for tool preparation, receipts and coverage. Plugin lifecycle hooks are not installed by Pulse.

## Credits and license

Pulse Tuned is [jeremienunez's fork](https://github.com/jeremienunez/pulse/tree/tuned/main) of [quanpersie2001/Pulse](https://github.com/quanpersie2001/pulse). Plugin identities and original author credits are retained.

The project draws selected practices from [Khuym](https://github.com/hoangnb24/skills/tree/main), [Superpowers](https://github.com/obra/superpowers), SPDD Codex Skills, [Flywheel](https://agent-flywheel.com/complete-guide), [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin), [GSD](https://github.com/gsd-build/get-shit-done), [Impeccable](https://github.com/pbakaus/impeccable) and [REA](https://github.com/morluto/rea).

See the [lineage record](references/lineage/README.md) and [design provenance](docs/README.md#design-and-visual-assets) for source versions, licenses and adaptation boundaries.

MIT License. Retained third-party material follows its documented source license.

## Optional inter-CLI messaging

The [standalone messaging service](docs/cli-messaging.md) connects explicitly enrolled Claude Code, Codex and Antigravity sessions without Compagnion. [Verified profiles and limits](docs/cli-messaging-compatibility.md) distinguish native receipts, model declarations and recovery without replay. Setup prepares private launchers and preserves global profiles and the skill catalog.
