# Creation Log: [Skill Name]

<!-- Copy this template to the skill directory as CREATION-LOG.md when preparing deployment evidence. -->
<!-- Freeze scenarios and verdict rules before recording model responses. -->

## Table of Contents

1. [Source Material](#source-material)
2. [Extraction Decisions](#extraction-decisions)
3. [Evaluation Contract](#evaluation-contract)
4. [BASELINE](#baseline)
5. [INTERVENTION](#intervention)
6. [RETEST](#retest)
7. [Evidence-Backed Iterations](#evidence-backed-iterations)
8. [Final Outcome](#final-outcome)

## Source Material

**Origin:** [framework, repository, internal technique, or other source]

**Source version/commit:** [exact version, tag, or commit]

**What the source does:** [core behavior in 1–3 sentences]

**Pulse context:** [which Pulse skill or workflow position this supports]

**Claim boundary:** [what provenance supports and what local Pulse evidence must establish separately]

## Extraction Decisions

**Included:**

- [item] — because [observed failure, critical invariant, or required integration]
- [item] — because [reason]

**Excluded:**

- [item] — because [already passes, duplicates an owner, is project-specific, or lacks evidence]
- [item] — because [reason]

## Evaluation Contract

**Behavior being evaluated:** [observable decision/action]

**Frozen scenario set/version:** [path, ID, or commit]

**Oracle frozen before responses:** YES / NO

**Profiles declared for this deployment:**

| Model | Version | Reasoning profile | Harness/runtime |
|---|---|---|---|
| [model] | [version] | [setting] | [identifier] |
| [model] | [version] | [setting] | [identifier] |

**Candidate state before BASELINE:** none / already exists

**Controlled comparison when candidate already exists:** [clean tag/worktree, control copy, temporary reverse application, or equivalent]

**User/unrelated state preservation:** [how existing work was protected]

**Evidence completeness rule:** Every completed case includes exact profile, prompt, full response, choice/action, rationalization, verdict, and pre-frozen verdict rule.

## BASELINE

<!-- Run without the proposed local intervention, or use the documented controlled pre-change view. -->

### Scenario 1: [Frozen ID and name]

**Full prompt:**

```text
[Exact frozen scenario text]
```

**Expected behavior and verdict rule (frozen before response):** [rule]

#### Profile: [exact model/version/reasoning]

**Agent choice:** [A/B/C or explicit action]

**Concrete action:** [what it said it would do]

**Exact rationalization:**

> [verbatim text]

**Full response:** [verbatim response or evidence path]

**Verdict:** PASS / FAIL / INVALID

#### Profile: [exact model/version/reasoning]

**Agent choice:** [choice]

**Concrete action:** [action]

**Exact rationalization:**

> [verbatim text]

**Full response:** [verbatim response or evidence path]

**Verdict:** PASS / FAIL / INVALID

### Scenario 2: [Frozen ID and name]

[Repeat the same per-profile fields.]

### BASELINE Summary

| Scenario | Profile | Verdict | Observed rationalization | Decision |
|---|---|---|---|---|
| [ID] | [exact tuple] | PASS | [short exact excerpt] | no intervention; retain regression case |
| [ID] | [exact tuple] | FAIL | [short exact excerpt] | eligible for minimal intervention |

**Passing behaviors that receive no new guidance:**

- [behavior] — [profiles/cases that already pass]

**Failures eligible for intervention:**

1. [case/profile] — [exact violation and rationalization]

## INTERVENTION

Map every content change to recorded evidence.

| Changed file/section | Baseline case/profile | Exact rationalization addressed | Smallest change | Why no broader change |
|---|---|---|---|---|
| [path/section] | [ID + tuple] | [verbatim excerpt] | [change] | [scope defense] |

**Unsupported ideas deliberately not added:**

- [idea] — [no observed failure, already passes, duplicates another owner, or claim exceeds evidence]

**Candidate disposition:** kept / revised / rejected based on controlled comparison

**Source claim check:** [confirm that effect sizes and model claims are scoped to direct evidence]

## RETEST

<!-- Replay the identical frozen prompts and unchanged oracle on every declared profile. -->

### Results

| Scenario | Exact profile | BASELINE | RETEST | Regression? | Evidence path |
|---|---|---|---|---|---|
| [ID] | [model/version/reasoning] | PASS/FAIL | PASS/FAIL | YES/NO | [path] |

### Targeted Failures

- [case/profile] — now PASS / still FAIL — [observed rationale]

### Already-Passing Regression Cases

- [case/profile] — remains PASS / REGRESSED — [observed rationale]

### Deployment Decision

- [ ] every targeted failure passes
- [ ] every previously passing required case remains passing
- [ ] every declared exact profile completed the full frozen corpus
- [ ] scenario text and oracle remained unchanged
- [ ] responses and verdicts are recorded

**Decision:** DEPLOY / ITERATE / DO NOT DEPLOY

Any declared-profile regression requires `ITERATE` or `DO NOT DEPLOY`, regardless of aggregate score.

## Evidence-Backed Iterations

### Iteration 1 (if required)

**New failing case/profile:** [ID + exact tuple]

**New rationalization:**

> [verbatim text]

**Meta-test response:**

> [verbatim text]

**Smallest clarification:** [change and location]

**Full corpus replay:** PASS / FAIL — [evidence path]

[Repeat only for observed failures.]

## Final Outcome

- [ ] exact model/version/reasoning metadata is complete
- [ ] candidate and unrelated user state were preserved
- [ ] passing baselines did not create unsupported guidance
- [ ] targeted failures pass on every declared profile
- [ ] no declared-profile regression remains
- [ ] `quick_validate.py` passes
- [ ] Markdown link result is recorded
- [ ] skill sync dry run passes
- [ ] skill remains lean enough for repeated use

**Total evidence-backed iterations:** [N]

**Final deployment status:** [status and reason]

## Key Insight

[Most important observed lesson for future skill authors. Distinguish evidence from inference.]

---

*Created: [DATE]*

*Skill version: [VERSION]*

*Purpose: [Pulse workflow position and observable behavior]*
