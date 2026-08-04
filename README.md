<div align="center">

<img src="assets/logo-combination.svg" alt="Pulse logo" width="420" />

# Pulse

<p><strong>A gated delivery workflow for Claude Code and Codex</strong></p>

<p>
  <a href=".codex-plugin/plugin.json">
    <img alt="Version" src="https://img.shields.io/badge/version-3.6.0-0F766E?style=flat-square" />
  </a>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
  <a href="skills">
    <img alt="Skills" src="https://img.shields.io/badge/skills-22-8B5CF6?style=flat-square" />
  </a>
</p>

<p><em>Stop agents from hallucinating requirements, skipping verification, and producing unauditable work.</em></p>

</div>

---

## What is Pulse?

Pulse wraps AI agents in a **gated delivery chain**. Every decision is locked before planning starts. Every plan is approved before code is written. Every bead of work is verified before it's closed. Every feature is reviewed before it merges.

Without this structure, agents skip steps. With it, they can't.

Pulse ships as a **skills package**. Each skill is a `SKILL.md` file loaded into context at invocation. The workflow contract lives in those skill files, while repo-local Node helpers handle onboarding, state sync, dependency checks, and local coordination. There is no separate orchestration service to deploy. Pulse is a docs-first skill plugin that uses the tools you already have.

## The Delivery Chain

<p align="center">
  <img src="assets/delivery-chain.png" alt="Pulse delivery chain showing preflight, using-pulse, brainstorming, exploring, planning, validating, swarming, executing, reviewing, and compounding with Gates 1-4 approvals." width="1100" />
</p>

Pulse turns a vague request into a reviewed delivery trail:

1. `pulse:exploring` locks decisions into `CONTEXT.md`
2. `pulse:planning` selects work shape (`work-shape.md`, `phase-plan.md`, or `epic-map.md`) and prepares current work artifacts
3. `pulse:validating` verifies feasibility and readiness for the selected current work
4. `pulse:swarming` or `pulse:executing` implements the approved current work
5. `pulse:reviewing` blocks weak merges
6. `pulse:compounding` captures durable learnings for future work

### The 4 Human Gates

| Gate | What it blocks |
| --- | --- |
| **Gate 1** | Planning before decisions are locked |
| **Gate 2** | Work-shape execution prep before the selected shape artifact is approved |
| **Gate 3** | Execution before feasibility-validated current work is explicitly approved |
| **Gate 4** | Merge before review is complete |

## Why use pulse

| Problem | Pulse response |
| --- | --- |
| Requirements drift inside chat | Lock decisions in `CONTEXT.md` |
| Plans look plausible but are brittle | Validate before execution starts |
| Parallel agents step on each other | Coordinate through beads, `bv`, and reservations |
| Work is hard to audit later | Keep artifacts, evidence, and review trail in the repo |

## Lineage

Pulse is downstream of several strong agentic-development systems and distills the parts that fit this repo owner's actual workflow:

- **[Khuym](https://github.com/hoangnb24/skills/tree/main)**, which provides most of the validate-first chain and Flywheel-style bead workflow
- **[Superpowers](https://github.com/obra/superpowers)** 5.1.3 contributes selected, adapted practices for worktree isolation, debugging references, and controlled skill evaluation—not a wholesale copy of its lifecycle.
- **SPDD Codex Skills** 1.0.0 contributes selected fitness/change routing, REASONS, `OP-n`, safeguard, and traceability concepts through Pulse's single `governed-feature` overlay—not a competing lifecycle.
- **[Flywheel](https://agent-flywheel.com/complete-guide)** contributes the operational backbone: beads, `bv`, swarm execution, and the habit of turning plans into live work graphs instead of loose TODO lists.
- **[Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)** contributes parallel review, severity-based findings, and the compound-learning loop that feeds future work.
- **[GSD](https://github.com/gsd-build/get-shit-done)** contributes the philosophy: discuss first, research second, plan third, and do not execute until the plan has been verified.

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

Installing the plugin makes the packaged skills, hooks, and MCP metadata available to the runtime. To use Pulse inside a target repository, start with `pulse:preflight` so Pulse can verify or install the repo-local onboarding assets it needs under `.pulse/`.

## Project Docs

| Read this when you want... | Link |
| --- | --- |
| The architecture and runtime model | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| A concrete walkthrough | [docs/examples/golden-path.md](docs/examples/golden-path.md) |
| The evaluation workflow | [docs/evaluation/pulse-plugin-eval.md](docs/evaluation/pulse-plugin-eval.md) |
| The Pulse 3.6.0 exact-profile certification | [docs/evaluation/certifications/pulse-3.6.0.md](docs/evaluation/certifications/pulse-3.6.0.md) |

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
