# Pulse 3.6.0 Replay Bundle

This tracked bundle makes the Pulse 3.6.0 behavioral certificate independently enumerable and auditable from a clean clone.

## Certified corpus

The 45 frozen cases per profile are defined, with their unchanged prompts/oracles and recorded intervention evidence, in:

- `corpus/red-scenarios.md` — S1–S10;
- `corpus/current-pulse-red-scenarios.md` — P1–P3;
- `corpus/B2-skill-evaluation-cases.md` — E1–E6;
- `corpus/W1-worktree-isolation-cases.md` — I1–I6;
- `corpus/G1-governed-feature-cases.md` — G1–G8;
- `corpus/G2-governance-gate-cases.md` — H1–H8;
- `corpus/candidate-delta-scenarios.md` — A1–A3 and R1.

`corpus/B1-contract-cases.md` is additional conservative-BDD contract evidence (C1–C10), not part of the 45-case final non-regression score.

## Exact-profile results

Each `evidence/*.json` file enumerates all 45 case IDs, the observed choice, exact concise rationalization, and verdict for one declared profile. Its sibling Markdown file preserves the verbatim final assistant response.

The oracles and prior results were withheld from both final replay agents. A new model, model version, reasoning effort, or materially different runtime must receive the same raw cases without the oracle, then publish a separate evidence record. Results are never inherited.

## Integrity and replay

From this directory:

```bash
sha256sum -c SHA256SUMS
node ../../../../scripts/verify-tuning-evidence.mjs manifest.json
```

The hash list binds every frozen input and evidence record. The verifier checks hashes, both exact runner tuples, ordered 45-case coverage, unique case IDs, per-case PASS verdicts, and the 90/90 aggregate used by the public certificate.

## Commit chain

- behavioral/distribution candidate: `df5767e`;
- certification publication: `f208730`;
- post-certification install-smoke candidate: `2699137`.

Review fixes after the first install smoke are intentionally tracked as later commits. The public certificate must identify the final reinstalled snapshot separately before Gate 4 closes.
