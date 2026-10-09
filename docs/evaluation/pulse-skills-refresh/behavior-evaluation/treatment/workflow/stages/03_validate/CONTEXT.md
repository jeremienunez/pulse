# Stage 03 — Validate

One job: prove the approved plan and graph fit the live repository, then separate cost-first execution recommendation from safe swarm eligibility.

## Inputs

- Approved `decisions.md`
- Approved `plan.md`
- Approved immutable `work-graph.json`
- Current repository, dependency, test, and runtime evidence required by the plan

## Process

1. Verify assumptions, interfaces, file ownership, tests, and failure paths against the current repository.
2. Verify that governance fitness is persisted; absence is never interpreted as `light` or `none`. When persisted governance fitness is `strong`, validate the `pulse:governed-feature` overlay.
3. Run the graph analyzer. Cycles, unknown dependencies, unsafe scopes, or malformed nodes block Gate 3.
4. Validate the chosen mechanism. When material new machinery lacks evidence that simpler rungs are insufficient, write `status: revise`, name the simpler alternative and missing evidence, and return to planning.
5. Use weakly connected components to determine swarm eligibility, not the default recommendation:
   - one component or cross-component file overlap → swarm-ineligible;
   - two or more file-disjoint components → swarm-eligible, capped at four workers;
   - the cost-first default for every valid graph is `single-worker`.
6. Do not consult or invoke preflight for this decision.
7. Write `status: ready` only when the plan is executable. Otherwise write `status: revise` with blockers and return to planning.

## Outputs

- `history/<feature>/stages/03_validate/output/validation.json`, conforming to `workflow/schemas/validation.schema.json`

## Exit

- Present validation evidence, the cost-first recommendation, and swarm eligibility at Gate 3.
- Human approval chooses `single-worker` or an eligible `swarm`; recommendation alone never starts workers.
- Run `pulse_icm.mjs approve --gate GATE_3 --strategy <strategy>` after approval.
