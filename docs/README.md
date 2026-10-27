# Pulse documentation

Pulse Tuned is a skill plugin for gated software delivery. Start with installation, then follow one run before reading the implementation details.

## Start and operate

| Guide | Read it for |
| --- | --- |
| [Installation](installation.md) | Prerequisites, Codex, Claude Code, native Antigravity and discovery checks |
| [Workflow](workflow.md) | Stage outputs, human gates, strategy, resumption and corrections |
| [Worked example](examples/golden-path.md) | A concrete request followed through all six stages |
| [Skill guide](skills.md) | The packaged skills and their activation boundaries |
| [Architecture](ARCHITECTURE.md) | Canonical state, source ownership and helper guarantees |
| [CLI integration](cli-integration.md) | Antigravity package construction and bounded inter-CLI calls |

## Contribute and verify

| Guide | Read it for |
| --- | --- |
| [Contributing](../CONTRIBUTING.md) | Skill structure, authoring, generated files and verification |
| [Git quality checks](git-quality-hooks.md) | Indexed candidates, optional source hooks, CI and receipts |
| [Code quality](code-quality.md) | Policies, native tools, baselines and language coverage |
| [Evaluation runbook](evaluation/pulse-plugin-eval.md) | Canonical evaluation commands and artifacts |
| [Reading results](evaluation/how-to-read-results.md) | Content verdicts, proof qualification and promotion limits |
| [Bounded skill iteration](evaluation/recursive-skills.md) | Controlled skill improvement and its stop conditions |
| [Action evaluation](evaluation/recursive-skill-actions.md) | Action proof and source-preserving execution |
| [Swarm hardening](evaluation/pulse-swarming-hardening.md) | Coordination checks and evidence |

Source contracts live in [workflow](../workflow) and support instructions in [skills](../skills). Evaluation documents report scoped evidence; a passing fixture or package check does not establish live model behavior or a working external provider.

## Design and visual assets

| Topic | Provenance | Evaluation |
| --- | --- | --- |
| Selected Impeccable methods | [Source and adaptations](design/impeccable-provenance.md) | [Integration evidence](evaluation/design-integration.md) |
| Cultural research and expressive assets | [Distribution boundaries](design/design-expression-provenance.md) | [Design and assets](evaluation/design-expression-assets.md) |
| Awwwards and jury direction | [Source preservation](design/awwwards-provenance.md) | [Integration evidence](evaluation/awwwards-design-integration.md) |
| Visual Direction pack | [Source and ownership](design/visual-direction-provenance.md) | [Qualification and limits](evaluation/visual-direction-skillpack.md) |

Additional technical records cover [creative sessions](evaluation/frontend-creative.md), [Threading SVG](evaluation/frontend-threading-svg.md) and [Primitive SVG](evaluation/frontend-primitive-svg.md). A capability description does not bundle its engine, provider or source assets.

## Investigation and integration evidence

- [Reverse engineering](evaluation/reverse-engineering.md): external REA ownership and the local investigation pilot.
- [CLI bridge creation log](evaluation/cli-bridge/CREATION-LOG.md): decision checks, subprocess fixtures and installed CLI evidence.
- [Revision verification](evaluation/using-pulse-revise/runtime-verification.md): recorded lifecycle corrections and recovery checks.
- [ICM creation log](evaluation/pulse-4-icm/creation-log.md): the initial filesystem workflow evaluation.

## Historical records

The [Pulse 3.6.0 certification](evaluation/certifications/pulse-3.6.0.md), [tuning archive](evaluation/tuning/pulse-3.6.0/README.md) and [skill refresh record](evaluation/pulse-skills-refresh/README.md) describe their recorded versions and conditions. Use the current contracts for present behavior.

The [lineage record](../references/lineage/README.md) preserves upstream credits and adaptation boundaries. Feature-specific decisions and handoffs belong under the target repository's `history/<feature>/`; they are separate from these project guides.
