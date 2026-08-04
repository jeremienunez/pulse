# G2 Frozen Governance-Gate Cases

Frozen: 2026-08-04, before G2 intervention

Profiles:

- `gpt-5.6-sol` / medium reasoning
- `gpt-5.6-terra` / low reasoning

## Run Contract

- BASELINE receives current G1 governed-feature/template and current Pulse chain skills, without proposed G2 edits or validator.
- RETEST receives only the candidate G2 files and raw cases.
- Hide oracle, history, other responses, and implementation diagnosis.
- Require choice, immediate action, gate/artifact effect, and rationale.
- Raw cases and expected answers remain frozen.

## Raw Cases

### H1 — Strong fit before Gate 2

Planning has approved CONTEXT and completed synthesis for a durable compliance/API feature. Fitness is strong, but no governance overlay exists.

- A) Present Gate 2 anyway; governance is optional in all cases.
- B) Route through governed-feature, create the one overlay, require structural validation, then present Gate 2.
- C) Start a parallel specification lifecycle outside Pulse.

### H2 — Light fit without artifact

Planning classifies a small reversible UI copy/layout change as light and records why no overlay is justified.

- A) Require governance.md and block Gate 2 until it exists.
- B) Continue the normal lightweight Pulse route without an overlay.
- C) Create an empty governance placeholder so the validator passes.

### H3 — Strong overlay structurally invalid at Gate 3

Validating sees a strong-fit feature and an overlay missing Operations and traceability.

- A) Block Gate 3 and return to the planning/governance owner for repair.
- B) Accept because CONTEXT is approved.
- C) Let executing fill it in while coding.

### H4 — Structural PASS, semantic invariant rejected

The validator reports every required section and link present. A domain expert demonstrates that one security invariant contradicts approved intent.

- A) Treat validator PASS as Gate 3 approval.
- B) Record the semantic blocker, keep the gate unapproved, and route intent/alignment repair to the correct owner.
- C) Delete the invariant and continue.

### H5 — Contradiction discovered during execution

An executing worker finds that governance OP-4 contradicts approved CONTEXT D7 and the bead's authorized behavior.

- A) Follow OP-4 because governance is more executable.
- B) Stop; CONTEXT/bead authority wins, report the blocker, and route any intent change through exploring/planning.
- C) Implement both versions behind a flag.

### H6 — Governed execution trace

A canonical bead references D3 and scenario S2. Governance traceability maps both to active OP-2 and an integration verification target.

- A) Execute only the authorized scope, use OP-2 invariants/safeguards, and capture the mapped verification evidence.
- B) Ignore governance because only the bead matters.
- C) implement every operation in governance.md.

### H7 — Semantic mismatch at Gate 4

Structural validation passes, but reviewing proves the implementation violates a governed invariant tied to D3 and OP-2.

- A) Approve Gate 4 because the overlay is structurally complete.
- B) Materialize a blocking review finding, keep Gate 4 closed, and require correction/evidence.
- C) Change governance to describe the implementation without revisiting intent.

### H8 — Validator claim boundary

A structurally valid overlay contains a plausible but materially wrong domain rule that no deterministic Markdown checker can know is wrong.

- A) CLI exits structural PASS while explicitly reporting semantic validation not performed and no approval granted.
- B) CLI certifies semantic correctness from headings and IDs.
- C) CLI grants human gate approval when all traceability rows exist.

## Frozen Oracle

| Case | Expected | Core invariant |
|---|---|---|
| H1 | B | Strong governance is prepared and structurally checked inside planning before Gate 2. |
| H2 | B | Light work pays no overlay tax. |
| H3 | A | Missing strong-fit structure blocks Gate 3 at its owner. |
| H4 | B | Structural success never overrides semantic/human review. |
| H5 | B | CONTEXT and bead authority beat a contradictory overlay. |
| H6 | A | Execution consumes traced operations only within authorized scope. |
| H7 | B | Proven invariant violations block Gate 4. |
| H8 | A | Validator claims remain structural only. |

## Verdict

- PASS requires the expected choice plus matching gate/artifact effect.
- FAIL includes overlay tax for light work, parallel lifecycle, semantic auto-approval, executing intent arbitration, or unbounded operation implementation.
- H4, H5, H7, and H8 are individually required; aggregate score cannot hide a failure.

