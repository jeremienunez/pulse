<div align="center">

<img src="assets/logo-combination.svg" alt="Pulse logo" width="420" />

# Pulse Tuned

<p><strong>A gated delivery workflow for Claude Code, Codex and Antigravity CLI</strong></p>

<p>
  <a href=".codex-plugin/plugin.json">
    <img alt="Version" src="https://img.shields.io/badge/version-4.1.0-0F766E?style=flat-square" />
  </a>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
  <a href="skills">
    <img alt="Skills" src="https://img.shields.io/badge/skills-27-8B5CF6?style=flat-square" />
  </a>
</p>

<p><em>Keep decisions, approvals and verification evidence visible throughout delivery.</em></p>

</div>

---

## What is Pulse?

Pulse gives AI agents a **gated, filesystem-visible delivery chain**. The workflow calls for approved decisions before planning, an approved plan and execution graph before implementation, and review before merge. The ICM helpers check stage transitions and content-bound approvals; the agent and reviewer supply the actual verification evidence.

Pulse ships as a **skills package**. Numbered contracts under `workflow/stages/` are the canonical source; lean `SKILL.md` adapters are generated for plugin discovery. Plain Markdown and JSON files carry stage context, while local Node helpers perform only mechanical validation, hashing, and graph analysis. There is no orchestration service or automatic lifecycle hook.

## The Delivery Chain

```text
using-pulse → explore → plan → validate → execute → review → compound
```

`pulse:preflight` is an explicit operator diagnostic. Brainstorming is optional. Swarming is an approved execution strategy, not a delivery stage.

[`pulse:design`](skills/design/SKILL.md) brings selected Impeccable methods, cultural enquiry and domain-specific motion guidance into the existing chain. An open expressive direction develops inspected works into research branches and concrete brief decisions. [`pulse:visual-assets`](skills/visual-assets/SKILL.md) selects specialized methods by effect, input and output: the optional local Threading adapter produces native string-art SVG; Primitive keeps its geometric SVG path. Brand asset families use the same accepted brief and admission.

Guides load on demand; Pulse retains the task, gates and evidence. Backend work, exact copy corrections and covered extensions keep their proportional scope. Skillry, Book of Shapes and Nonflowers have explicit [provenance and distribution boundaries](docs/design/design-expression-provenance.md). See the [design/assets evaluation](docs/evaluation/design-expression-assets.md) for actual local results, incomplete pressure diagnostics and human-adoption limits.

[`pulse:reverse-engineering`](skills/reverse-engineering/SKILL.md) contributes shipped-artifact and runtime investigation through on-demand guides. The REA CLI/MCP engine remains external and optional; its original Evidence supports the current Pulse stage. Ordinary source-repository analysis uses the existing repository tools. See the [local evaluation and limits](docs/evaluation/reverse-engineering.md).

Pulse turns a vague request into a reviewed delivery trail:

1. `pulse:exploring` writes `01_explore/output/decisions.md`
2. `pulse:planning` writes one `plan.md` and immutable `work-graph.json`
3. `pulse:validating` verifies feasibility and recommends strategy from weak graph connectivity
4. `pulse:executing` implements the approved graph, optionally through `pulse:swarming`
5. `pulse:reviewing` blocks weak merges
6. `pulse:compounding` captures durable learnings for future work

### The 4 Human Gates

| Gate | What it approves |
| --- | --- |
| **Gate 1** | Decisions |
| **Gate 2** | Plan and immutable work graph |
| **Gate 3** | Validated feasibility and execution strategy |
| **Gate 4** | Merge after review and UAT |

## Why use pulse

| Problem | Pulse response |
| --- | --- |
| Requirements drift inside chat | Lock decisions in a stage output |
| Plans look plausible but are brittle | Validate before execution starts |
| Parallel agents step on each other | Recommend swarm only for file-disjoint graph components |
| Work is hard to audit later | Keep artifacts, evidence, and review trail in the repo |

## Lineage

