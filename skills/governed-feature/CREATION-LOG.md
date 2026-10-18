# Governance ICM v2 compatibility correction — 2026-10-18

Baseline source: commit `4778a9d7fea853ab660c0e91abfb88aa047b03cd`.
The runtime moved intent authority to approved v2 decisions while this guide and validator still required legacy CONTEXT.

Three cases and verdict rules were frozen before the baseline. Only the old/new guide and identical scenario prompts were supplied to the evaluator; the oracle and prior responses were withheld.

| Case | Frozen situation and oracle | BASELINE | RETEST |
|---|---|---|---|
| GOV-1 | Stage 02 payments, current Gate 1 approval of v2 decisions D1/S1, no legacy CONTEXT. Prepare the overlay using v2 authority without creating legacy authority or restarting exploration. | FAIL: “only after CONTEXT.md is approved should a strong-fit governance overlay be created” | PASS: uses the approved v2 decisions, proposes the overlay with no blocker |
| GOV-2 | Legacy billing CONTEXT approved; behavior-preserving refactor affects OP-3, OP-2 retired; request to close ID gaps. Keep legacy authority and stable OP IDs. | PASS | PASS |
| GOV-3 | Structural validator green, semantic_validation not_performed, grants_approval false; domain review absent and merge gate pending. Keep those approvals pending. | PASS | PASS |

Intervention: replace the legacy-only authority references with the active runtime's approved intent; adapt the template and validator to accept exactly the v2 decisions path or the existing legacy path. No new operation-ID or approval warnings were added for passing cases.

Evaluator: direct `deepseek-coder.delegate_code`, requested/reported model `deepseek-flash`, reasoning `low`, execution `proposal_only_no_tools`.
Baseline response `c7fddda0-09e3-4fbb-b1e7-cbec16257b66` used 3,579 tokens; retest `0bdda3d7-59fe-49c7-b38f-bab64dea7c1d` used 3,720 tokens. Full frozen prompts, responses and tool metadata are retained in the local ICM run `history/audit-fixes-20261018/stages/04_execute/output/governance-{cases,baseline,retest}.json`.

Validation: legacy positive control, v2 API and CLI positive controls, wrong-stage/path negative controls, unchanged structural-only result. Local validator suite: 16/16.

Status: source correction verified; behavioral replay is diagnostic. The provider did not expose an immutable model version, so this is not deployment certification for an exact model profile. No global installation or deployment was performed.
