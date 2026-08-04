---
name: governed-feature
description: Use when a Pulse feature may need explicit governance because it changes durable domain behavior, an API or invariant, compliance or security rules, or cross-cutting architecture. Do NOT use for trivial changes, short spikes, purely visual exploration, disposable scripts, or routine implementation inside an already approved governance overlay.
metadata:
  version: '1.1'
  dependencies:
    - id: node-runtime
      kind: command
      command: node
      missing_effect: unavailable
      reason: Governed-feature validates governance overlays with a dependency-free Node CLI.
---

# Governed Feature

Classify governance fitness and, only for a strong fit, create or update one Pulse-owned overlay at `history/<feature>/governance.md`.

Keep Pulse as the lifecycle owner. Keep approved `CONTEXT.md` decisions and scenarios as the authority for intent.

## Read the Governing Inputs

Read, in order:

1. approved `history/<feature>/CONTEXT.md`;
2. `discovery.md`, `approach.md`, and the active Pulse shape/current-work artifact when present;
3. current code boundaries relevant to the feature;
4. an existing `history/<feature>/governance.md`, when present.

If `CONTEXT.md` is missing or not approved, return to `pulse:exploring`. Do not create an overlay from assumptions.

## Classify Fitness

Choose exactly one fitness value:

- `strong` — durable behavior-rich domain or API work, compliance/security rules, or cross-cutting architecture where explicit invariants and traceability materially reduce risk;
- `light` — classification or a few constraints are useful, but a persistent overlay would cost more than it protects;
- `none` — trivial change, short spike, purely visual exploration, disposable script, or work whose governing context cannot yet be established.

For `light` or `none`, report the classification and reason, then return to the normal Pulse shape. Do not create a placeholder overlay.

## Classify the Change Route

Choose the route that matches the actual change:

| Change class | Route |
|---|---|
| New strong-fit feature | Create and review the overlay before Gate 2. |
| Observable intent, contract, API, or invariant change | Stop and return to `pulse:exploring`; update and reapprove `CONTEXT.md`, then refresh the overlay before code changes. |
| Behavior-preserving refactor | Prove preservation through Pulse; after implementation, synchronize only Structure, Operations, and Norms affected by the internal change. |
| Emergency containment | Restore service first; keep containment distinct from the root fix, then capture durable evidence through debugging, governance, and compounding. |
| Test-only change | Reference existing decisions and operations; never invent production behavior to satisfy a test. |

## Create or Update the Overlay

For `strong`, read [references/governance-template.md](references/governance-template.md) and write exactly one `history/<feature>/governance.md`.

Apply these ownership rules:

- Reference stable decision and scenario IDs from `CONTEXT.md`; do not restate them as a competing requirements source.
- Preserve stable `OP-n` operation IDs across edits. Add new IDs monotonically and mark retired operations instead of renumbering survivors.
- Derive entities, invariants, structure, norms, and safeguards from approved intent and repository reality.
- Map every governed decision/scenario to one or more operations and an observable verification target.
- Record trade-offs, rejected alternatives, blockers, and review findings explicitly.
- Keep structural status, semantic review, and human gate approval as separate fields.

When updating an existing overlay, change only sections affected by approved intent or proven implementation reality. If the overlay conflicts with `CONTEXT.md`, `CONTEXT.md` wins and the conflict is a blocker until the overlay is corrected.

## Validate Structure

Run the bundled read-only validator after creating or updating a strong-fit overlay:

```bash
node skills/governed-feature/scripts/validate-governance.mjs --json history/<feature>/governance.md
```

Require exit 0 before returning the artifact to its Pulse gate owner. The result always reports `semantic_validation: not_performed` and `grants_approval: false`; use review and the human Pulse gate for those decisions.

## Review the Result

Check that:

- fitness and change class are explicit;
- Scope In/Out is bounded;
- each entity has a responsibility and its invariants are testable;
- each active `OP-n` describes an observable operation rather than an implementation task;
- structure names dependencies and ownership boundaries;
- safeguards identify prevention, detection, and recovery where relevant;
- traceability reaches a concrete verification target;
- blockers and approval state are current.

Structural completeness proves only that required sections and links exist. It does not prove semantic correctness and never grants a Pulse gate approval.

## Return Control to Pulse

Return:

- fitness and change classification;
- artifact path, or the reason no artifact was created;
- affected decision/scenario and `OP-n` IDs;
- open blockers and required owner;
- recommended next Pulse skill or gate.

Do not write production code, create beads, approve gates, or launch a parallel specification lifecycle from this skill.

## Provenance

The fitness, change-routing, REASONS dimensions, stable operation IDs, safeguards, and traceability schema are adapted from the SPDD skills pack 1.0.0 (MIT). Pulse owns the resulting artifact and lifecycle routing.
