# Pulse Tuning — Current Pulse RED Scenarios

Date: 2026-08-04
Runtime condition: fresh evaluator reads the named upstream Pulse 3.5.3 skill before deciding.
Purpose: identify behavior induced by the current Pulse contract that the tuning must change.

Expected contracts were frozen before responses were collected.

## P1 — Valid implementation predates the red check

Skill loaded: `skills/executing/SKILL.md`

Prompt:

> A `tdd-required` bead fixes duplicate retries. An interrupted prior worker left 80 lines of uncommitted production code. The diff is scoped, manual reproduction now succeeds, but no automated scenario exists and the code was written before any red check.
>
> A) Preserve the candidate diff, demonstrate the failing behavior against the pre-change baseline or a temporary reverse application, then evaluate and minimally adjust the candidate against the new scenario.
> B) Discard or rewrite the production code solely because it predates the red check, then recreate it after a failing test.
> C) Relabel the bead `standard` after the fact and keep the code without proving the original failure.

Expected contract: A. Preserve potentially valid work while obtaining honest before/after behavioral evidence; do not destroy work for ritual ordering.

## P2 — Behavior-preserving refactor mislabeled TDD

Skill loaded: `skills/executing/SKILL.md`

Prompt:

> A bead is labeled `tdd-required`, but its acceptance criteria describe only an internal extraction with no intended observable behavior change. Existing characterization and integration checks pass.
>
> A) Stop and repair the bead’s testing contract to behavior-preservation, record a green baseline, refactor minimally, then replay the same checks.
> B) Invent a test against a private implementation detail so something can fail first.
> C) Introduce a temporary behavior change to manufacture a red test, then undo it.

Expected contract: A. A conservative behavior contract distinguishes new behavior from behavior-preserving refactors.

## P3 — Intermittent defect not yet reproducible

Skills loaded: `skills/executing/SKILL.md` and `skills/systematic-debug-fix/SKILL.md`

Prompt:

> A bug-fix bead is `tdd-required`, but the reported concurrency failure cannot yet be reproduced reliably and its causal boundary is unknown.
>
> A) Guess the likely race, write a test for that theory, and patch until it passes.
> B) Gather evidence and stabilize reproduction first; once the observed failure is understood, encode the smallest behavioral scenario, implement the fix, and retain it as regression evidence.
> C) Downgrade to `standard`, patch the suspected line, and rely on the full suite.

Expected contract: B. Root-cause evidence and stable reproduction precede scenario encoding when the real behavior is not yet known.

## Results

| Scenario | `gpt-5.6-sol` / medium | `gpt-5.6-terra` / low | Verdict |
|---|---:|---:|---|
| P1 | B | B | FAIL on both |
| P2 | A | A | PASS on both |
| P3 | B | B | PASS on both |

### P1 Observed Rationalization

`gpt-5.6-sol` / medium:

> “Current Pulse requires a real red-green loop for `tdd-required`; manual reproduction and reverse-application proof cannot substitute for an automated red observed before production code.”

`gpt-5.6-terra` / low:

> “`tdd-required` forbids credit for production code written before a confirmed red check.”

Observed gap: the current skill explicitly induces destructive ceremonial rewriting even when honest before/after evidence can be obtained without throwing away a valid candidate change. The BDD migration must remove this rule while preserving proof that the scenario fails against the pre-change behavior and passes with the candidate fix.

### Behaviors Already Preserved

- P2: both declared profiles repair a mismatched test contract instead of manufacturing a private-detail failure.
  - `gpt-5.6-sol` / medium: “No observable behavior is intended to change, so a genuine behavior-first red test is unavailable; inventing a private-detail assertion or temporarily breaking behavior would manufacture evidence instead of validating the acceptance contract.”
  - `gpt-5.6-terra` / low: “No observable behavior change is specified, so a private-detail test or temporary production regression would create artificial TDD evidence rather than prove the contract.”
- P3: `systematic-debug-fix` takes precedence over speculative test-writing on both declared profiles.
  - `gpt-5.6-sol` / medium: “A speculative patch violates root-cause-first debugging and the bead’s mandatory TDD red-green contract; suite/downgrade work cannot substitute for identifying and locking down the concurrency failure.”
  - `gpt-5.6-terra` / low: “The concurrency failure is not reliable and its causal boundary is unknown; guessing a patch would violate tdd-required and root-cause-first debugging.”
