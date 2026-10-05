---
name: planning
description: "Use after Pulse exploration when approved decisions need one plan and a work graph."
metadata:
  version: '4.0'
  ecosystem: pulse
  generated_from: 'workflow/stages/02_plan/CONTEXT.md'
  dependencies: []
---

<!-- GENERATED FROM PULSE ICM WORKFLOW. EDIT THE CANONICAL CONTRACT, NOT THIS FILE. -->

# planning

## Runtime Selection

1. Resolve the installed Pulse plugin root from this `SKILL.md` path.
2. Run `node <plugin-root>/workflow/scripts/pulse_icm.mjs status --repo-root <repo-root>`.
3. If status is `icm-v2`, follow the embedded canonical contract below and do not load legacy guidance.
4. If status is `legacy-v1`, read `references/legacy-v1.md` and follow that frozen contract without rewriting history.
5. If status is `conflict`, stop and surface the conflicting v2 and legacy surfaces.
6. If status is `none`, route to `pulse:using-pulse`; this stage must not invent a run.

## ICM v2 Contract

# Stage 02 — Plan

One job: transform approved decisions into one implementation plan and one immutable execution graph.

## Inputs

- `history/<feature>/request.md`
- Approved `stages/01_explore/output/decisions.md`
- Relevant source, tests, project rules, and direct technical evidence

## Process

1. Diagnose the current implementation and select the first sufficient mechanism in this order: avoid building; reuse existing code; use the standard library or native platform; reuse an installed dependency; only then write minimal local code.
2. Classify governance fitness as exactly `strong`, `light`, or `none` and record it in `plan.md`; use `pulse:governed-feature` when the persisted value is `strong`.
3. Write a decision-complete plan with interfaces, failure behavior, compatibility boundaries, and verification.
4. Decompose execution into graph nodes. Every node declares dependencies, exact repo-relative file scopes, and verification requirements. Do not split trivial work solely to manufacture swarm components.
5. Keep the graph acyclic. Do not add execution status to the graph.
6. Run `pulse_icm.mjs analyze --graph history/<feature>/stages/02_plan/output/work-graph.json` before Gate 2.

## Outputs

- `history/<feature>/stages/02_plan/output/plan.md`
- `history/<feature>/stages/02_plan/output/work-graph.json`, conforming to `workflow/schemas/work-graph.schema.json`

## Exit

- Present both outputs for Gate 2 approval.
- On approval, run `pulse_icm.mjs approve --gate GATE_2` and stop at `03_validate` unless the user explicitly asks to continue.
