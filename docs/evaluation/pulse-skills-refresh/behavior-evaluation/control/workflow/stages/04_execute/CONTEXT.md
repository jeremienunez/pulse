# Stage 04 — Execute

One job: complete the approved work graph and record verification without changing its plan-time structure.

## Inputs

- Approved `decisions.md`, `plan.md`, `work-graph.json`, and `validation.json`
- `run.json.execution.approved_strategy`
- Relevant source and test files for the selected graph node

## Process

1. Read the immutable graph and create `execution-state.json`; node states are `pending`, `in_progress`, `complete`, or `blocked`.
2. For `single-worker`, do not spawn execution agents; the root executes ready nodes sequentially and updates execution state after direct verification.
3. For `swarm`, invoke `pulse:swarming` with the approved component partition and `max_workers`. Beads and reservations are coordination projections only; reconcile completion back into `execution-state.json` centrally.
4. Never exceed declared file scopes. Stop on a scope conflict, failed verification, or stale approval.
5. When a node is investigative debugging, `pulse:systematic-debug-fix` is the authoritative owner for reproduction, root-cause tracing, the minimal repair, and regression proof.
6. Record node-specific evidence under `output/verification/` and summarize the implementation in `execution-report.md`.

## Outputs

- `history/<feature>/stages/04_execute/output/execution-state.json`
- `history/<feature>/stages/04_execute/output/execution-report.md`
- `history/<feature>/stages/04_execute/output/verification/`

## Exit

- When every node is `complete`, run `pulse_icm.mjs complete --stage 04_execute` and route to `pulse:reviewing`.
- Any blocked node prevents advancement.
