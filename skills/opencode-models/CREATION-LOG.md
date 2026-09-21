# Creation Log: OpenCode Models

## Source Material

**Origin:** Pulse local `opencode-models` MCP integration.

**Source version:** Pulse `4.0.0+codex.20260901154033`, MCP server `pulse-opencode-models` 1.0.0.

**What the source does:** Lists models and performs read-only single-model or multi-model consultations through OpenCode Zen and Go.

**Pulse context:** Optional advisory consultation during exploration, planning, validation, or review.

**Claim boundary:** The MCP handshake and API calls establish connectivity. This evaluation establishes only the routing behavior observed on the declared Codex profile.

## Extraction Decisions

**Included:**

- Explicit `compare_models` routing — baseline OM-3 used repeated `ask_model` calls instead of the connected comparison operation.
- Concise descriptions of list, ask, and compare results — these expose the existing MCP contract through an invocable Pulse skill.
- Advisory and verification boundary — external models have no filesystem access and their claims are not source evidence.

**Excluded:**

- Model-specific reasoning-effort tables — no frozen oracle failure authorized this broader guidance.
- Automatic use in every Pulse stage — no evidence supports mandatory consultation.
- File editing or autonomous execution — outside the read-only MCP contract.

## Evaluation Contract

**Behavior being evaluated:** Route explicit OpenCode discovery, single consultation, and comparison requests to the matching Pulse MCP operation while preserving exact model identity and failures.

**Frozen scenario set:** `opencode-models-v1` at `/home/jerem/Documents/Codex/2026-09-01/ok/work/opencode-models-skill-eval/scenarios.md`.

**Oracle frozen before responses:** YES.

| Model | Version | Reasoning profile | Harness/runtime |
|---|---|---|---|
| `gpt-5.6-luna` | current on 2026-09-01 | `low` | Codex CLI `0.151.0-alpha.7.2`, ephemeral exec |

**Candidate state before BASELINE:** none.

**User state preservation:** Pulse source and installed plugin were left intact during baseline; evidence was written under the task `work/` directory.

## BASELINE

### OM-1 — Display an exact filtered catalog

**Full prompt and frozen oracle:** `scenarios.md`, OM-1.

**Agent choice/action:** Called `list_models` with `provider=go` and `search=qwen3.7`; returned exact prefixed matches and made no inference call.

**Exact rationalization:**

> Je vérifie d'abord les capacités/catalogues connectés disponibles pour appliquer exactement la demande, sans solliciter de modèle.

**Full response:** `/home/jerem/Documents/Codex/2026-09-01/ok/work/opencode-models-skill-eval/baseline-om1.jsonl`.

**Verdict:** PASS — matched the pre-frozen OM-1 oracle.

### OM-2 — Ask one exact model

**Full prompt and frozen oracle:** `scenarios.md`, OM-2.

**Agent choice/action:** Called `ask_model` for `opencode-go/gpt-5.6-luna`; after one provider-rejected parameter attempt, returned the delegated text `42` and provider usage.

**Exact rationalization:**

> Je vérifie d'abord si le modèle et l'outil `pulse:opencode-models` sont réellement disponibles dans cette session, puis j'exécuterai la requête exactement telle quelle.

**Full response:** `/home/jerem/Documents/Codex/2026-09-01/ok/work/opencode-models-skill-eval/baseline-om2.jsonl`.

**Verdict:** PASS — matched the pre-frozen OM-2 oracle.

### OM-3 — Compare two exact models

**Full prompt and frozen oracle:** `scenarios.md`, OM-3.

**Agent choice/action:** Launched separate `ask_model` calls, retried them, and never used `compare_models`.

**Exact rationalization:**

> Je vais utiliser la capacité `pulse:opencode-models` demandée et lancer les deux requêtes en parallèle, puis restituer chaque résultat avec l'identifiant exact.