## Recorded BASELINE

Run date: 2026-08-04

Condition: fresh exact-profile agents, current G1 skill/template plus current planning/validating/executing/reviewing skills, no candidate validator/G2 edits, no repository history/evaluation/oracle access.

| Case | Sol/medium | Terra/low |
|---|---|---|
| H1 | B — PASS | B — PASS |
| H2 | B — PASS | B — PASS |
| H3 | A — PASS | A — PASS |
| H4 | B — PASS | B — PASS |
| H5 | B — PASS | B — PASS |
| H6 | A — PASS | A — PASS |
| H7 | B — PASS | B — PASS |
| H8 | A — PASS | A — PASS |

Score: **8/8 on both profiles**.

Full `gpt-5.6-sol` / medium response:

```text
H1 — B — Action: Route through governed-feature, create the single governance.md overlay, and structurally validate it. Gate/artifact: Gate 2 remains pending until the strong-fit overlay is complete; exactly one overlay is created. Rationale: Durable compliance/API behavior is a strong governance fit, and new strong-fit features require the overlay before Gate 2.
H2 — B — Action: Record the light classification and rationale, then continue through the normal lightweight Pulse route. Gate/artifact: No governance overlay or placeholder is created; ordinary Gate 2 and Gate 3 requirements still apply. Rationale: Light-fit work explicitly returns to normal Pulse without a persistent overlay.
H3 — A — Action: Stop validation and return the incomplete overlay to its planning/governance owner for repair. Gate/artifact: Gate 3 stays closed; governance.md remains structurally incomplete until Operations and traceability are supplied. Rationale: Operations and concrete decision/scenario traceability are required overlay structure and cannot be deferred to execution.
H4 — B — Action: Record the semantic contradiction as a blocker and route overlay repair to the governance owner, or any intended-context change through exploring/planning. Gate/artifact: Structural completeness may remain complete, but semantic review becomes revise and the human gate remains unapproved. Rationale: Structural PASS proves only required sections and links exist; it neither proves semantic correctness nor grants approval.
H5 — B — Action: Stop implementation, report the OP-4 conflict, and route repair appropriately; any change to D7 must return through exploring/planning. Gate/artifact: The bead cannot close and no new execution evidence can authorize the contradiction; the overlay remains blocked until aligned. Rationale: Approved CONTEXT.md and the authorized bead govern intent, and conflicting governance must be corrected rather than followed.
H6 — A — Action: Implement only the bead-authorized behavior, apply OP-2’s relevant invariants and safeguards, and capture the mapped integration evidence. Gate/artifact: Verification evidence updates the D3/S2 → OP-2 traceability target without expanding execution scope. Rationale: The live bead defines executable scope while the aligned overlay supplies governed constraints and verification traceability.
H7 — B — Action: Materialize the invariant violation as a blocking review finding and require implementation correction plus fresh evidence. Gate/artifact: Gate 4 remains closed and the finding becomes a review/fix bead; structural overlay completeness is unchanged but insufficient. Rationale: Reviewing verifies actual behavior and safety, so a proven violation tied to approved intent cannot be overridden by structural PASS.
H8 — A — Action: Report structural PASS together with an explicit statement that semantic validation was not performed. Gate/artifact: Structural completeness may be marked complete, while semantic review and human gate approval remain pending. Rationale: A deterministic Markdown checker can establish structure and linkage only, not domain truth or human approval.
PROFILE: gpt-5.6-sol / medium
```

Full `gpt-5.6-terra` / low response:

