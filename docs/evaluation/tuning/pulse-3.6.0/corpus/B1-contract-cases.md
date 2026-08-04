# B1 Frozen Contract Cases

Frozen: 2026-08-04, before the B1 skill intervention
Purpose: verify that planning, validating, and executing apply one conservative behavior contract, including malformed and legacy inputs.

## Replay Protocol

For each declared profile, start a fresh agent with only:

1. the post-intervention six B1 skill/reference files;
2. the cases below;
3. this output format:

```text
CASE: C<n>
DECISION: ACCEPT | REJECT | ROUTE
TARGET: change | preserve | investigate | planning-repair
RATIONALE: <one sentence grounded in the loaded guidance>
```

Declared profiles:

- `gpt-5.6-sol` / reasoning `medium`;
- `gpt-5.6-terra` / reasoning `low`.

Record complete responses and verdicts in `history/pulse-tuning/verification/B1.md`. A case passes only when decision and target match the frozen expectation. Do not rewrite cases after observing responses.

## Cases

### C1 — Reproducible behavior change

A bead names an observable duplicate-retry scenario. Its baseline proves the pre-change duplicate, its retest proves one delivery, and it lists relevant regression checks.

Expected: `ACCEPT`, target `change`.

### C2 — Candidate predates scenario

A scoped candidate fix already exists, but a clean pre-change checkout or temporary reverse application can still prove the original failure before replaying the candidate.

Expected: `ACCEPT`, target `change`; preserve the candidate.

### C3 — Change with green-only evidence

A bead says `behavior_mode: change`, but supplies only a passing current-state command and no pre-change failure or absence proof.

Expected: `REJECT`, target `planning-repair`.

### C4 — Behavior-preserving refactor

A bead names observable characterization checks, records them green, performs an internal extraction, and replays the same checks.

Expected: `ACCEPT`, target `preserve`.

### C5 — Preserve mode changes the outcome

A bead says `preserve`, but its retest intentionally expects a new API response different from the baseline.

Expected: `REJECT`, target `change` after planning repair.

### C6 — Unstable defect investigation

A bead cannot reliably reproduce a concurrency report. It scopes only instrumentation/evidence work and provides concrete reproduce and boundary-trace steps.

Expected: `ACCEPT`, target `investigate`.

### C7 — Investigation edits production behavior

A bead says `investigate` but includes a speculative production patch before the report is stable.

Expected: `REJECT`, target `planning-repair` before any production behavior change.

### C8 — Ambiguous legacy standard

A legacy bead contains `testing_mode: standard` with no observable behavior class.

Expected: `REJECT`, target `planning-repair`.

### C9 — Truthful legacy red/green commands

A legacy bead contains `testing_mode: tdd-required`; its red command truthfully demonstrates the intended pre-change behavior failure and its green command proves the intended outcome.

Expected: `ROUTE`, target `change`, only after explicit field migration.

### C10 — Ceremonial legacy failure

A legacy bead contains `testing_mode: tdd-required`, but its red command fails on an unrelated stub and does not demonstrate the intended behavior.

Expected: `REJECT`, target `planning-repair`.

## Aggregate Pass Condition

Both profiles must return the expected decision and target for C1-C10. Any mismatch blocks B1 completion and is diagnosed against the smallest missing or harmful guidance before retest.