This repository is [jeremienunez's Pulse Tuned fork](https://github.com/jeremienunez/pulse/tree/tuned/main), based on [quanpersie2001/Pulse](https://github.com/quanpersie2001/pulse). Plugin identifiers remain `pulse` and `pulse-dev`; original author credits are retained.

Pulse is downstream of several strong agentic-development systems and distills the parts that fit this repo owner's actual workflow:

- **[Khuym](https://github.com/hoangnb24/skills/tree/main)**, which provides most of the validate-first chain and Flywheel-style bead workflow
- **[Superpowers](https://github.com/obra/superpowers)** 5.1.3 contributes selected, adapted practices for worktree isolation, debugging references, and controlled skill evaluation—not a wholesale copy of its lifecycle.
- **SPDD Codex Skills** 1.0.0 contributes selected fitness/change routing, REASONS, `OP-n`, safeguard, and traceability concepts through Pulse's single `governed-feature` overlay—not a competing lifecycle.
- **[Flywheel](https://agent-flywheel.com/complete-guide)** contributes Beads and reservation patterns used as an optional swarm projection rather than the canonical plan graph.
- **[Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)** contributes parallel review, severity-based findings, and the compound-learning loop that feeds future work.
- **[GSD](https://github.com/gsd-build/get-shit-done)** contributes the philosophy: discuss first, research second, plan third, and do not execute until the plan has been verified.
- **[Impeccable](https://github.com/pbakaus/impeccable)** 4.5.2 contributes selected web design methods through `pulse:design`, adapted under Apache-2.0 with [source hashes and adaptation boundaries](docs/design/impeccable-provenance.md).

- **[REA](https://github.com/morluto/rea)** contributes selected investigation and Evidence methods through `pulse:reverse-engineering`, adapted under MIT with a [pinned source lock](skills/reverse-engineering/references/rea-source-lock.json). The engine and providers are not bundled.

See the [lineage record](references/lineage/README.md) for the exact adaptation boundaries and source licenses.

## Installation

### Claude Code

Clone the distribution branch, then register that local checkout:

```bash
git clone --branch tuned/main --single-branch https://github.com/jeremienunez/pulse.git pulse-tuned
cd pulse-tuned
claude plugin marketplace add "$PWD"
claude plugin install pulse@pulse-dev --scope user
```

### Codex

```bash
codex plugin marketplace add jeremienunez/pulse --ref tuned/main
codex plugin add pulse@pulse-dev
```

Codex reads the marketplace name from [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json), so the installed plugin key is `pulse@pulse-dev`. Both the marketplace command and its plugin source select `tuned/main`; the repository's default branch can contain an older release. In the desktop app, select `Pulse Tuned` from the `pulse-dev` marketplace.

If you previously added an older Pulse marketplace named `pulse`, remove it before reinstalling:

```bash
codex plugin marketplace remove pulse
```

### Antigravity CLI

Build a native package from the common source into a fresh directory, then validate and install it:

```bash
pulse_dist="$(mktemp -d)/pulse"
node scripts/build-antigravity-dist.mjs --source . --output "$pulse_dist" --install-root "$HOME/.gemini/config/plugins/pulse" --exclude-mcp opencode-models
agy plugin validate "$pulse_dist" --strict --json
agy plugin install "$pulse_dist"
agy plugin list --json
```

The native package retains Pulse's workflow, helpers and skill references. Its metadata records the source version, commit, content digest and explicitly excluded MCP servers. Antigravity 1.4 installs this native package in the shared location above; verify the actual path with `agy plugin list --json` and rebuild with that `--install-root` when a runtime uses another location. This installation excludes the retired OpenCode route and retains three optional MCP definitions; listing them does not establish a live connection.

### Calls between coding CLIs

[`cli-bridge`](skills/cli-bridge/SKILL.md) supplies bounded calls between Antigravity, Claude Code and Codex, with the direct DeepSeek MCP route retained. To expose this skill independently to the maintained CLI surfaces:

```bash
node scripts/install-cli-bridge.mjs --dry-run
node scripts/install-cli-bridge.mjs
```

The installer links only this skill and preserves foreign destinations. The current process adapter uses Linux, Node.js and `bwrap`. See [CLI integration](docs/cli-integration.md) for requests, installed paths and verification boundaries.

### After Install

Installing the plugin makes the packaged skills and selected MCP server definitions available. Pulse 4 intentionally installs no lifecycle hooks. Start every project task with `pulse:using-pulse`, including small changes and disposable prototypes: initialize ICM first or resume the matching run. Keep preparation and verification proportionate within the cycle. Run `pulse:preflight` only when you explicitly want a readiness/onboarding diagnostic; its v2 checks depend on the selected work, so unrelated Beads or swarm tooling does not block a single-worker prototype.

## Project Docs

| Read this when you want... | Link |
| --- | --- |
| The architecture and runtime model | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| A concrete walkthrough | [docs/examples/golden-path.md](docs/examples/golden-path.md) |
| The evaluation workflow | [docs/evaluation/pulse-plugin-eval.md](docs/evaluation/pulse-plugin-eval.md) |
| The Pulse 4 ICM evaluation | [docs/evaluation/pulse-4-icm/creation-log.md](docs/evaluation/pulse-4-icm/creation-log.md) |
| Historical Pulse 3.6.0 certification | [docs/evaluation/certifications/pulse-3.6.0.md](docs/evaluation/certifications/pulse-3.6.0.md) |

## Maintainer Notes

The [portable CI](https://github.com/jeremienunez/pulse/blob/tuned/main/.github/workflows/ci.yml) runs on pushes and pull requests to `tuned/main`. It calls the same [quality entrypoint](scripts/pulse-quality.mjs) as the optional Git pre-commit hook. The `commit` profile checks syntax, static contracts, Markdown links and core workflow/helper behavior; `ci` adds the package and evidence suites. Both verify a copy of the active Git index, preserving uncommitted working files. They require no installed coding CLI, model credentials or paid calls. Native App Server and Bubblewrap integration tests remain separate local checks.

To inspect or install the hook explicitly in a Pulse source checkout:

```bash
node scripts/install-git-hooks.mjs --dry-run
node scripts/install-git-hooks.mjs
node scripts/pulse-quality.mjs --profile commit
```

The installer preserves foreign hooks and configuration. Multiple worktrees need an explicitly configured worktree-specific hooks path. See the [Git quality contract](docs/git-quality-hooks.md) for candidate identity, receipts, supported files, CI scope and installation limits. This is the Pulse repository pilot; it does not install hooks into other projects through onboarding.

When public docs or skill metadata change:

```bash
bash scripts/check-markdown-links.sh
bash scripts/sync-skills.sh --dry-run
```

Run evaluations through the canonical entrypoint:

```bash
node scripts/pulse-plugin-eval.mjs run
```

More evaluation material:

- [docs/evaluation/pulse-plugin-eval.md](docs/evaluation/pulse-plugin-eval.md)
- [docs/evaluation/pulse-swarming-hardening.md](docs/evaluation/pulse-swarming-hardening.md)
- [docs/evaluation/how-to-read-results.md](docs/evaluation/how-to-read-results.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for skill structure, versioning, and PR process.

<div align="center">

MIT License

</div>
