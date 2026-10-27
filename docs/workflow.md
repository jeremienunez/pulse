# Working with Pulse

Every new or resumed project task starts with `pulse:using-pulse`. The router resolves the repository's active run and loads the current stage contract. Keep the artifacts proportionate: a small task can have short decisions, one graph node and a focused verification step.

## Follow one run

| Stage | Main output | Exit condition |
| --- | --- | --- |
| `01_explore` | `decisions.md` | Gate 1 approves outcome, boundaries and decisions |
| `02_plan` | `plan.md`, `work-graph.json` | Gate 2 approves the implementation plan and graph |
| `03_validate` | `validation.json` | Gate 3 approves validated execution and strategy |
| `04_execute` | `execution-state.json`, `execution-report.md`, verification files | All graph nodes complete and required outputs present |
| `05_review` | `review.json`, `uat.md` | Gate 4 approves merge with no open P1 findings |
| `06_compound` | `compounding.md`, justified durable learnings | Complete the run |

The agent presents the actual artifacts at each gate. A recommendation, generated file or passing test is evidence for approval; human approval is still required. Gate 4 records workflow approval for merge. It does not run Git merge, commit, push or installation commands.

Brainstorming can clarify an uncertain product direction before exploration. `pulse:preflight` is an explicit diagnostic outside the delivery graph. Swarming is a strategy inside Stage 04.

## Know where state lives

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

`.pulse/active-run` points to `run.json`, which owns the current stage, gate hashes, approved strategy and optional resume path. `work-graph.json` owns the approved plan; node completion belongs in `execution-state.json`. Project architecture guides and conventions remain separate from feature history.

In this source repository, `.pulse/` and `history/` are ignored local runtime state. A downstream project decides how it retains its delivery evidence; do not assume these files are automatically committed or shared.

## Inspect before resuming

When onboarding has installed the read-only scout in the target repository:

```bash
node .pulse/scripts/pulse_status.mjs --json
```

Otherwise, resolve the installed Pulse root from the loaded skill and call its helper. Replace both paths with the actual locations:

```bash
node /path/to/pulse/workflow/scripts/pulse_icm.mjs status --repo-root /path/to/project
```

| Runtime result | Action |
| --- | --- |
| `icm-v2` | Read the current stage, its declared inputs and any recorded handoff |
| `legacy-v1` | Use the frozen legacy contract for the selected existing work |
| `none` | Let the router initialize a new feature run |
| `conflict` | Stop and resolve the conflicting active surfaces without rewriting either |

A blocked v2 status can identify stale gates or a prepared revision. Read the reason before changing state. Resume matching work; do not reuse an unrelated active run merely because it is present.

## Choose execution deliberately

The graph analyzer recommends **single-worker for every valid graph**. Swarm eligibility is a separate result:

- One weakly connected component is ineligible.
- At least two components with disjoint file scopes are eligible, capped at four workers.
- Cross-component file overlap makes the graph ineligible.

Gate 3 records the human-selected strategy. Eligible work can still stay single-worker. Beads and reservations are coordination adapters for approved swarm execution; they do not replace the graph or completion state.

Review is owned by the root agent by default. Specialist agents require an explicit operator request.

## Understand gate hashes

Approval binds SHA-256 hashes of the relevant artifacts. Changing approved content makes its approval stale. Helpers check prior approvals before downstream transitions and mutations; they cannot determine whether a weak test proves a product works.

Fix stale approvals through a recorded revision of the owning stage and the required reapprovals. Do not edit lifecycle JSON to force a stage transition.

## Correct completed work

Use the earliest stage whose approved content must change:

| Revision target | Retained approvals | Reset approvals |
| --- | --- | --- |
| `01_explore`: outcome or decisions | — | G1, G2, G3, G4 |
| `02_plan`: scope or graph | G1 | G2, G3, G4 |
| `03_validate`: feasibility or strategy | G1, G2 | G3, G4 |
| `04_execute`: repair within approved scope | G1, G2, G3 | G4 |
| `05_review`: review evidence only | G1, G2, G3 | G4 |

For example, after the correction is requested, an in-scope execution repair names the affected approved node IDs:

```bash
node /path/to/pulse/workflow/scripts/pulse_icm.mjs revise \
  --repo-root /path/to/project \
  --stage 04_execute \
  --nodes csv-export \
  --reason 'Correct escaping within the approved CSV export scope'
```

The helper archives superseded outputs with hashes and reopens affected nodes and their dependents. Independent completed nodes remain complete. Changes to scope or graph return to planning. Re-run verification and review after the repair.

If a revision is interrupted, status can report `revision_prepared`. Use the exact 64-character revision ID from its manifest with `revise --recover <revision-id>`. Recovery checks file bindings and ownership; do not force it past a live owner or mismatched files. See the [router contract](../workflow/CONTEXT.md) for the complete procedure.

A completed run stays immutable. A new task building on it uses a distinct run with `init --from-run history/<parent>/run.json` and fresh approvals. A completed active run is also the default parent for initialization.

## Report evidence at its actual level

The execution report names the checks actually run and links their results. Review assesses the current diff and relevant behavior. `uat.md` records human acceptance instructions and the observed outcome, including anything still unverified. An open P1 finding blocks Gate 4.

After approval, compounding captures reusable, evidence-backed learnings. Feature-specific detail stays in the run. Tests, package construction, native runtime behavior and external effects are separate proofs; see [reading evaluation results](evaluation/how-to-read-results.md).
