---
name: compounding
description: "Use after approved Pulse review to capture durable post-cycle learnings."
metadata:
  version: '4.0'
  ecosystem: pulse
  generated_from: 'workflow/stages/06_compound/CONTEXT.md'
  dependencies: []
---

<!-- GENERATED FROM PULSE ICM WORKFLOW. EDIT THE CANONICAL CONTRACT, NOT THIS FILE. -->

# compounding

## Runtime Selection

1. Resolve the installed Pulse plugin root from this `SKILL.md` path.
2. Run `node <plugin-root>/workflow/scripts/pulse_icm.mjs status --repo-root <repo-root>`.
3. If status is `icm-v2`, follow the embedded canonical contract below and do not load legacy guidance.
4. If status is `legacy-v1`, read `references/legacy-v1.md` and follow that frozen contract without rewriting history.
5. If status is `conflict`, stop and surface the conflicting v2 and legacy surfaces.
6. If status is `none`, route to `pulse:using-pulse`; this stage must not invent a run.

## ICM v2 Contract

# Stage 06 — Compound

One job: turn observed execution and review evidence into durable source-level improvements. Compounding is the canonical post-cycle, machine-readable learning pass for completed Pulse work. Use `pulse:dream` for runtime-artifact consolidation outside that post-cycle moment.

## Inputs

- Decisions, plan, validation, execution report, verification, review, and UAT artifacts
- Existing `.pulse/memory/` patterns relevant to the completed run

## Process

1. Separate reusable patterns from feature-specific detail.
2. Trace recurring output corrections back to the contract, reference, or source decision that should improve.
3. Write concise learnings with applicability conditions and evidence paths.
4. Promote only durable findings into `.pulse/memory/`; never store secrets or raw transcript noise.

## Outputs

- `history/<feature>/stages/06_compound/output/compounding.md`
- Any justified promotions under `.pulse/memory/`

## Exit

- Run `pulse_icm.mjs complete --stage 06_compound`.
- Report the completed run path, promoted learnings, and any explicitly deferred work.
