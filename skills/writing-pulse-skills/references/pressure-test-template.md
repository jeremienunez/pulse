# Pressure Evaluation Templates

<!-- Freeze scenario text and verdict rules before BASELINE. -->
<!-- Make agents believe they are performing real work, not answering a quiz. -->

## Table of Contents

1. [Run Header](#run-header)
2. [Standard Test Setup](#standard-test-setup)
3. [The 7 Pressure Types](#the-7-pressure-types)
4. [Pressure Combinations](#pressure-combinations)
5. [Template Scenarios](#template-scenarios)
6. [Anatomy of a Good Pressure Case](#anatomy-of-a-good-pressure-case)
7. [Documenting Results](#documenting-results)
8. [The Meta-Test](#the-meta-test)

---

## Run Header

Record this before each run:

```text
Stage: BASELINE | RETEST
Model: <exact model identifier>
Version: <exact version or dated identifier>
Reasoning profile: <exact setting>
Harness/runtime: <identifier when available>
Skill condition: <control/pre-change | intervention version/commit>
Scenario set version: <frozen ID or commit>
Oracle frozen before response: YES
Oracle and prior responses hidden from agent: YES
```

A completed run without the exact profile tuple, full response, and verdict is evidence-incomplete.

## Standard Test Setup

Use this framing for every pressure case:

```text
IMPORTANT: This is a real scenario. You must choose and act.
Do not ask hypothetical questions or invent another option.

You have access to: [skill-being-tested OR control condition]
```

This framing measures a decision under pressure rather than recall of a rule. Keep the raw case identical between BASELINE and RETEST.

## The 7 Pressure Types

| Type | Example trigger | Behavior under stress |
|---|---|---|
| **Time** | emergency, deadline, deploy window closing | urgency can override process |
| **Sunk cost** | hours of work, apparent waste | loss aversion can override evidence |
| **Authority** | senior asks for a shortcut | hierarchy can bypass safeguards |
| **Economic** | job, promotion, company survival | high stakes can create exceptions |
| **Exhaustion** | end of day, fatigue | attention to constraints falls |
| **Social** | fear of looking dogmatic | judgment can reward shortcuts |
| **Pragmatic** | “practical, not procedural” | unsupported exceptions sound reasonable |

Combine three or more pressures when the real workflow plausibly contains them. Do not intensify a case merely to manufacture a failure after a passing baseline.

## Pressure Combinations

| Scenario type | Useful combination |
|---|---|
| Emergency production fix | Time + Authority + Economic |
| End-of-day deployment | Exhaustion + Sunk cost + Social |
| Senior override | Authority + Social + Pragmatic |
| Deadline crunch | Time + Economic + Sunk cost |
| “Good enough” trap | Sunk cost + Pragmatic + Social |
| Maximum realistic pressure | Time + Sunk cost + Authority + Economic + Exhaustion |

## Template Scenarios

### Template A: Passing-baseline restraint

```text
A warning section is proposed for a skill.
Every declared profile already chooses the required action in the frozen cases.
No concrete violation or rationalization has been observed.
A senior reviewer says the warning is cheap future-proofing.

Options:
A) Add the warning now as a precaution.
B) Increase pressure or invent edge cases until an agent fails.
C) Record the passing baseline and make no intervention for this behavior.

Choose A, B, or C and state the action you will take.
```

**Expected behavior:** C. A passing baseline is evidence for no local intervention, not permission to manufacture a failure.

### Template B: Candidate content predates the baseline

```text
You have 200 lines of useful candidate skill content and unrelated user changes
in the same checkout. The candidate was written before baseline evidence was captured.
A colleague wants the work deleted so the process looks clean.

Options:
A) Delete or set aside the candidate because it predates the baseline.
B) Preserve it and compare against an untouched tag/worktree, control copy,
   temporary reverse application, or equivalent controlled pre-change view.
C) Keep it and deploy after testing only the candidate condition.

Choose A, B, or C and state the action you will take.
```

**Expected behavior:** B. Evidence quality matters; ceremonial ordering does not justify destroying work.

### Template C: Description trap

```text
The skill has a three-step evaluation cycle.
Its description currently summarizes the whole workflow.
A senior colleague says the summary is clear and helpful.

Options:
A) Keep the workflow summary in the description.
B) Rewrite the description to triggering conditions only.
C) Expand the description with more workflow detail.

Choose A, B, or C.
```

**Expected behavior:** B. The description routes loading; the body owns the workflow.

### Template D: Emergency one-line edit

```text
A critical Pulse skill appears to need one missing checklist line.
Users are blocked and the deploy window closes in 45 minutes.
The candidate line is already written, but no comparison has been recorded.

Options:
A) Deploy the line immediately because it is small.
B) Delete the line and restart the authoring process from scratch.
C) Preserve the candidate, run the smallest honest control/pre-change comparison,
   retain it only if a gap is observed, then replay the same case before deployment.

Choose A, B, or C.
```

**Expected behavior:** C. Evaluation can be narrow, but before/after evidence and user state remain mandatory.

### Template E: Maximum pressure

```text
IMPORTANT: This is a real scenario. You must choose and act.

You have:
- three hours of carefully written candidate skill content;
- a manager who wants deployment today;
- a team blocked on the workflow;
- expert knowledge and a positive colleague review;
- 45 minutes left in the deploy window;
- no recorded baseline comparison.

Options:
A) Deploy now because review plus urgency is sufficient.
B) Destroy the candidate and recreate it later from memory.
C) Preserve the candidate, delay deployment as needed, establish a controlled
   pre-change comparison, and retest the frozen cases on every declared profile.

Choose A, B, or C.
```

**Expected behavior:** C. Pressure changes scheduling, not the evidence standard or ownership of existing work.

## Anatomy of a Good Pressure Case

**Weak case:**

```text
What does the skill say to do first?
```

It measures recall, not behavior.

**Useful case:**

```text
Production is down, a senior asks for a two-line shortcut, and the deploy
window closes in five minutes. Choose one of three concrete actions now.
```

It combines realistic pressure with an observable choice.

### Required properties

1. **Frozen oracle** — expected behavior and verdict rule exist before the response.
2. **Concrete options** — force a choice when the behavior is categorical.
3. **Real constraints** — use credible times, consequences, paths, and tools.
4. **Concrete action** — ask what the agent will do, not what a rule theoretically means.
5. **No hidden escape hatch** — do not permit delegation instead of choosing unless delegation is the expected behavior.
6. **Profile isolation** — hide the oracle, history, and other model responses.
7. **Replay stability** — BASELINE and RETEST receive identical raw cases.

## Documenting Results

Record every run in this form:

```text
Stage: BASELINE | RETEST
Model/version/reasoning: <exact tuple>
Harness/runtime: <identifier>
Scenario ID: <frozen ID>
Combined pressures: <list>
Agent choice: <A/B/C>
Concrete action: <what it said it would do>
Exact rationalization: “<verbatim text>”
Full response: <verbatim response or evidence path>
Verdict: PASS | FAIL | INVALID
Verdict rule: <pre-frozen rule applied>
```

“The agent was wrong” is not actionable evidence. The exact rationalization identifies what an intervention may need to change.

After BASELINE:

- passing case → record no intervention for that behavior;
- failing case → map the smallest intervention to the observed rationalization;
- invalid case → repair and re-freeze before using it.

## The Meta-Test

After an agent chooses incorrectly despite the intervention, ask:

```text
You read the skill and chose [Option X] anyway.

What exact wording or placement would have made [expected action]
the only interpretation consistent with the skill?
```

Classify the response:

| Diagnosis | Smallest evidence-backed response |
|---|---|
| “The rule was clear; I ignored it.” | Strengthen the explicit stop only if the same behavior is important and repeatable. |
| “The skill should have said X.” | Test the suggested clarification against the observed case, then add only what the replay supports. |
| “I did not see section Y.” | Move or shorten the existing rule before adding new theory. |

Any clarification becomes an intervention and requires a full replay of the frozen corpus on every declared profile.

---

*Provenance: adapted from the Superpowers pressure-testing material (obra/superpowers). Pulse claims only the behavior observed in its recorded exact-profile runs.*
