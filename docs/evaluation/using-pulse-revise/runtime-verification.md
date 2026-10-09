# using-pulse lifecycle runtime verification

Verified on 2026-10-09 in the isolated `codex/using-pulse-revise-20261008`
worktree, based on `e65801777affde36117e063b7ac8e8b9b3211e7c`.

## Delivered capability

The existing ICM helper now exposes:

```bash
node workflow/scripts/pulse_icm.mjs revise --repo-root REPO --stage 04_execute --nodes A --reason "Correction found in review"
node workflow/scripts/pulse_icm.mjs revise --repo-root REPO --recover REVISION_ID
node workflow/scripts/pulse_icm.mjs init --repo-root REPO --feature next-run --request "Next iteration" --from-run history/previous-run/run.json
```

Revision retains valid upstream gates, resets affected downstream gates,
preserves prior evidence and reopens only the selected graph nodes and
their dependent closure. Earlier intent/plan changes retire old execution
state; feasibility revalidation with the same approved graph retains its
completion. Blocked/in-progress work must be settled first.

Prepared revision metadata blocks advancement. Recovery is explicit and
bound to the archived preimage/after-image. A live writer or changed
evidence blocks recovery. All updated helper mutators share an exclusive
owner lock. A successor gets fresh gates and a parent path/hash; an
unfinished active run cannot be replaced.

Status includes resume/revision/parent context. Stage advancement clears
the previous handoff pointer while keeping revision history. Execution
completion requires exact graph/state membership, not merely complete
values for whichever keys happen to be present.

## Compatibility and proof

Ordinary runs remain schema 2.0. Continuity metadata opts into 2.1, accepted
by the updated reader and rejected by the preserved old helper.
The six-stage workflow, four gates, dependencies and generated skill
bodies are unchanged.

- Final caller/package suite: **136 PASS, 0 FAIL, 0 cancelled, 0 skipped**.
- Strict source evaluation: **27 PASS, 0 WARN, 0 FAIL**.
- Workflow generator check and `git diff --check`: pass.
- Extracted-package smoke: nine checks passed, including CLI revision,
  closure, old-helper refusal without mutation, explicit-parent successor,
  unchanged parent bytes, fresh gates and repo-local onboarding.
- The extracted and source helper bytes match SHA-256
  `1d013bbc16fa0110852b8c1cec8979ed3932de58e4299cd4944d701533f3e230`.

Evidence is kept under the run's
`history/using-pulse-revise/stages/04_execute/output/verification/`:
`checks.json`, `final-tests.tap`, `static-evaluation.json`,
`package-smoke.json`, its reproducible driver, and the untouched baseline.
These are local runtime/CLI/package proofs, not model-behavior certification.

## Review corrections

Three new negative controls failed before their fixes and now pass:
an external run edit between snapshot and publication, an active-pointer
edit during successor creation, and a stale handoff after stage advancement.
The original missing-node completion defect also has a failing pre-change
probe and a passing regression test.

GitNexus reports target-not-found/UNKNOWN for the lifecycle symbols.
Direct callers were inventoried and exercised: status, onboarding,
creative-session ownership, primitive fixtures and package consumers.
No zero-impact or complete-graph claim is made.

## Limits and disposition

A crash before canonical revision preparation can leave an owner lock or
unselected snapshot that requires explicit owner inspection. A refused
successor can leave an unselected new run; it is preserved and not
automatically deleted or retried. The recovery command applies to a bound
prepared revision.

Unchanged skill guidance has not been measured choosing these new
operations in a live model turn. Qualified BASELINE/RETEST guidance work
remains a separate follow-up; evaluator policy and providers were not
changed. Tests dispatched no model replay.

This is a local runtime candidate awaiting Gate 4. The canonical source
checkout and global installed plugin have not been updated. No commit
or push was performed.

## Subsequent usable release — 4.1.0

The candidate status above describes the original runtime snapshot. Runtime commit `1ae69ba` was subsequently approved, committed, pushed and installed. Release 4.1.0 reconciles that runtime with recovered installed source `f98b6f6`, documents revise/recovery in generated skills and managed instructions, and restores the complete package. See [the successor guidance evidence](CREATION-LOG.md); final installation and Git receipts live in `history/pulse-source-install-reconcile/`.
