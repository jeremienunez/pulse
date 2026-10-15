---
name: exploring
description: "Use when a new Pulse run needs product and architecture decisions locked before planning."
metadata:
  version: '4.0'
  ecosystem: pulse
  generated_from: 'workflow/stages/01_explore/CONTEXT.md'
  dependencies: []
---

<!-- GENERATED FROM PULSE ICM WORKFLOW. EDIT THE CANONICAL CONTRACT, NOT THIS FILE. -->

# exploring

## Runtime Selection

1. Resolve the installed Pulse plugin root from this `SKILL.md` path.
2. Run `node <plugin-root>/workflow/scripts/pulse_icm.mjs status --repo-root <repo-root>`.
3. If status is `icm-v2`, follow the embedded canonical contract below and do not load legacy guidance.
4. If status is `legacy-v1`, read `references/legacy-v1.md` and follow that frozen contract without rewriting history.
5. If status is `conflict`, stop and surface the conflicting v2 and legacy surfaces.
6. If status is `none`, route to `pulse:using-pulse`; this stage must not invent a run.

## ICM v2 Contract

# Stage 01 — Explore

One job: convert the request into explicit, approved decisions that planning can follow without guessing.

## Inputs

- `history/<feature>/request.md`
- `history/<feature>/run.json`
- Minimal repository and project references needed to resolve decisions

## Process

1. Confirm the concrete user, outcome, boundaries, constraints, and success evidence.
2. Resolve discoverable repository facts directly; ask only for product choices that materially change the result.
   For material web interface choices, use `pulse:design` and its framing guide to ground audience, factual content, constraints and inspected references before recommending a direction. Keep the brief in the existing decisions.
3. Record locked decisions, rejected alternatives, and unresolved blockers in a compact durable artifact.
4. Keep implementation planning out of this stage.

## Outputs

- `history/<feature>/stages/01_explore/output/decisions.md`

## Exit

- Present `decisions.md` for Gate 1 approval.
- On approval, run `pulse_icm.mjs approve --gate GATE_1` and stop at `02_plan` unless the user explicitly asks to continue.
