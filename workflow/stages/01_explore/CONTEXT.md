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
