<!-- PULSE:START -->
# Pulse Workflow

Use `pulse:using-pulse` first for every new or resumed project task, including small changes and prototypes. Initialize ICM before producing task artifacts when no run exists; reuse the matching active run. Apply this entry rule regardless of the model or task size.

## Architecture

Pulse 4 uses an interpretable filesystem workflow. One agent loads only the current numbered stage contract and its declared inputs. Plain Markdown and JSON artifacts carry context between stages; deterministic local scripts validate paths, gates, hashes, and graph connectivity.

Preflight is a manual diagnostic outside the delivery graph. Run `pulse:preflight` only when the user explicitly requests it.

## Glossary

- `run.json` — canonical v2 run state and content-bound gate approvals.
- stage contract — one numbered stage's Inputs, Process, Outputs, and Exit rules.
- `work-graph.json` — immutable approved execution DAG.
- `execution-state.json` — mutable node completion state; never stored in the plan graph.
- legacy v1 — existing `.pulse/state.json`, shape artifacts, checkpoints, and owner handoffs, resumed without migration.

## Startup

1. Read this file after session start or compaction.
2. Run `node .pulse/scripts/pulse_status.mjs --json` when the helper exists; otherwise invoke `pulse:using-pulse` and resolve the plugin-local ICM status script.
3. For ICM v2, read `.pulse/active-run`, the referenced `run.json`, the current stage contract, and only its declared inputs.
4. For legacy v1, surface the active handoff/state and wait for explicit resume confirmation.
5. If v2 and legacy surfaces conflict, stop without writing either.
6. If no run exists, initialize one through `pulse:using-pulse` before brainstorming, prototyping or implementation. Keep simple/prototype decisions, plans and checks proportionate inside that same cycle.

## Delivery Graph

```text
pulse:using-pulse
  -> pulse:exploring
  -> pulse:planning
  -> pulse:validating
  -> pulse:executing
  -> pulse:reviewing
  -> pulse:compounding
```

- `pulse:brainstorming` is an optional pre-stage.
- `pulse:swarming` is an execution strategy inside Stage 04, not a delivery stage.
- `pulse:preflight` is invoked only on explicit user request.

## Human Gates

- Gate 1 approves `01_explore/output/decisions.md`.
- Gate 2 approves `02_plan/output/plan.md` and immutable `work-graph.json`.
- Gate 3 approves validated execution and the selected strategy.
- Gate 4 approves merge after review and UAT; open P1 findings block it.

Approvals bind artifact SHA-256 hashes. Any approved artifact edit makes the gate stale and blocks downstream routing until reapproval.

## Resume and Revision

Resume unchanged work from `current_stage`, its inputs, execution state and stage-local handoff. To reopen finished work, use `pulse:using-pulse` and `pulse_icm.mjs revise --stage <stage> --reason '<correction>'`; execution repairs also require `--nodes <affected IDs>`. Scope/graph changes return to `02_plan` and reset G2/G3/G4; in-scope execution repairs retain G1/G2/G3, reset G4 and preserve independent completed nodes. Never reopen a stage by editing lifecycle JSON manually.

For `revision_prepared`, use `revise --recover <exact revision ID>` and respect ownership/binding failures. A new request after completion uses a distinct `init --from-run history/<parent>/run.json` successor with fresh approvals and unchanged parent artifacts.

## Execution Strategy

- Every valid graph recommends `single-worker` as the cost-first default.
- Connectivity determines swarm eligibility only: at least two file-disjoint components are eligible, capped at four workers; conflicts are ineligible.
- Gate 3 human approval is required before either strategy starts and may explicitly choose eligible `swarm`.
- Beads and reservations are optional swarm projections. `work-graph.json` remains the plan authority and `execution-state.json` remains the completion authority.

## Canonical Files

```text
.pulse/active-run
history/<feature>/
  request.md
  run.json
  stages/
    01_explore/output/decisions.md
    02_plan/output/plan.md
    02_plan/output/work-graph.json
    03_validate/output/validation.json
    04_execute/output/execution-state.json
    04_execute/output/execution-report.md
    04_execute/output/verification/
    05_review/output/review.json
    05_review/output/uat.md
    06_compound/output/compounding.md
```

Legacy files remain readable and executable only through frozen legacy contracts. Never rewrite them into v2 automatically.

## Critical Rules

1. Never execute before Gate 3 approval.
2. Route v2 strictly from `run.json.current_stage`; do not infer a next skill from stale mirrors.
3. Load only the current stage contract, its Inputs, and minimal project references.
4. Do not mutate `work-graph.json` after Gate 2; execution progress belongs in `execution-state.json`.
5. Do not invoke preflight, onboarding, swarming, or legacy migration automatically.
6. Preserve dirty worktrees and declare exact file scopes before editing.
7. P1 findings block Gate 4.
8. Root-owned review is the v2 default; specialist agents require an explicit operator request.
9. Behavioral changes use scenario-first BDD: define expected behavior, edge cases, and failure behavior before implementation.

## Session Finish

1. Leave current stage outputs and `run.json` coherent.
2. If pausing v2 work, write a stage-local handoff and record its path in `run.json.resume_path`.
3. If pausing legacy work, use the frozen owner-scoped handoff contract.
4. Report blockers, stale approvals, remaining graph nodes, and the next explicit human decision.
<!-- PULSE:END -->
