# Skill guide

The current package contains **26 skills**. The machine-readable [catalog](../skill-catalog.json) is generated from `skills/*/SKILL.md`. Filesystem and frontmatter names are bare; the plugin exposes Pulse skills through its `pulse:` namespace.

Start project work with `pulse:using-pulse`. The current stage determines the next core skill. Support skills contribute to that work without taking ownership of the lifecycle.

## Routing and delivery

| Skill | Use it for |
| --- | --- |
| [using-pulse](../skills/using-pulse/SKILL.md) | Detect or initialize ICM and route new or resumed project work |
| [exploring](../skills/exploring/SKILL.md) | Resolve the requested outcome and write explicit decisions |
| [planning](../skills/planning/SKILL.md) | Produce one plan and its immutable execution graph |
| [validating](../skills/validating/SKILL.md) | Verify feasibility, recommend single-worker and establish swarm eligibility |
| [executing](../skills/executing/SKILL.md) | Complete the approved graph and record verification evidence |
| [reviewing](../skills/reviewing/SKILL.md) | Review the result and prepare Gate 4 with findings and UAT evidence |
| [compounding](../skills/compounding/SKILL.md) | Capture durable learnings after approved review |

## Scope and execution support

| Skill | Use it for |
| --- | --- |
| [brainstorming](../skills/brainstorming/SKILL.md) | Clarify a genuinely uncertain product direction before exploration |
| [governed-feature](../skills/governed-feature/SKILL.md) | Apply an explicit governance overlay to durable behavior or cross-cutting change |
| [worktree-isolation](../skills/worktree-isolation/SKILL.md) | Preserve dirty or shared work and establish an isolated baseline |
| [swarming](../skills/swarming/SKILL.md) | Coordinate parallel workers when Gate 3 explicitly selects eligible swarm execution |
| [preflight](../skills/preflight/SKILL.md) | Run readiness or onboarding diagnostics only on explicit request |

## Repository understanding and maintenance

| Skill | Use it for |
| --- | --- |
| [bootstrap-project-context](../skills/bootstrap-project-context/SKILL.md) | Read repository rules and map actual architecture and project docs |
| [refresh-project-docs](../skills/refresh-project-docs/SKILL.md) | Rewrite docs against current source and verified commands |
| [architecture-rescue](../skills/architecture-rescue/SKILL.md) | Report on ownership drift, shallow modules and architecture opportunities |
| [systematic-debug-fix](../skills/systematic-debug-fix/SKILL.md) | Trace root causes, apply bounded fixes and verify regressions |
| [prompt-leverage](../skills/prompt-leverage/SKILL.md) | Improve a prompt before another task executes |
| [writing-pulse-skills](../skills/writing-pulse-skills/SKILL.md) | Evaluate skill guidance through frozen baseline, intervention and retest cases |

## Design and investigation

| Skill | Use it for |
| --- | --- |
| [design](../skills/design/SKILL.md) | Shape or review interfaces, direct visual scenes and apply relevant cultural or motion methods |
| [visual-assets](../skills/visual-assets/SKILL.md) | Select specialized visual production by input, output and actual capability |
| [reverse-engineering](../skills/reverse-engineering/SKILL.md) | Investigate shipped artifacts and observed runtime behavior |

Design guides load on demand. Source preservation, semantic review and actual rendered media effects have separate evidence. REA is an optional external engine; ordinary source-repository analysis uses repository tools. See [provenance and evaluations](README.md#design-and-visual-assets).

## Delegation and learning

| Skill | Use it for |
| --- | --- |
| [cli-bridge](../skills/cli-bridge/SKILL.md) | Hand a bounded request between maintained coding CLIs and read back its result |
| [dev-note](../skills/dev-note/SKILL.md) | Save one raw developer learning when explicitly requested |
| [dev-note-distil](../skills/dev-note-distil/SKILL.md) | Distill accumulated notes into stable reader-facing knowledge |
| [dream](../skills/dream/SKILL.md) | Manually consolidate runtime artifacts outside post-cycle compounding |

CLI bridge targets Antigravity, Claude Code and Codex. DeepSeek uses its direct MCP route. A delegate response is a proposal until the coordinator verifies it; see [CLI integration](cli-integration.md).

## Historical packaged entry

| Skill | Status |
| --- | --- |
| [opencode-models](../skills/opencode-models/SKILL.md) | Retained in the source catalog; OpenCode is retired from the maintained local workflow |

This entry counts toward the package's 26 skills. Its presence is not authorization to invoke or reinstall OpenCode. GitNexus is retired and is absent from the current source catalog.

## Authoring boundaries

The seven routing and stage skills are generated from [workflow contracts](../workflow) using `scripts/build-workflow-skills.mjs`. Other skills are authored under `skills/`. Update the catalog after a skill change and follow [Contributing](../CONTRIBUTING.md) for structure, evaluation and verification.