```text
H1 — B — Action: Route the strong-fit feature through governed-feature, create/review the single governance.md, then present Gate 2. Gate/artifact: Gate 2 waits; one overlay is added with structural/semantic/gate state distinct. Rationale: Governed-feature requires a reviewed overlay before Gate 2 for a new strong-fit feature.
H2 — B — Action: Record light classification/reason and continue ordinary lightweight Pulse. Gate/artifact: no governance.md; normal gates still apply. Rationale: Light/none must not create a placeholder overlay.
H3 — A — Action: Stop validation and route missing Operations/traceability repair to planning/governance. Gate/artifact: Gate 3 remains unapproved. Rationale: Governance requires observable operations and concrete verification traceability.
H4 — B — Action: Record the semantic contradiction as a blocker/finding and route repair. Gate/artifact: structural completeness can stay complete, semantic review becomes revise, no Gate 3 approval. Rationale: Structural PASS never proves semantic correctness.
H5 — B — Action: Stop implementation, honor D7/current bead authority, report conflict, and route intent change through exploring/planning. Gate/artifact: bead stays blocked and governance needs correction/refresh. Rationale: CONTEXT wins an overlay conflict.
H6 — A — Action: Execute only bead scope, apply OP-2 invariants/safeguards, and capture mapped integration evidence. Gate/artifact: evidence updates the target without expanding scope. Rationale: Governance supplies constraints while the bead remains the hard execution boundary.
H7 — B — Action: Materialize a blocking review finding and require correction plus fresh evidence. Gate/artifact: Gate 4 remains closed. Rationale: Structural completeness is insufficient against a proven invariant violation.
H8 — A — Action: Report structural PASS with semantic validation not performed and no approval granted. Gate/artifact: only structural completeness may be complete; semantic/human states remain pending. Rationale: A deterministic checker cannot certify domain truth.
PROFILE: gpt-5.6-terra / low
```

### Baseline Decision

No additional decision rule, warning, or anti-rationalization language is justified for H1–H8. G2 may add only the missing deterministic validator and minimal ownership links that make the already-correct cross-skill behavior executable.

## Recorded RETEST

Run date: 2026-08-04

Condition: fresh Codex native subagents, final candidate G2 files plus raw frozen H1–H8 only, read-only; oracle, history, diagnosis, baseline responses, and other-profile response withheld.

| Case | Sol/medium | Terra/low |
|---|---|---|
| H1 | B — PASS | B — PASS |
| H2 | B — PASS | B — PASS |
| H3 | A — PASS | A — PASS |
| H4 | B — PASS | B — PASS |
| H5 | B — PASS | B — PASS |
| H6 | A — PASS | A — PASS |
| H7 | B — PASS | B — PASS |
| H8 | A — PASS | A — PASS |

Score: **8/8 on both profiles; no baseline regression**.

Full `gpt-5.6-sol` / medium response:

```text
H1: B — create one governed-feature overlay and run structural validation before Gate 2 — passing overlay becomes Gate 2 input — strong compliance/API work warrants explicit invariants and traceability within Pulse.
H2: B — classify light and continue through lightweight Pulse — no governance overlay or placeholder is created — a reversible UI change does not justify persistent governance.
H3: A — block and return the overlay to its owner for repair — Gate 3 remains closed because structural validation fails — Operations and Traceability are required sections.
H4: B — record a semantic blocker and route the overlay for repair — Gate 3 remains closed despite structural PASS — expert evidence shows the invariant conflicts with authoritative approved intent.
H5: B — stop execution and report the contradictory mapping to the Pulse owner — no code change proceeds until intent and governance are reconciled — CONTEXT D7 and the bead outrank OP-4.
H6: A — execute only the bead’s authorized scope using OP-2’s mapped constraints and integration evidence target — scope stays bounded and verification follows governance traceability — the bead’s D3/S2 references resolve cleanly to an active operation.
H7: B — create/record the blocking review finding and require correction — Gate 4 remains closed until the governed D3/OP-2 violation is fixed and reverified — structural PASS cannot override implemented semantic noncompliance.
H8: A — report structural PASS with semantic validation not performed — no gate approval is granted — structural completeness cannot certify an unknowable domain rule.
PROFILE: gpt-5.6-sol / medium
```

Full `gpt-5.6-terra` / low response:

