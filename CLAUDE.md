# CLAUDE.md

This repository packages Pulse 4 for Codex first, with best-effort Claude metadata compatibility.

## Architecture

Pulse uses Interpretable Context Methodology:

- `workflow/CONTEXT.md`  router and Layer 1 context.
- `workflow/stages/01_explore` through `06_compound`  canonical numbered stage contracts.
- `workflow/graph.json`  declarative stage graph.
- `skills/*/SKILL.md`  plugin-discovered skills; seven core skills are generated from workflow contracts.
- `skills/*/references/legacy-v1.md`  frozen complete legacy contracts.
- `skills/using-pulse/scripts/pulse_icm.mjs`  deterministic run, gate, hash, and connectivity mechanics.
- `.mcp.json`  GitNexus, Docker MCP, and Morph companion configuration.
- No lifecycle hooks are packaged or installed.

## Delivery Graph

```text
using-pulse -> exploring -> planning -> validating -> executing -> reviewing -> compounding
```

Brainstorming is optional. Preflight is explicit-only. Swarming is an approved Stage 04 strategy.

`pulse:design` provides on-demand design, cultural enquiry and domain-specific motion methods. `pulse:visual-assets` selects specialized production by effect, material/reference input role, output and inspected availability; it shares the existing task evidence and creative admission. An open direction requires inspected cultural branches and root substance review; covered extensions, backend work and exact copy corrections stay proportional. See [the design skill](skills/design/SKILL.md), [visual assets](skills/visual-assets/SKILL.md) and [provenance and diagnostic limits](docs/design/design-expression-provenance.md).

[`pulse:reverse-engineering`](skills/reverse-engineering/SKILL.md) supplies target-specific investigation guides for shipped artifacts and runtime observations. REA remains an optional external engine; its original Evidence contributes to the existing Pulse stage. Source analysis uses repository tools/GitNexus. See the [local evaluation and limits](docs/evaluation/reverse-engineering.md).

## New-Run Artifacts

```text
.pulse/active-run
history/<feature>/
  request.md
  run.json
  stages/01_explore/output/decisions.md
  stages/02_plan/output/plan.md
  stages/02_plan/output/work-graph.json
  stages/03_validate/output/validation.json
  stages/04_execute/output/execution-state.json
  stages/04_execute/output/execution-report.md
  stages/04_execute/output/verification/
  stages/05_review/output/review.json
  stages/05_review/output/uat.md
  stages/06_compound/output/compounding.md
```

Gate approvals bind hashes. Work graph status never changes after Gate 2; execution status belongs in `execution-state.json`.

## Editing and Testing

1. Edit canonical files under `workflow/`, then run `node scripts/build-workflow-skills.mjs`.
2. Preserve each frozen legacy contract unless intentionally fixing legacy behavior with its own baseline/retest.
3. Run `node --test workflow/scripts/test_pulse_icm.mjs workflow/scripts/test_workflow_contracts.mjs`.
4. Run `node skills/using-pulse/scripts/test_onboard_pulse.mjs`.
5. Run the strict plugin evaluator and plugin validator before installation.
6. Use `pulse:writing-pulse-skills` for exact-profile BASELINE -> INTERVENTION -> RETEST evidence.



## Recorded Run Revisions

Use `pulse:using-pulse` to resume from the active stage or record `revise --stage <stage> --reason <correction>`. Execution repairs require `--nodes`; changed scope returns to `02_plan` with renewed G2/G3/G4. Recover prepared revisions only with `revise --recover <exact ID>`. New requests after completion use distinct `init --from-run` successors with fresh gates. See [the canonical routing contract](workflow/CONTEXT.md).
