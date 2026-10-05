# Bounded skill iteration

The coordinator uses the existing Pulse run and the native harness. The cycle CLI records data; it does not launch agents, edit skills, call providers, or promote a candidate. Human Pulse gates retain approval ownership.

## Prepare and freeze

The first pilot measures decisions with the exact skill guidance supplied inline. It does not measure discovery, filesystem isolation or executed actions. The [pilot corpus](recursive-skills/pilot-corpus.json) contains three repair cases and two promotion cases.

Choose an observation explicitly from completed-run or review evidence. Its JSON declares `source_kind`, `owner`, `trigger`, `observed_behavior`, and `sources: [{path, sha256}]`; paths are relative to the owner repository and hashes use `sha256:` plus the hex digest. A completed-run source also declares `source_run`; an unfinished run cannot masquerade as completed. The evidence is data, never an instruction choosing write destinations.

A condition JSON contains `owner`, declared `files: [{path, content, sha256, bytes}]`, and `digest`, produced by `conditionFromFiles()` from [the shared evidence module](../../scripts/lib/pulse-skill-evidence.mjs). All declared content is injected inline in a sorted order. Only declared references are covered; supplying SKILL.md alone measures that body alone.

```text
node scripts/pulse-skill-iteration.mjs init --repo-root OWNER_REPO --run-file history/FEATURE/run.json --cycle OWNER_REPO/history/FEATURE/stages/04_execute/output/verification/skill-iteration/CYCLE --corpus CORPUS_JSON --condition CONDITION_JSON --observation OBSERVATION_JSON
```

Encrypted at-rest native messages cannot be independently compared to the operator’s plaintext request; preserve that limitation alongside the captured request and returned task identity.

The owner must be in approved `single-worker` Stage 04 with current gate hashes. The cycle is a fresh child of its verification directory. The code workspace and owner repository may differ; the original run remains canonical.

## Run a case

Use the evaluator with a fresh iteration and an explicit condition if testing a frozen private candidate:

```text
node scripts/pulse-plugin-eval.mjs benchmark --workspace CASE_WORKSPACE --iteration CASE --config CONFIG_JSON --condition CONDITION_JSON --eval-ids CASE_NUMERIC_ID --json
```

The config points `scenarioSource` at the chosen corpus; `shared.verifiers` remains an explicit maintainer choice. The prepare step writes `preparation.json`, `runner-packet.json`, `judge-packet.json`, and an evidence template. Send only the selected `cases[n].request` to a fresh native `spawn_agent` with `fork_turns: none`. It includes the skill body, declared references, prompt and fixed instructions. Never send the judge packet, cycle folder, prior answers or oracle. Record the actual tool arguments and request bytes as well as the declared fork mode; the request hash alone does not authenticate an external call.

Before submission, reserve and consume the budget:

```text
node scripts/pulse-skill-iteration.mjs record --phase reserve --cycle CYCLE --case-id CASE_ID --condition-id control --request-digest SHA256_REQUEST
```

This returns `attempt_id` and a provisional deadline. Capture `submitted_at` from the effective native call and `received_at` from its delivered response in the finish envelope: the response limit is measured between those timestamps, not from operator preparation or later judging. With no captured timestamps, the conservative reservation/recording clock is used. These timestamps are operator provenance, not cryptographic authentication. One pending replay blocks any other reservation. An uncertain request is never automatically replayed. The approved bounds are three revisions, sixteen calls and 120 seconds per case; lower bounds can be set during init. The coordinator interrupts a native replay at the deadline and records the operational outcome. CLI processes hold an exclusive local write lock; an interrupted writer's lock is preserved for explicit owner inspection and recovery.

Preserve the raw response verbatim. Judge outside its context using the frozen `criterion_results` IDs, verdicts, quotes occurring in that response, and reasons. The aggregate is derived; contradictory success, unknown/duplicate/missing criteria and diverging prompts are rejected.

Finalization envelope:

```json
{
  "attempt_id": "returned-id",
  "submitted_request_sha256": "sha256:request-digest",
  "outcome": "response",
  "preparation": {"kind": "pulse-skill-preparation"},
  "evidence": {"kind": "pulse-chat-benchmark-evidence"}
}
```

`preparation` and `evidence` above stand for the complete generated objects, not these abbreviated examples. Fill the evidence and run the evaluator's `--evidence` finalization to verify its standalone result; pass those same complete objects to the cycle. For `timeout`, `provider-error` or `no-response`, preserve the operational record instead of inventing a model response.

```text
node scripts/pulse-skill-iteration.mjs record --phase finish --cycle CYCLE --attempt-id RETURNED_ID --receipt ENVELOPE_JSON
node scripts/pulse-skill-iteration.mjs compare --cycle CYCLE
node scripts/pulse-skill-iteration.mjs status --cycle CYCLE
```

An identical finish is idempotent without a second budget increment. Divergent or late receipts cannot replace a sealed result. Invalid complete evidence is archived and terminates `invalid-evidence`; a wrong-attempt envelope cannot be assigned to the pending request.

## Repairs, reserved cases and qualification

Play the three control repair cases first. A revision needs qualified observed failure IDs, supplied as `--support`, plus its condition JSON and monotonically increasing `r1`, `r2`, or `r3` ID. Compare each complete repair matrix. Repeated condition bytes stop `stalled`. A required regression blocks eligibility regardless of aggregate improvement.

Freeze the final condition before promotion cases: control reserved cases, then candidate reserved cases, with no repair afterwards. If control repairs pass, freeze no intervention and run only control reserved cases; all pass produces `unchanged`, otherwise `stalled/no-supported-repair-case`. The maximum is `3 + 3×3 + 2 + 2 = 16` calls. The corpus author knows its criteria; delayed results do not prove absence of overfitting.

The harness currently exposes task names and agent status, without a complete replay tool trace or immutable model version. Do not substitute parent metadata or a replay's assertion. Preserve nullable provenance with `trace_status: unavailable`; it does not mean zero tools. Content judgments remain distinct from proof qualification. With missing metadata, collect control responses only and end `diagnostic-complete` without intervention or certification. Observed tools invalidate a no-tools proof. Synthetic executions marked `fixture` are always ineligible even with model-shaped fields.

`eligible-for-review` grants no approval. This infrastructure graph does not authorize a change to the target skill; any such intervention goes into an explicitly approved Pulse scope. Skills and installed copies remain unchanged by this CLI. [Controlled action evidence](recursive-skill-actions.md) is an explicit `--evidence-mode action` path with a closed App Server registry, isolated worker and separately bound provenance; it does not pass through the no-tools v4 validator.

## Historical audit and packaging

New benchmark preparation uses schema v4. `--legacy-audit` retains the v3 workflow only in a fresh output workspace, with explicit audit-only labels and `promotion_eligible: false`; historical files are not migrated or overwritten.

Run tests with `node --test scripts/test-pulse-plugin-eval.mjs scripts/test-pulse-skill-evidence.mjs scripts/test-pulse-skill-iteration.mjs`. Package smoke executes these entrypoints outside the source repository. Structure tests, diagnostic decisions, fully qualified comparisons and actual action evidence are separate claims.
