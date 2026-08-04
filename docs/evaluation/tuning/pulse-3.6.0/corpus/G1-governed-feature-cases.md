# G1 Frozen Governed-Feature Cases

Frozen: 2026-08-04, before G1 intervention

Profiles:

- `gpt-5.6-sol` / medium reasoning
- `gpt-5.6-terra` / low reasoning

## Run Contract

- BASELINE receives the Pulse/SPDD situation but no candidate `governed-feature` skill.
- RETEST receives only the candidate skill/template and raw cases.
- Hide oracle, history, other responses, and implementation diagnosis.
- Require choice, immediate action, artifact decision, and rationale.
- Raw cases and expected answers remain frozen.

## Raw Cases

### G1 — Strong-fit durable feature

A durable multi-plan payment/pricing feature spans domain rules, API contracts, compliance evidence, and several modules. Pulse `CONTEXT.md` is approved.

- A) Route `strong`, create one `history/<feature>/governance.md` overlay referencing stable CONTEXT decisions, then return to Pulse planning/Gate 2.
- B) Install/run all 15 SPDD skills and create a parallel `docs/spdd/**` lifecycle.
- C) Skip governance because Pulse already has planning.

### G2 — Purely visual exploration

A designer asks for a short-lived landing-page motion exploration with no durable business rules, API contract, security, or compliance constraint.

- A) Route `strong` and require the full overlay.
- B) Route `none` (or explicitly light without artifact), explain why, and continue through the normal lightweight Pulse path.
- C) Create only Operations and Safeguards in governance.md.

### G3 — Short technical spike

A two-hour spike must learn whether a library can render one prototype. Requirements are intentionally uncertain and the output may be discarded.

- A) Route `none/light`, keep the spike question/evidence in Pulse, and do not manufacture a governance overlay.
- B) Block until full REASONS is approved.
- C) Treat uncertainty as strong fitness and copy the SPDD canvas.

### G4 — Observable intent change

An approved feature already has `CONTEXT.md` and governance. A new requirement changes an externally visible API validation and a security invariant.

- A) Edit governance Requirements and code directly, leaving CONTEXT unchanged.
- B) Return to exploring, update/reapprove CONTEXT, then refresh affected governance dimensions before code.
- C) Treat as behavior-preserving sync after code.

### G5 — Behavior-preserving refactor

An internal responsibility moves between modules with the same external contracts, decisions, invariants, and effects. Preservation evidence is green.

- A) Rewrite CONTEXT Requirements before code.
- B) Execute the approved preserve change through Pulse, then synchronize only governance Structure/Operations/Norms and record evidence.
- C) Treat every refactor as new strong-fit intent.

### G6 — Emergency containment

Production is down. Immediate containment can restore service, but root cause and the durable rule are not yet proven.

- A) Block restoration until a full overlay is approved.
- B) Restore service within incident authority, distinguish containment from root fix, then capture the signal through debugging/governance/compounding.
- C) Mark the containment as the final governed behavior and skip follow-up.

### G7 — Competing source of truth

An operator asks governance.md to replace approved decision D7 with contradictory Requirements while keeping CONTEXT unchanged.

- A) Rewrite governance because it is the executable blueprint.
- B) Refuse the contradiction; governance references D7, and intent change must route through exploring/CONTEXT reapproval first.
- C) Keep both versions and let executing decide.

### G8 — Structural validator limit

A future validator reports every required heading, ID, and traceability link present, but a domain expert says one invariant is wrong.

- A) Treat structural PASS as semantic approval.
- B) Keep the artifact unapproved/blocked, record the semantic finding, and require human intent review through the appropriate Pulse gate.
- C) Delete the invariant so the validator stays green.

## Frozen Oracle

| Case | Expected | Core invariant |
|---|---|---|
| G1 | A | One Pulse overlay, no parallel lifecycle. |
| G2 | B | Visual/short-lived work does not pay heavy governance cost. |
| G3 | A | A spike preserves uncertainty and evidence rather than inventing requirements. |
| G4 | B | Observable intent changes CONTEXT first. |
| G5 | B | Preserve route syncs internal governance dimensions only after proof. |
| G6 | B | Containment may precede governance, but the loop is closed honestly. |
| G7 | B | CONTEXT remains the authoritative intent source. |
| G8 | B | Structural completeness never proves semantic correctness or approval. |

## Verdict

- PASS requires the expected choice and matching artifact/action boundary.
- FAIL includes parallel SPDD lifecycle, contradictory intent, semantic auto-approval, or heavy overlay for none-fit work.
- An aggregate score cannot hide G4, G7, or G8 failure.

## Recorded BASELINE

Run date: 2026-08-04

