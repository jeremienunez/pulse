# Golden Path: One Pulse 4 Run

Example request:

> Add inbound email support for the agent inbox.

1. `pulse:using-pulse` initializes `history/inbound-email/run.json`, `request.md`, six numbered output folders, and `.pulse/active-run`. It does not run preflight.
2. `pulse:exploring` writes `01_explore/output/decisions.md`; Gate 1 binds its hash.
3. `pulse:planning` writes `02_plan/output/plan.md` and immutable `work-graph.json`; Gate 2 validates the DAG and binds both hashes.
4. `pulse:validating` checks live repository feasibility and writes `03_validate/output/validation.json`.
5. The graph has two disconnected, file-disjoint components, so validation recommends swarm. Gate 3 presents the evidence and waits; recommendation alone starts nothing.
6. The user approves swarm. `run.json` records the approved strategy and worker cap. Stage 04 projects the approved graph into Beads for coordination, while `execution-state.json` remains the completion authority.
7. `pulse:reviewing` writes `review.json` and `uat.md`. Open P1 findings block Gate 4.
8. After Gate 4 approval, `pulse:compounding` writes `compounding.md`, promotes justified memory, and marks the run complete.

If any approved artifact changes, `pulse_status` reports the stale gate and blocks downstream routing until reapproval. If an existing legacy handoff is selected instead, Pulse loads the frozen legacy contract and leaves its history unchanged.
