# Stage 05 — Review

One job: decide whether the implemented run is ready for human merge approval.

## Inputs

- Approved decisions, plan, graph, and validation
- Completed execution state, execution report, and verification evidence
- Current diff and relevant runtime behavior

## Process

1. Review is root-owned by default. Do not spawn specialist agents unless the operator makes an explicit operator request for delegated review.
2. Review behavior, architecture, security, accessibility when relevant, test coverage, and deletable complexity in proportion to risk.
3. Validate claims against returned state, tests, logs, or runtime evidence.
4. Record findings with severity `P1`, `P2`, or `P3` and status `open` or `closed`; a complexity finding names the unnecessary mechanism, simpler replacement, and required verification.
5. `P1` findings block Gate 4. Do not hide them behind aggregate success.
6. Record human UAT instructions and outcome in `uat.md`.
7. To fix a finding, route through `pulse:using-pulse` and record a revision before changing completed execution. Use `04_execute` with the affected node IDs for an in-scope repair, or `02_plan` when scope or graph changes. Do not hide repairs in review outputs or manually reopen the run. Re-run verification and review after the revised execution.

## Outputs

- `history/<feature>/stages/05_review/output/review.json`, conforming to `workflow/schemas/review.schema.json`
- `history/<feature>/stages/05_review/output/uat.md`

## Exit

- Present review and UAT evidence for Gate 4.
- On approval with `status: ready` and no open P1, run `pulse_icm.mjs approve --gate GATE_4`.