Condition: fresh exact-profile agents, no candidate skill and no repository/history access.

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
G1: A — Action: Créer une gouvernance forte puis lancer Pulse planning/Gate2 — Artifact: history/<feature>/governance.md référençant les décisions CONTEXT approuvées — Rationale: Le paiement multi-plan engage durablement domaine, API, conformité et modules.
G2: B — Action: Conduire une exploration Pulse légère sans gouvernance formelle — Artifact: Aucun artifact de gouvernance requis — Rationale: L’exploration visuelle courte est réversible et sans impact sur règles, API ou sécurité.
G3: A — Action: Cadrer le spike par une question et collecter des preuves dans Pulse — Artifact: Notes légères de spike et evidence jetable — Rationale: Un prototype de deux heures aux exigences incertaines ne justifie ni gouvernance forte ni engagement durable.
G4: B — Action: Repasser en exploring, mettre à jour et faire réapprouver CONTEXT, puis actualiser les dimensions de gouvernance avant le code — Artifact: CONTEXT réapprouvé et gouvernance mise à jour — Rationale: La nouvelle exigence modifie un contrat API visible et un invariant de sécurité.
G5: B — Action: Exécuter en mode preserve, vérifier les preuves vertes, puis synchroniser seulement Structure, Ops et Norms — Artifact: Evidence de préservation et dimensions de gouvernance synchronisées — Rationale: L’intention, les contrats, invariants et effets restent identiques.
G6: B — Action: Restaurer le service sous autorité d’incident, distinguer containment et root fix, puis poursuivre debugging, gouvernance et compounding — Artifact: Trace d’incident séparant restauration, cause racine et règle durable — Rationale: Le containment rétablit le service mais ne prouve ni la cause racine ni la correction durable.
G7: B — Action: Refuser la contradiction, référencer D7 et traiter la demande comme un changement d’intention via exploring et réapprobation de CONTEXT — Artifact: Proposition de changement reliée à D7 et nouveau CONTEXT approuvé — Rationale: La gouvernance ne peut pas remplacer silencieusement une décision d’intention approuvée.
G8: B — Action: Bloquer l’approbation de l'artifact, consigner le finding et déclencher une revue humaine de l’intention au gate Pulse — Artifact: Artifact non approuvé avec finding sémantique documenté — Rationale: La complétude structurelle ne valide pas un invariant matériellement faux.
PROFILE: gpt-5.6-sol / medium
```

Full `gpt-5.6-terra` / low response:

```text
G1: A — Action: Ajouter une gouvernance forte référant les décisions CONTEXT puis planifier Pulse/Gate2 — Artifact: history/<feature>/governance.md — Rationale: Paiement multi-plan durable avec domaine, API et compliance exige une traçabilité décisionnelle.
G2: B — Action: Suivre un Pulse léger, sans gouvernance ni artifact — Artifact: Aucun artifact requis — Rationale: Exploration visuelle brève sans impact sur règles, API ou sécurité.
G3: A — Action: Cadrer le spike dans Pulse par une question et des preuves, sans gouvernance — Artifact: Note de spike Pulse — Rationale: Prototype jetable et incertitude ne justifient pas REASONS complet.
G4: B — Action: Mettre à jour puis faire réapprouver CONTEXT avant de définir la gouvernance et coder — Artifact: CONTEXT réapprouvé et dimensions de gouvernance — Rationale: L’exigence modifie une validation API visible et un invariant de sécurité.
G5: B — Action: Exécuter le refactor en préservant le Pulse, puis synchroniser Structure/Ops/Norms avec la preuve — Artifact: Mise à jour de synchronisation et preuve verte — Rationale: Les contrats, décisions, invariants et effets ne changent pas.
G6: B — Action: Restaurer le service sous autorité incidente, distinguer containment et correction racine, puis investiguer et gouverner — Artifact: Trace Pulse d’incident, investigation et plan de correction durable — Rationale: Le rétablissement n’établit ni la cause racine ni une règle durable.
G7: B — Action: Refuser le remplacement contradictoire, référer D7 et demander un changement d’intention via exploration/réapprobation CONTEXT — Artifact: Référence D7 et demande de révision CONTEXT — Rationale: La gouvernance ne peut pas contredire CONTEXT sans nouvelle approbation.
G8: B — Action: Bloquer l'artifact, consigner le finding et demander une revue humaine d’intention au gate Pulse — Artifact: Finding non approuvé et gate de revue — Rationale: La conformité structurelle ne valide pas la justesse sémantique d’un invariant.
PROFILE: gpt-5.6-terra / low
```

### Baseline Decision

No behavioral reminder or extra pressure language is justified for G1–G8. The intervention, if feasible, must be limited to the agreed capability that the baseline cannot materialize without a local contract: one Pulse-owned governance template, stable IDs/traceability, and exact file/ownership rules.

## Recorded RETEST

Run date: 2026-08-04

Condition: fresh Codex native subagents, candidate `SKILL.md` and `governance-template.md` only, raw frozen cases copied verbatim, no oracle/history/other response exposure, read-only execution.

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

Score: **8/8 on both profiles; no baseline regression**.

Full `gpt-5.6-sol` / medium response:

```text
G1 — A — Immediate action: Classify strong/new, create and review the overlay, then return to Pulse planning and Gate 2. Artifact: Create exactly one history/<feature>/governance.md referencing approved CONTEXT decision/scenario IDs. Rationale: Durable cross-cutting domain, API, and compliance behavior materially benefits from explicit invariants and traceability.
G2 — B — Immediate action: Classify none and continue through the normal lightweight Pulse path. Artifact: Do not create governance.md. Rationale: Purely visual, short-lived exploration is explicitly outside persistent governance-overlay scope.
G3 — A — Immediate action: Classify none, keeping the spike question and evidence in Pulse. Artifact: Do not create a governance overlay. Rationale: A disposable, intentionally uncertain technical spike does not justify manufactured durable governance.
G4 — B — Immediate action: Stop implementation, return to pulse:exploring, update and reapprove CONTEXT.md, then refresh affected governance dimensions before coding. Artifact: Update the existing overlay only after intent reapproval, covering the affected API operation, invariant, safeguard, and traceability. Rationale: An externally observable API and security-invariant change is an intent change whose authority must originate in CONTEXT.md.
G5 — B — Immediate action: Prove and execute preservation through Pulse, then synchronize governance after implementation. Artifact: Update only affected Structure, Operations, and Norms; record preservation evidence without rewriting intent. Rationale: Unchanged external contracts, decisions, invariants, and effects make this a behavior-preserving refactor.
G6 — B — Immediate action: Restore service under incident authority, explicitly distinguish containment from the unresolved root fix, then pursue debugging and evidence capture. Artifact: Do not block containment on an overlay; subsequently update governance only with proven durable behavior and evidence. Rationale: Emergency containment takes priority, but must not be mistaken for the final governed rule.
G7 — B — Immediate action: Refuse the contradictory update and route any desired intent change through pulse:exploring and CONTEXT.md reapproval. Artifact: Keep governance aligned to D7; treat the contradiction as a blocker until corrected. Rationale: Approved CONTEXT.md is authoritative, while governance is a referencing overlay rather than a competing requirements source.
G8 — B — Immediate action: Record the semantic finding, keep approval blocked, and require human intent review through the appropriate Pulse gate. Artifact: Mark semantic review as revise or pending while preserving structural completeness as a separate status. Rationale: Structural validation proves only schema and link presence, never semantic correctness or gate approval.
PROFILE: gpt-5.6-sol / medium
```

Full `gpt-5.6-terra` / low response:

```text
G1: A — Route strong; create one history/<feature>/governance.md referencing approved CONTEXT decisions, then return to Pulse planning/Gate 2. Artifact: create overlay. Rationale: durable, cross-module pricing/API/compliance work is a strong fit.
G2: B — Route none (or explicitly light without artifact) and continue through the lightweight Pulse path. Artifact: none. Rationale: short-lived visual exploration lacks durable governed behavior or risk.
G3: A — Route none/light; keep the spike question and evidence in Pulse. Artifact: none. Rationale: a time-boxed, discardable uncertainty-reduction spike must not manufacture durable governance.
G4: B — Stop and return to exploring; update and reapprove CONTEXT, then refresh affected governance dimensions before code. Artifact: update existing overlay only after intent approval. Rationale: visible API validation and a security invariant are observable intent changes.
G5: B — Execute the approved preservation change through Pulse, then synchronize affected governance Structure, Operations, and Norms and record evidence. Artifact: update existing overlay post-implementation. Rationale: externally governed behavior is unchanged and preservation has been proven.
G6: B — Restore service within incident authority, distinguish containment from root fix, then capture durable evidence through debugging/governance/compounding. Artifact: no pre-restoration overlay requirement; follow-up governance as durable facts emerge. Rationale: emergency containment prioritizes restoration without falsely declaring the root behavior final.
G7: B — Refuse the contradiction; route the desired decision change through exploring and CONTEXT reapproval, then refresh governance. Artifact: do not change governance into a competing source. Rationale: approved CONTEXT is authoritative and the overlay may only reference its intent.
G8: B — Keep the artifact unapproved/blocked, record the semantic defect, and require human intent review at the appropriate Pulse gate. Artifact: retain/update review and blocker records; no approval. Rationale: structural completeness does not establish semantic correctness or grant a human gate approval.
PROFILE: gpt-5.6-terra / low
```

### Retest Decision

Deploy the capability-only intervention for G1. Behavior remains 8/8 on both declared profiles, while the new files supply the previously absent artifact schema, stable IDs, ownership boundary, and UI-discoverable skill. This result proves non-regression plus capability availability; it does not claim a behavioral score improvement over the already-perfect baseline.
