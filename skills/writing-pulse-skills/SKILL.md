---
name: writing-pulse-skills
description: Use when creating a new Pulse skill, editing an existing Pulse skill, or verifying that skill guidance changes agent behavior under pressure. Do NOT use for project-specific AGENTS.md conventions or one-off solutions.
metadata:
  version: '1.2'
  dependencies: []
---

# Writing Pulse Skills

## Overview

Skills are behavior-shaping artifacts. Evaluate them against observable decisions before deployment.

The controlled cycle is:

```text
BASELINE → INTERVENTION → RETEST
```

The goal is discrimination, not ceremony: identify what an agent does before local guidance, change only guidance supported by an observed gap, then replay the same frozen case.

**HARD GATE:** Do not deploy new guidance without a recorded BASELINE and RETEST. A failing BASELINE is not mandatory. If every declared profile already behaves correctly, record the pass and make no intervention for that behavior.

Pre-existing candidate content is evidence, not contamination. Preserve it. Establish an honest comparison with a clean tag/worktree, a control copy, temporary reverse application, or another equivalent pre-change view. Never discard candidate or user work solely because it predates the evaluation.

## When to Use

Use this skill when you are about to:

- create a Pulse ecosystem skill;
- edit an existing Pulse skill, including a small section;
- certify skill behavior on a declared model profile;
- investigate a pressure-test regression.

Do not use it for AGENTS.md files, project-specific conventions, or one-off prompt instructions.

## Evidence Contract

Freeze the case and expected behavior before observing a run. Every completed run records:

- exact model and version;
- reasoning profile or equivalent runtime setting;
- harness/runtime identifier when available;
- frozen scenario ID and full prompt;
- full response, choice, and concrete action;
- exact rationalization, quoted when useful;
- verdict and the rule used to assign it.

Do not expose the expected answer, prior runs, another profile's response, or evaluation history to the evaluated agent. Evidence missing the exact profile tuple, response, or verdict is incomplete and cannot certify deployment.

---

## Phase 1 — BASELINE: Observe Before Local Guidance

1. Define the skill's purpose and the observable behaviors it may need to change.
2. Freeze 3–5 realistic pressure scenarios and their verdict rules. Use `references/pressure-test-template.md`.
3. Run each scenario on every declared profile without the proposed local intervention.
4. Record exact choices, actions, responses, and rationalizations.
5. Classify each case:
   - **PASS** — expected behavior already occurs; do not add guidance for this case.
   - **FAIL** — a concrete violation and rationalization may justify an intervention.
   - **INVALID** — the prompt or oracle is ambiguous; repair and re-freeze it before use.

### Candidate content already exists

Do not erase or set aside the candidate merely to manufacture ordering. Choose the least destructive controlled comparison:

1. run the untouched baseline tag or commit in a separate clean worktree;
2. evaluate a control copy without the candidate section;
3. temporarily reverse-apply only the candidate change, without touching unrelated user state;
4. use another equivalent comparison and document why it is honest.

Then keep, revise, or reject the candidate based on observed evidence.

### Passing BASELINE

A pass is a result, not an invitation to make the scenario harsher until it fails.

- record that no intervention is required;
- keep the frozen case as a regression constraint if the behavior is important;
- do not add warnings, theory, or hypothetical edge-case guidance “for safety.”

---

## Phase 2 — INTERVENTION: Change the Smallest Supported Guidance

Intervene only for recorded failures. Map every changed rule to a baseline case and its exact rationalization.

Treat skill edits like surgical production edits:

- make the smallest wording or structure change that blocks the observed failure;
- preserve already-passing behavior;
- do not broaden into adjacent cleanup, extra theory, or speculative future cases;
- do not claim an effect size or universal model behavior that the recorded evidence does not establish.

### SKILL.md checklist