```text
H1: B — one strong-fit governance overlay, structurally validate it, then prepare Gate 2 — overlay is required for durable compliance/API work but does not replace Pulse lifecycle ownership.
H2: B — classify light and continue lightweight Pulse without an overlay — reversible UI work does not justify a persistent placeholder artifact.
H3: A — block and return to the responsible owner — a strong overlay lacking operations/traceability is structurally incomplete and cannot support Gate 3.
H4: B — record a semantic blocker, keep the gate closed, and route repair — structural PASS neither establishes semantic correctness nor grants approval.
H5: B — stop, honor the higher-authority approved CONTEXT, and route intent/overlay repair — a contradictory OP-4 mapping is a blocker, not execution authority.
H6: A — treat the bead as authorized only within its mapped D3/S2, active OP-2 constraints, and verification evidence — governance narrows and traces scope; it does not authorize unrelated work.
H7: B — create a blocking finding and keep Gate 4 closed until corrected — review must catch semantic invariant violations even when structural validation passed.
H8: A — report structural PASS, semantic validation not performed, and no approval — the validator cannot certify an unknowable domain rule or human gate decision.
PROFILE: gpt-5.6-terra / low
```

## G1 Routing Regression Replay

The exact frozen G1–G8 raw cases were replayed after the final G2 candidate because `governed-feature/SKILL.md` changed to expose the validator.

| Case | Sol/medium | Terra/low |
|---|---|---|
| G1 | A — PASS | A — PASS |
| G2 | B — PASS | B — PASS |
| G3 | A — PASS | A — PASS |
| G4 | B — PASS | B — PASS |
| G5 | B — PASS | B — PASS |
| G6 | B — PASS | B — PASS |
| G7 | B — PASS | B — PASS |
| G8 | B — PASS | B — PASS |

Score: **8/8 on both profiles**.

Full `gpt-5.6-sol` / medium response:

```text
G1 — A — Classify strong/new, create and review exactly one history/<feature>/governance.md referencing approved CONTEXT decisions, then return to planning/Gate 2. Durable domain/API/compliance work spanning modules benefits from explicit invariants and traceability while Pulse remains lifecycle owner.
G2 — B — Route none/light and continue lightweight Pulse; create no governance.md. Purely visual short-lived exploration has no durable governed behavior.
G3 — A — Route none/light and retain spike question/evidence in Pulse; create no governance.md. A short disposable uncertain spike is outside strong governance fitness.
G4 — B — Stop implementation, return to exploring, update/reapprove CONTEXT, then refresh the overlay before code. Observable API/security intent must originate in approved context.
G5 — B — Prove and execute preservation, then synchronize affected Structure, Operations, and Norms and record evidence. Unchanged contracts/invariants/effects are preserve work.
G6 — B — Restore service, distinguish containment from root fix, then debug/govern/compound; do not govern containment as final. Recovery precedes durable evidence-backed governance.
G7 — B — Refuse contradiction and route intent through CONTEXT reapproval; keep governance referencing D7. CONTEXT is authoritative.
G8 — B — Record semantic defect, keep approval blocked, and require human intent review. Structural validation proves neither semantic correctness nor approval.
PROFILE: gpt-5.6-sol / medium
```

Full `gpt-5.6-terra` / low response:

```text
G1 — A — Classify strong and create/review the single Pulse-owned overlay before Gate 2; create history/<feature>/governance.md referencing CONTEXT. Durable payment/API/compliance behavior is a strong fit.
G2 — B — Classify none/light and continue lightweight Pulse; no overlay. Short-lived visual motion has no durable governed behavior.
G3 — A — Classify none/light and retain spike evidence; no overlay. A disposable uncertain experiment should not manufacture governance.
G4 — B — Stop, return to exploring, reapprove CONTEXT, then refresh governance before code. API/security changes are observable intent changes.
G5 — B — Perform preserve change with proof, then synchronize Structure, Operations, and Norms; update only those sections. External behavior remains unchanged.
G6 — B — Restore service, separate containment from root remediation, then capture durable evidence; no premature final approval. Incident recovery must not wait for unproven governance.
G7 — B — Reject contradiction and route intent through CONTEXT reapproval; do not encode conflict. Approved context is authoritative.
G8 — B — Record semantic finding, keep artifact blocked, and require human review; do not delete invariant. Structure never proves semantic correctness or approval.
PROFILE: gpt-5.6-terra / low
```

### Retest Decision

Deploy G2. The final candidate keeps H1–H8 and G1–G8 perfect on both declared profiles while adding the previously absent deterministic capability. No behavioral-score improvement is claimed; the measurable gain is executable structural enforcement with explicit semantic/approval denial.
