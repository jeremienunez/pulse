# Golden Path: One Pulse 4 Run

Read the [workflow guide](../workflow.md) for the artifact map and revision rules. This example illustrates an explicit choice of swarm; single-worker remains the default recommendation.

Example request:

> Add inbound email support for the agent inbox.

1. `pulse:using-pulse` initializes `history/inbound-email/run.json`, `request.md`, six numbered output folders, and `.pulse/active-run`. It does not run preflight.
2. `pulse:exploring` writes `01_explore/output/decisions.md`; Gate 1 binds its hash.
3. `pulse:planning` writes `02_plan/output/plan.md` and immutable `work-graph.json`; Gate 2 validates the DAG and binds both hashes.
4. `pulse:validating` checks live repository feasibility and writes `03_validate/output/validation.json`.
5. The graph has two disconnected, file-disjoint components, so validation marks it swarm-eligible while recommending single-worker. Gate 3 presents feasibility, cost and eligibility evidence and waits; recommendation alone starts nothing.
6. The user approves swarm. `run.json` records the approved strategy and worker cap. Stage 04 projects the approved graph into Beads for coordination, while `execution-state.json` remains the completion authority.
7. After all graph nodes complete and execution evidence is recorded, `pulse:reviewing` writes `review.json` and `uat.md`. Review is root-owned unless the operator explicitly requests specialists. Open P1 findings block Gate 4.
8. After Gate 4 approval, `pulse:compounding` writes `compounding.md`, promotes justified memory, and marks the run complete.

If any approved artifact changes, status reports the stale gate and blocks downstream routing. Use a recorded revision of the owning stage and obtain the required reapprovals. Gate 4 records merge approval; the helper does not perform the Git merge. If an existing legacy handoff is selected instead, Pulse loads the frozen legacy contract and leaves its history unchanged.
