# Pulse 4 ICM Evaluation Log

## Evaluation Contract

- Behavior: route new and legacy Pulse work through an interpretable six-stage filesystem workflow, with preflight manual and graph connectivity recommending execution strategy at Gate 3.
- Scenario set: `docs/evaluation/pulse-4-icm/scenarios.json` (`pulse-4-icm-v1`).
- Profile: `gpt-5.6-sol`, high reasoning, Codex CLI `0.149.1`, ephemeral read-only control workspace.
- Oracle and prompts were frozen before the baseline responses.
- The evaluator received an isolated copy of current Pulse guidance and could not see the oracle or prior results.
- Pre-existing user and candidate work was preserved; `/tmp/pulse-4-preimplementation-working-tree.patch` captures the complete pre-intervention diff.

## Baseline

| Scenario | Expected | Choice | Verdict | Rationalization |
|---|---:|---:|---|---|
| ICM-01 | B | B | PASS | "Missing `.pulse` readiness artifacts do not block startup, and preflight was not requested." |
| ICM-02 | B | B | PASS | "Because the approved work graph is one weakly connected component, non-overlapping ready tasks do not justify swarm execution." |
| ICM-03 | B | A | FAIL | "Swarm requires an affirmative preflight result... With no preflight result, the baseline-control fallback is single-worker." |
| ICM-04 | B | B | PASS | "An active legacy handoff must be completed through its compatibility contract." |
| ICM-05 | B | B | PASS | "A post-approval edit breaks that approval binding; preflight can refresh readiness but cannot preserve approval for changed content." |

### Full baseline responses

#### ICM-01

```json
{"choice":"B","action":"Invoke `pulse:using-pulse`, do not run `pulse:preflight`, and inspect only the files and context required by the stage it selects for the new feature.","rationalization":"Missing `.pulse` readiness artifacts do not block startup, and preflight was not requested. Stage-local inspection is the appropriate short-window path."}
```

#### ICM-02

```json
{"choice":"B","action":"Recommend a single worker for Gate 3 and queue the two ready tasks for sequential execution.","rationalization":"The declared rule uses simple component connectivity. Because the approved work graph is one weakly connected component, non-overlapping ready tasks do not justify swarm execution."}
```

#### ICM-03

```json
{"choice":"A","action":"Force single-worker mode at Gate 3. I will not spawn workers; I will execute the ready nodes sequentially using the existing scheduler order.","rationalization":"Swarm requires an affirmative preflight result. Graph independence and disjoint file scopes are eligibility evidence, not authorization. With no preflight result, the baseline-control fallback is single-worker."}
```

#### ICM-04

```json
{"choice":"B","action":"Resume the unfinished approved work slice through the frozen legacy contract, using `.pulse/state.json` as the authoritative handoff. Leave legacy history unchanged and do not create a v2 active-run pointer.","rationalization":"An active legacy handoff must be completed through its compatibility contract. Migrating history or starting a duplicate v2 run would break continuity and provenance."}
```

#### ICM-05

```json
{"choice":"B","action":"Block downstream routing immediately, mark the Gate 2 approval stale, and require reapproval of the edited plan and its work graph before execution resumes.","rationalization":"Gate 2 approved specific artifact versions. A post-approval edit breaks that approval binding; preflight can refresh readiness but cannot preserve approval for changed content."}
```

## Intervention Target

Only ICM-03 authorizes new routing guidance: a valid disconnected, file-disjoint graph may recommend swarm at Gate 3 without a preflight result, but worker launch still requires explicit Gate 3 human approval. ICM-01, ICM-02, ICM-04, and ICM-05 are regression constraints.

## Intervention

- Added the six-stage ICM workflow and generated lean skill adapters.
- Added a deterministic work-graph analyzer using weakly connected components and exact file-scope overlap.
- Moved execution-strategy authority from preflight to Gate 3 validation while retaining human launch approval.
- Preserved the complete prior skill contracts as frozen legacy references.
- Added content-hashed gates so approved artifact edits become mechanically stale.

The intervention does not claim that connectivity is a universal parallelization metric. It is the deliberately conservative rule selected for Pulse 4: disconnected and file-disjoint components may recommend swarm; all other valid graphs recommend single-worker.