- [ ] YAML frontmatter starts on line 1 (`---`)
- [ ] `name` is bare hyphen-case and matches the directory exactly
- [ ] `description` starts with “Use when...” and contains triggering conditions only
- [ ] description is third-person and no longer than 1024 characters
- [ ] body stays lean; prefer fewer than 600 lines and move necessary detail into `references/`
- [ ] critical stops are prominent and directly tied to observed failures
- [ ] reference files are no more than one directory level deep
- [ ] every intervention line maps to recorded baseline evidence

For Pulse plugin skills, keep the frontmatter name bare. The plugin wrapper adds the `pulse:` prefix when surfacing the skill.

### Description trap

A workflow summary in the description can cause an agent to act on the summary instead of reading the skill body.

```yaml
# Bad — workflow summary
description: Use when creating skills — capture a baseline, edit, then retest

# Good — triggering conditions only
description: Use when creating a new Pulse skill or editing an existing one
```

---

## Phase 3 — RETEST: Replay the Frozen Evidence

1. Re-run the identical frozen scenarios with the intervention available.
2. Use every declared exact model/version/reasoning profile.
3. Record the same response fields and apply the unchanged oracle.
4. Compare each result with BASELINE.
5. Run all already-passing cases as regression constraints.

Deployment requires:

- every targeted failure now passes;
- no declared profile regresses;
- the oracle and scenarios remain unchanged;
- the evidence includes the exact profile tuple, response, and verdict.

If one profile regresses, block deployment. Minimally revise or reverse the intervention, then replay the entire frozen corpus. A higher aggregate score never overrides a required-case regression.

Every newly declared model or version gets its own replay. Never inherit certification from a model family, prior version, or different reasoning profile.

---

## Phase 4 — Close Observed Loopholes

When an agent still violates a rule with the intervention loaded:

1. capture the new rationalization verbatim;
2. ask the meta-test question from the pressure template;
3. make the smallest durable clarification supported by that response;
4. replay every frozen case on every declared profile.

Do not turn an observed loophole into a broad redesign. A clarification without a recorded failure is unsupported guidance.

## Validate and Document

Run the repository checks:

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" skills/<skill-name>
bash scripts/check-markdown-links.sh skills/<skill-name>/SKILL.md
bash scripts/sync-skills.sh --dry-run
```

If the skill owns a local test script, run it too.

Create or update `CREATION-LOG.md` from `references/creation-log-template.md` when preparing a Pulse skill for deployment. The log must connect source decisions, frozen cases, exact profiles, baseline results, interventions, retests, regressions, and final deployment status.

## Rationalization Table

| Excuse | Evidence rule |
|---|---|
| “The baseline is obvious.” | Agent failures differ. Run and record the declared profiles. |
| “The edit already exists, so the process was missed.” | Preserve it and obtain a controlled pre-change comparison. |
| “Everything passed; we should add a warning anyway.” | Passing evidence authorizes no intervention for that behavior. |
| “A related model passed.” | Replay the exact new model/version/reasoning tuple. |
| “The source reports a large improvement.” | Scope provenance accurately; claim only effects established by this evidence. |
| “The flagship improved, so one lower profile may regress.” | Any required declared-profile regression blocks deployment. |
| “This is only a one-line change.” | Evaluation depth may be small, but BASELINE and RETEST still need recorded evidence. |

## Red Flags — Stop and Repair the Evidence

- expected behavior was written after seeing the model response;
- the evaluated agent can read the oracle or prior runs;
- model/version/reasoning metadata is missing;
- candidate or user work is discarded for ordering ceremony;
- a passing baseline is escalated until a failure appears;
- intervention addresses hypothetical rather than observed failures;
- retest changes the scenario or expected answer;
- aggregate improvement hides a declared-profile regression;
- deployment is claimed without full response and verdict evidence.

## References

Load when needed:

- `references/pressure-test-template.md` — frozen pressure cases, evidence fields, and meta-test
- `references/creation-log-template.md` — controlled comparison and deployment evidence template

**Provenance:** The pressure-evaluation method is adapted from the Superpowers skill-writing material (obra/superpowers). External persuasion research may inform scenario design, but this skill makes no universal effect-size claim; Pulse deployment claims come only from recorded runs on declared exact profiles.
