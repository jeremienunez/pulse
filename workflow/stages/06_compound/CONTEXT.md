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
