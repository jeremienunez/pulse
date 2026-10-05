# How to Read Pulse Evaluation Results

See [the evaluator runbook](pulse-plugin-eval.md) for commands and [bounded skill iteration](recursive-skills.md) for native coordination. Pulse lifecycle ownership remains in [the architecture](../ARCHITECTURE.md).

## Three different results

1. Structural checks show that evidence and its files are coherent.
2. `content_verdict` describes a judged response against frozen criteria.
3. `qualification_status` states whether the response has sufficient profile/trace provenance for its claimed measurement layer.

A passing response with diagnostic or invalid qualification is not a certified behavioral pass. `promotion_eligible` is an eligibility calculation, never human approval or deployment. Fixtures are always ineligible.

## Artifacts and counts

Preparation creates a blind runner packet, separate judge packet, private manifest and evidence template. It is not a model result. Finalization preserves the full response, criteria, exact submitted-request/condition bindings, profile, provenance and reasons in JSON. Divergent evidence fields are rejected, not replaced by canonical fields in a way that hides the divergence.

In v4 `run_summary.passed` and `failed` are content counts. `qualified_passed` counts only complete proofs; `diagnostic` is separate and `pass_rate` is null for unqualified results. Read every qualifier alongside the numbers. The compact Markdown/HTML states content and qualification; the JSON is the full evidence record.

A `PASS` check means that check's contract held. `WARN` can mean an intentionally diagnostic run; `FAIL` can be structure, a verifier or a content miss. `--strict` makes warnings fail process exit. Do not equate any process code with end-to-end model or action proof.

## Native limits

The current harness returns task names/status but no full replay trace or immutable model version. Preserve `trace_status: unavailable` and missing profile values; do not infer them from the parent or an old run. Decisions with inline guidance do not prove automatic skill loading, physical sandboxing or executed side effects.

The cycle records a request before submission. Identical finalization is idempotent; an uncertain request is not automatically replayed. Operational failure, invalid evidence, budget exhaustion and stagnation are distinct. Missing provenance permits a diagnostic control collection, then `diagnostic-complete` with no intervention.

## Comparisons and promotion cases

Repair cases run first. Final condition bytes freeze before promotion cases are played on control/candidate, with no repair afterwards. A required regression blocks eligibility even when the aggregate is better. The corpus author knows the criteria; delayed promotion results do not prove generalization or absence of overfitting.

## History and reporting

Historical v3 outputs remain archival. `--legacy-audit` can create a separate audit-only view and cannot authorize a new promotion. The old fixed version certificate retains its own corpus, profiles, provenance and limits.

Publish the corpus IDs, condition/request digests, actual profile/source, execution kind, full response/judge evidence, content counts and qualification, phase/status, missing metadata and verification coverage. Separate structural/unit/package checks, native diagnostic decisions, fully qualified comparisons and actual action UAT. Never convert a prepared template or synthetic test response into an executed model result.