**Full response:** `/home/jerem/Documents/Codex/2026-09-01/ok/work/opencode-models-skill-eval/baseline-om3.jsonl`.

**Verdict:** FAIL — the frozen OM-3 oracle requires the connected comparison operation.

### BASELINE Summary

| Scenario | Profile | Verdict | Decision |
|---|---|---|---|
| OM-1 | `gpt-5.6-luna` low | PASS | No new behavioral rule; retain as regression case |
| OM-2 | `gpt-5.6-luna` low | PASS | No new behavioral rule; retain as regression case |
| OM-3 | `gpt-5.6-luna` low | FAIL | Add one explicit comparison-routing rule |

## INTERVENTION

| Changed file/section | Baseline case | Rationalization addressed | Smallest change |
|---|---|---|---|
| `SKILL.md` / Route the request | OM-3 | Claimed parallel comparison but used repeated single-model calls | Require one `compare_models` call for one prompt sent to 2–4 models |

The remaining text exposes the existing MCP interface and its read-only advisory boundary. No model-specific tuning table or mandatory Pulse-stage consultation was added.

## RETEST

The identical frozen prompts and unchanged oracles were replayed on the declared profile with Pulse `4.0.0+codex.20260901154921`.

| Scenario | Exact profile | BASELINE | RETEST | Regression? | Evidence path |
|---|---|---|---|---|---|
| OM-1 | `gpt-5.6-luna`, low, CLI `0.151.0-alpha.7.2` | PASS | PASS | NO | `retest-final-om1.jsonl` |
| OM-2 | `gpt-5.6-luna`, low, CLI `0.151.0-alpha.7.2` | PASS | PASS | NO | `retest-final-om2.jsonl` |
| OM-3 | `gpt-5.6-luna`, low, CLI `0.151.0-alpha.7.2` | FAIL | PASS | NO | `retest-final-om3.jsonl` |

**Targeted failure:** OM-3 now calls `compare_models` once with both exact identifiers. Its result kept the successful model answer separate and surfaced the other model's provider error.

**Already-passing regression cases:** OM-1 still used only `list_models` with exact prefixes. OM-2 still used `ask_model`, preserved the answer, and reported usage.

**Deployment checklist:**

- [x] every targeted failure passes
- [x] every previously passing required case remains passing
- [x] the declared exact profile completed the full frozen corpus
- [x] scenario text and oracle remained unchanged
- [x] responses and verdicts are recorded

**Decision:** DEPLOY.

## Evidence-Backed Iterations

### Packaging adjustment before final replay

The first OM-1 retest exposed an unnecessary MCP dependency auto-install warning because the server is already bundled by Pulse. The dependency block was removed from `agents/openai.yaml`; skill guidance was unchanged. Pulse was reinstalled and the full frozen corpus was replayed from OM-1. The preliminary run remains at `retest-om1.jsonl` and is not counted as final certification evidence.

## Final Outcome

- [x] exact model/version/reasoning metadata is complete
- [x] candidate and unrelated user state were preserved
- [x] passing baselines did not create unsupported behavioral guidance
- [x] the targeted failure passes on the declared profile
- [x] no declared-profile regression remains
- [x] `quick_validate.py` passes
- [x] Markdown result recorded: the new skill has no Markdown links; the repository checker reported only pre-existing unrelated missing targets
- [x] skill sync dry run detects `opencode-models`
- [x] skill remains lean enough for repeated use

**Total evidence-backed iterations:** 1 packaging-only adjustment, followed by one complete final replay.

**Deployment status:** DEPLOY — all frozen cases pass on the declared profile.

## Key Insight

Tool descriptions were enough for correct listing and single-model delegation, but explicit skill routing was required for Codex to choose the purpose-built parallel comparison operation instead of composing repeated single-model calls.

*Created: 2026-09-01*

*Skill version: 1.0.0 candidate*

*Purpose: Route Pulse OpenCode model discovery and advisory consultation through the matching MCP tools.*
