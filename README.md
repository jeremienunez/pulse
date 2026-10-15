<div align="center">

<img src="assets/logo-combination.svg" alt="Pulse logo" width="420" />

# Pulse

<p><strong>A gated delivery workflow for Claude Code and Codex</strong></p>

<p>
  <a href=".codex-plugin/plugin.json">
    <img alt="Version" src="https://img.shields.io/badge/version-4.1.0-0F766E?style=flat-square" />
  </a>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
  <a href="skills">
    <img alt="Skills" src="https://img.shields.io/badge/skills-24-8B5CF6?style=flat-square" />
  </a>
</p>

<p><em>Stop agents from hallucinating requirements, skipping verification, and producing unauditable work.</em></p>

</div>

---

## What is Pulse?

Pulse wraps AI agents in a **gated, filesystem-visible delivery chain**. Every decision is locked before planning starts. Every plan and execution graph is approved before code is written. Every graph node is verified before it is complete. Every feature is reviewed before it merges.

Without this structure, agents skip steps. With it, they can't.

Pulse ships as a **skills package**. Numbered contracts under `workflow/stages/` are the canonical source; lean `SKILL.md` adapters are generated for plugin discovery. Plain Markdown and JSON files carry stage context, while local Node helpers perform only mechanical validation, hashing, and graph analysis. There is no orchestration service or automatic lifecycle hook.

## The Delivery Chain

```text
using-pulse → explore → plan → validate → execute → review → compound
```

`pulse:preflight` is an explicit operator diagnostic. Brainstorming is optional. Swarming is an approved execution strategy, not a delivery stage.

[`pulse:design`](skills/design/SKILL.md) brings selected Impeccable methods, cultural enquiry and domain-specific motion guidance into the existing chain. An open expressive direction develops inspected works into research branches and concrete brief decisions. [`pulse:visual-assets`](skills/visual-assets/SKILL.md) selects specialized methods by effect, input and output: the optional local Threading adapter produces native string-art SVG; Primitive keeps its geometric SVG path. Brand asset families use the same accepted brief and admission.

Guides load on demand; Pulse retains the task, gates and evidence. Backend work, exact copy corrections and covered extensions keep their proportional scope. Skillry, Book of Shapes and Nonflowers have explicit [provenance and distribution boundaries](docs/design/design-expression-provenance.md). See the [design/assets evaluation](docs/evaluation/design-expression-assets.md) for actual local results, incomplete pressure diagnostics and human-adoption limits.

Pulse turns a vague request into a reviewed delivery trail:

1. `pulse:exploring` writes `01_explore/output/decisions.md`
2. `pulse:planning` writes one `plan.md` and immutable `work-graph.json`
3. `pulse:validating` verifies feasibility and recommends strategy from weak graph connectivity
4. `pulse:executing` implements the approved graph, optionally through `pulse:swarming`
5. `pulse:reviewing` blocks weak merges
6. `pulse:compounding` captures durable learnings for future work

### The 4 Human Gates

| Gate | What it blocks |
| --- | --- |
| **Gate 1** | Planning before decisions are locked |
| **Gate 2** | Validation before the plan and immutable work graph are approved |
| **Gate 3** | Execution before feasibility-validated current work is explicitly approved |
| **Gate 4** | Merge before review is complete |

## Why use pulse

| Problem | Pulse response |
| --- | --- |
| Requirements drift inside chat | Lock decisions in a stage output |
| Plans look plausible but are brittle | Validate before execution starts |
| Parallel agents step on each other | Recommend swarm only for file-disjoint graph components |
| Work is hard to audit later | Keep artifacts, evidence, and review trail in the repo |

## Lineage

Pulse is downstream of several strong agentic-development systems and distills the parts that fit this repo owner's actual workflow:

- **[Khuym](https://github.com/hoangnb24/skills/tree/main)**, which provides most of the validate-first chain and Flywheel-style bead workflow
- **[Superpowers](https://github.com/obra/superpowers)** 5.1.3 contributes selected, adapted practices for worktree isolation, debugging references, and controlled skill evaluation—not a wholesale copy of its lifecycle.
- **SPDD Codex Skills** 1.0.0 contributes selected fitness/change routing, REASONS, `OP-n`, safeguard, and traceability concepts through Pulse's single `governed-feature` overlay—not a competing lifecycle.
- **[Flywheel](https://agent-flywheel.com/complete-guide)** contributes Beads and reservation patterns used as an optional swarm projection rather than the canonical plan graph.
- **[Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)** contributes parallel review, severity-based findings, and the compound-learning loop that feeds future work.
- **[GSD](https://github.com/gsd-build/get-shit-done)** contributes the philosophy: discuss first, research second, plan third, and do not execute until the plan has been verified.
- **[Impeccable](https://github.com/pbakaus/impeccable)** 4.5.2 contributes selected web design methods through `pulse:design`, adapted under Apache-2.0 with [source hashes and adaptation boundaries](docs/design/impeccable-provenance.md).

See the [lineage record](references/lineage/README.md) for the exact adaptation boundaries and source licenses.

## Installation

### Claude Code

```bash
/plugin marketplace add quanpersie2001/pulse
/plugin install pulse@pulse
```

### Codex

```bash
codex plugin marketplace add quanpersie2001/pulse
```

Codex reads the marketplace name from [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json), so the installed plugin key is `pulse@pulse-dev`. In the desktop app, enable or install `pulse` from the `pulse-dev` marketplace if it is not already active after the marketplace add step.

If you previously added an older Pulse marketplace named `pulse`, remove it before reinstalling:

```bash
codex plugin marketplace remove pulse
```

### After Install

Installing the plugin makes the packaged skills and four MCP server definitions available. Pulse 4 intentionally installs no lifecycle hooks. Start every project task with `pulse:using-pulse`, including small changes and disposable prototypes: initialize ICM first or resume the matching run. Keep preparation and verification proportionate within the cycle. Run `pulse:preflight` only when you explicitly want a readiness/onboarding diagnostic; its v2 checks depend on the selected work, so unrelated Beads or swarm tooling does not block a single-worker prototype.

## Project Docs

| Read this when you want... | Link |
| --- | --- |
| The architecture and runtime model | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| A concrete walkthrough | [docs/examples/golden-path.md](docs/examples/golden-path.md) |
| The evaluation workflow | [docs/evaluation/pulse-plugin-eval.md](docs/evaluation/pulse-plugin-eval.md) |
| The Pulse 4 ICM evaluation | [docs/evaluation/pulse-4-icm/creation-log.md](docs/evaluation/pulse-4-icm/creation-log.md) |
| Historical Pulse 3.6.0 certification | [docs/evaluation/certifications/pulse-3.6.0.md](docs/evaluation/certifications/pulse-3.6.0.md) |

## Maintainer Notes

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