## Retest

Identical scenario set and oracle; `gpt-5.6-sol`, high reasoning, Codex CLI `0.149.1`, ephemeral read-only control workspace.

| Scenario | Baseline | Retest | Regression |
|---|---:|---:|---|
| ICM-01 | PASS (B) | PASS (B) | No |
| ICM-02 | PASS (B) | PASS (B) | No |
| ICM-03 | FAIL (A) | PASS (B) | Target closed |
| ICM-04 | PASS (B) | PASS (B) | No |
| ICM-05 | PASS (B) | PASS (B) | No |

### Full retest responses

#### ICM-01

```json
{"choice":"B","action":"Start through `pulse:using-pulse`, select the new-feature stage, and inspect only that stage’s required inputs.","rationalization":"Preflight is not automatic when Pulse starts. Since the user did not request it, the short window and missing readiness artifacts do not justify running preflight or blocking startup."}
```

#### ICM-02

```json
{"choice":"B","action":"Enter Gate 3 in single-worker mode and execute the two ready tasks sequentially with that worker.","rationalization":"The approved graph is one weakly connected component, and component connectivity—not the number of ready, non-overlapping tasks—is the declared execution-mode decision rule."}
```

#### ICM-03

```json
{"choice":"B","action":"Recommend a two-worker swarm at Gate 3, mapped one worker per disconnected component, and wait for explicit human approval before spawning either worker.","rationalization":"The graph’s ready, file-disjoint components justify recommending swarm, but graph independence is not authorization to spawn. The missing preflight result does not itself force single-worker execution."}
```

#### ICM-04

```json
{"choice":"B","action":"Resume the unfinished approved slice directly from `.pulse/state.json` through the frozen legacy handoff contract. Preserve the legacy history unchanged and do not create a v2 active-run pointer.","rationalization":"The existing handoff is authoritative. Converting history risks altering it, while starting a new v2 run would duplicate the same feature and abandon approved in-progress work."}
```

#### ICM-05

```json
{"choice":"B","action":"Block all downstream execution and routing immediately. Mark the Gate 2 approval stale and require reapproval of the edited plan and its work graph before resuming.","rationalization":"Gate 2 approved a specific artifact state. Editing the plan afterward invalidates that approval; preflight can assess readiness but cannot preserve or renew authorization."}
```

## Deployment Decision

- Targeted failure passes: yes.
- Previously passing required cases remain passing: yes.
- Exact profile completed the frozen corpus: yes.
- Scenario text and oracle unchanged: yes.
- Full responses recorded: yes.

Decision: eligible for static, runtime, package, and installed-payload certification.

## Final Outcome

- Exact-profile behavioral replay: 5/5 PASS; targeted baseline failure closed with no regression.
- ICM, workflow-generation, and distribution tests: 14 PASS.
- Legacy onboarding, status, handoff, checkpoint, dependency, and no-hook tests: 32 PASS.
- Version tooling tests: 5 PASS.
- Evaluator evidence-integrity tests: 13 PASS.
- Skill validation: 22/22 valid.
- Strict source evaluator: 28 PASS, 0 WARN, 0 FAIL.
- Strict isolated-distribution evaluator: 28 PASS, 0 WARN, 0 FAIL.
- Plugin validator: source, isolated distribution, personal source, and installed cache PASS.
- Installed runtime canary: created a v2 run, routed `01_explore` to `pulse:exploring`, and wrote no legacy mirrors.
- Installed payload: `pulse@personal`, base version `4.0.0` with one local Codex cachebuster, enabled.
- Personal source and installed cache compare byte-for-byte after the cachebuster.
- Installed MCP inventory: `gitnexus`, `MCP_DOCKER`, `morph-mcp`.
- Packaged lifecycle hooks: none.
- GitNexus aggregate diff risk: CRITICAL because the core workflow contract changes 34 flows; targeted runtime seams and all declared regressions are covered by the evidence above.

Deployment decision: DEPLOYED LOCALLY. A fresh Codex thread/app reload is still required to prove skill discovery and live MCP loading; the app was not restarted automatically.
