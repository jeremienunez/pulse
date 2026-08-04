# Pulse 3.6.0 Exact-Profile Certification

Certified on 2026-08-04 against candidate behavior/distribution commit `df5767e`.

## Decision

Pulse 3.6.0 is **superior on the frozen Pulse tuning corpus for the two exact declared profiles**. This is a bounded result, not a universal claim about other models, versions, reasoning settings, runtimes, or unseen tasks.

The decision threshold required all four conditions:

1. strictly more paired A/B passes;
2. zero regressions among previously passing pairs;
3. a perfect fresh final sweep;
4. green structural checks.

All four conditions passed. The tuned distribution is eligible for installation smoke testing; Superpowers remained enabled throughout certification.

## Certified profiles

| Model ID | Model version | Reasoning effort | Runtime | Fresh final replay |
|---|---|---|---|---:|
| `gpt-5.6-sol` | `5.6` | `medium` | Codex native subagent | 45/45 |
| `gpt-5.6-terra` | `5.6` | `low` | Codex native subagent | 45/45 |

Neither final replay reported material uncertainty. The frozen oracles and prior results were withheld from both replay agents.

## Paired A/B result

The primary score counts P1–P3, E1–E6, the original S6, G1–G8, and H1–H8 across both profiles exactly once.

| Segment | Baseline | Final | Delta |
|---|---:|---:|---:|
| P1–P3 | 4/6 | 6/6 | +2 |
| E1–E6 | 10/12 | 12/12 | +2 |
| S6 | 1/2 | 2/2 | +1 |
| G1–G8 | 16/16 | 16/16 | 0 |
| H1–H8 | 16/16 | 16/16 | 0 |
| **Aggregate** | **47/52** | **52/52** | **+5** |

Previously passing paired regressions: **0**.

G/H structural capability gains are reported separately rather than inflated into the behavioral delta: governed-feature routing/artifacts and deterministic governance validation now ship even where the baseline model choice was already correct.

## Final non-regression sweep

Each exact profile replayed all 45 frozen cases: S1–S10, P1–P3, E1–E6, I1–I6, G1–G8, H1–H8, A1–A3, and R1.

- `gpt-5.6-sol` / medium: 45/45
- `gpt-5.6-terra` / low: 45/45
- aggregate: **90/90**

The A1–A3 and R1 no-import controls remained 8/8 across both profiles. They continue to support the decision not to add standalone testing-anti-patterns or review-reception/completion skills without a demonstrated failure.

## Structural evidence

- plugin evaluator: 29/29 PASS, 0 WARN, 0 FAIL;
- onboarding and scout checks: 31/31 PASS, 0 WARN, 0 FAIL.

The machine-readable record is [`pulse-3.6.0.json`](pulse-3.6.0.json).

## Replay and cutover boundary

Every newly declared model, version, reasoning effort, or materially changed runtime must replay the frozen corpus. Results are never inherited from this certificate.

This certificate authorizes only the next step: install the tuned Pulse plugin and run C2 smoke checks. Replace or disable Superpowers only after that smoke passes, and keep the cutover reversible.
