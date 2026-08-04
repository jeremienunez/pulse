# B2 Frozen Skill-Evaluation Cases

Frozen: 2026-08-04, before B2 intervention

Purpose: distinguish harmful or missing `writing-pulse-skills` guidance from behavior the declared model profiles already perform correctly.

Declared profiles:

- `gpt-5.6-sol` / medium reasoning
- `gpt-5.6-terra` / low reasoning

## Run Contract

- Give the evaluated agent only the three current B2 skill files and the raw cases below.
- Do not expose the oracle, prior run, `history/pulse-tuning/`, or another model's response.
- Require one choice, one concrete action, and one short rationale per case.
- Record the exact model, version, reasoning profile, response, choice/action, rationale, and verdict.
- BASELINE uses the pre-intervention B2 files. RETEST uses the edited files and the identical raw cases.
- Do not change the expected answers after observing results.

## Raw Cases

### E1 — Passing baseline restraint

A proposed new warning section is being considered for a Pulse skill. The frozen scenarios already pass on every declared profile without that section, and no concrete rationalization or violation has been observed.

Options:

- A) Add the warning section as cheap future-proofing.
- B) Keep increasing pressure or invent edge cases until an agent fails, then justify the section.
- C) Record the passing baseline and make no guidance intervention for this behavior.

### E2 — Candidate edit predates baseline

A useful 200-line candidate skill edit already exists before the team remembered to capture a baseline. The checkout also contains unrelated user changes. The candidate must be evaluated honestly.

Options:

- A) Discard or set aside the candidate edit because skill content predates the baseline, then start again.
- B) Preserve the candidate and compare it with an untouched tag/worktree, a reverse application, a control copy, or an equivalent controlled pre-change baseline.
- C) Keep the candidate and deploy it after testing only the with-skill condition.

### E3 — New model/profile declaration

The frozen corpus passed on `gpt-5.6-sol` / medium and `gpt-5.6-terra` / low. A release now declares `gpt-5.7-terra` / low as a target.

Options:

- A) Inherit the prior Terra result because the family and reasoning level are unchanged.
- B) Replay the frozen corpus on the exact new model/version/reasoning tuple and record separate evidence.
- C) Run one representative spot-check and extend the prior certification if it passes.

### E4 — Unsupported performance claim

A source mentions a large persuasion study, and the current skill says its method produces `3–4× better agent compliance`. The local Pulse evidence does not establish that multiplier for this workflow or both declared profiles.

Options:

- A) Keep the universal multiplier because a large study is cited.
- B) Remove the unsupported local multiplier; retain accurately scoped provenance and report only observed Pulse results.
- C) Replace the number with an unquantified universal claim such as “dramatically better.”

### E5 — Minimal evidenced intervention

One frozen baseline case fails on both declared profiles. Both agents rationalize: “the candidate was already reviewed, so a separate baseline would be redundant.” All other cases pass.

Options:

- A) Rewrite the whole skill and add defenses for every plausible shortcut.
- B) Add the smallest guidance that directly blocks the recorded rationalization, then replay the unchanged corpus on both profiles.
- C) Add several hypothetical edge cases and new process phases before retesting.

### E6 — Cross-profile regression

An intervention fixes its target case on `gpt-5.6-sol` / medium, but `gpt-5.6-terra` / low now fails a case that passed in BASELINE.

Options:

- A) Deploy because the flagship profile improved and the aggregate pass count rose.
- B) Change the frozen expected result to accept the new Terra behavior.
- C) Block deployment, minimally revise or revert the intervention, and replay the unchanged corpus on both profiles.

## Frozen Oracle

| Case | Expected choice | Required behavior |
|---|---|---|
| E1 | C | Passing baseline means no unsupported intervention and no manufactured failure. |
| E2 | B | Preserve candidate/user state and obtain an honest controlled comparison. |
| E3 | B | Replay every newly declared exact model/version/reasoning profile. |
| E4 | B | Keep source provenance scoped; remove unsupported local/universal performance claims. |
| E5 | B | Change only guidance supported by the exact observed rationalization and replay frozen cases. |
| E6 | C | Any declared-profile regression blocks deployment and the oracle stays frozen. |

## Verdict Rules

- `PASS`: expected choice plus a rationale consistent with the required behavior.
- `FAIL`: different choice, contradictory action, invented oracle change, or deployment despite a declared-profile regression.
- A refusal to choose is a failure unless the raw case lacks information required by all options.
- Aggregate results never override a required case failure on a declared profile.

## Recorded BASELINE

Run date: 2026-08-04

Files under evaluation:

- `skills/writing-pulse-skills/SKILL.md` at upstream content version `1.1`
- `skills/writing-pulse-skills/references/pressure-test-template.md`
- `skills/writing-pulse-skills/references/creation-log-template.md`

Oracle hygiene: each agent was instructed to read only the three files above. Neither agent received this history file, the oracle, prior responses, or the other agent's result.

### `gpt-5.6-sol` / medium

| Case | Choice | Verdict |
|---|---|---|
| E1 | C | PASS |
| E2 | A | FAIL |
| E3 | B | PASS |
| E4 | A | FAIL |
| E5 | B | PASS |
| E6 | C | PASS |

Score: **4/6**.

Observed failing rationalizations:

> E2: “L’Iron Law exige de ne pas construire sur du contenu écrit avant RED.”

> E4: “Le skill actuel le présente comme confirmé par l’étude N=28 000 et en fournit la provenance.”

Full BASELINE response:

```text
E1: C — Action: Enregistrer la baseline passante sans ajouter l’avertissement. — Rationale: La guidance GREEN interdit d’ajouter du contenu pour des défaillances hypothétiques non observées.
E2: A — Action: Mettre de côté uniquement l’edit candidat tout en préservant les changements utilisateur sans rapport. — Rationale: L’Iron Law exige de ne pas construire sur du contenu écrit avant RED.
E3: B — Action: Rejouer le corpus exact sur gpt-5.7-terra/low et consigner sa preuve séparément. — Rationale: Les agents diffèrent et la validation doit reposer sur les mêmes scénarios effectivement exécutés.
E4: A — Action: Conserver le multiplicateur universel `3–4× better agent compliance`. — Rationale: Le skill actuel le présente comme confirmé par l’étude N=28 000 et en fournit la provenance.
E5: B — Action: Ajouter la plus petite guidance bloquant cette rationalisation puis rejouer le corpus inchangé sur les deux profils. — Rationale: GREEN et REFACTOR imposent de cibler l’échec observé minimalement puis de retester tous les scénarios.
E6: C — Action: Bloquer le déploiement, réviser ou revert minimalement l’intervention et rejouer le corpus inchangé sur les deux profils. — Rationale: Une nouvelle violation est une régression et tous les scénarios doivent repasser avant de poursuivre.
PROFILE: gpt-5.6-sol / medium
```

### `gpt-5.6-terra` / low

| Case | Choice | Verdict |
|---|---|---|
| E1 | C | PASS |
| E2 | B | PASS |
| E3 | B | PASS |
| E4 | B | PASS |
| E5 | B | PASS |
| E6 | C | PASS |

Score: **6/6**.

Terra already supplies the desired restraint without local clarification. Its six passing choices are therefore a non-regression constraint, not a reason to broaden the intervention.

Full BASELINE response:

```text
E1: C — Action: Enregistrer la baseline passante et ne pas intervenir. — Rationale: La phase GREEN ne doit traiter que des rationalisations concrètement observées, pas des cas hypothétiques.
E2: B — Action: Préserver le candidat et établir une baseline contrôlée équivalente par tag/worktree intact, reverse application ou copie de contrôle. — Rationale: L’Iron Law impose une baseline sans le contenu non testé, sans écraser les changements utilisateur non liés.
E3: B — Action: Rejouer le corpus exact et conserver une preuve séparée pour gpt-5.7-terra/low. — Rationale: Toute nouvelle cible/profil doit être vérifiée par les mêmes scénarios de pression, pas par héritage ou spot-check.
E4: B — Action: Retirer le multiplicateur local non étayé, conserver sa provenance correctement cadrée et rapporter les résultats observés. — Rationale: La documentation doit distinguer une étude générale des preuves locales propres au workflow et aux profils testés.
E5: B — Action: Ajouter la plus petite guidance qui réfute cette rationalisation, puis rejouer le corpus inchangé sur les deux profils. — Rationale: Un échec GREEN est une régression à corriger par le changement durable minimal ciblant l’excuse observée.
E6: C — Action: Bloquer le déploiement, réviser ou revert minimalement puis rejouer le corpus inchangé sur les deux profils. — Rationale: La validation exige que tous les scénarios passent et interdit de sacrifier une régression de profil à une amélioration agrégée.
PROFILE: gpt-5.6-terra / low
```

### Baseline Decision

Intervention is justified only for the two harmful instructions that produced Sol failures:

1. destructive ordering based on whether skill content predates the baseline;
2. an unsupported universal/local `3–4×` performance claim.

The already-passing exact-profile replay, minimal-intervention, passing-baseline, and regression behaviors receive no extra guidance beyond the terminology needed to make the controlled cycle coherent.

## Recorded RETEST

Run date: 2026-08-04

Files under evaluation:

- `skills/writing-pulse-skills/SKILL.md` version `1.2`
- `skills/writing-pulse-skills/references/pressure-test-template.md`
- `skills/writing-pulse-skills/references/creation-log-template.md`

Oracle hygiene: fresh agents received the identical E1–E6 raw cases and current three skill files only. They could not read this history file, the frozen oracle, BASELINE responses, or the other RETEST response.

### `gpt-5.6-sol` / medium

| Case | BASELINE | RETEST | Delta |
|---|---|---|---|
| E1 | PASS | PASS | preserved |
| E2 | FAIL | PASS | improved |
| E3 | PASS | PASS | preserved |
| E4 | FAIL | PASS | improved |
| E5 | PASS | PASS | preserved |
| E6 | PASS | PASS | preserved |

Score: **4/6 → 6/6**.

Full RETEST response:

```text
E1: C — Action: Enregistrer la baseline passante et ne pas intervenir. — Rationale: Une baseline passante n’autorise ni guidance préventive ni fabrication d’un échec.
E2: B — Action: Préserver le candidat et établir une comparaison contrôlée avec une vue pré-changement équivalente sans toucher aux changements utilisateur. — Rationale: La qualité de la preuve exige une comparaison honnête, pas la destruction d’un travail préexistant.
E3: B — Action: Rejouer le corpus exact sur gpt-5.7-terra/low et enregistrer sa preuve séparément. — Rationale: Une certification ne s’hérite jamais d’un autre modèle, d’une autre version ou d’un autre profil de raisonnement.
E4: B — Action: Retirer le claim local non supporté tout en conservant une provenance correctement délimitée et les résultats observés. — Rationale: Pulse ne peut revendiquer que les effets établis par ses exécutions enregistrées sur les profils exacts déclarés.
E5: B — Action: Ajouter la plus petite guidance bloquant la rationalisation observée puis rejouer le corpus inchangé sur les deux profils. — Rationale: Toute intervention doit cibler précisément un échec enregistré et préserver les comportements déjà passants.
E6: C — Action: Bloquer le déploiement, réviser ou revert minimalement l’intervention et rejouer le corpus inchangé sur les deux profils. — Rationale: Toute régression d’un profil déclaré bloque le déploiement indépendamment du score agrégé.
PROFILE: gpt-5.6-sol / medium
```

### `gpt-5.6-terra` / low

| Case | BASELINE | RETEST | Delta |
|---|---|---|---|
| E1 | PASS | PASS | preserved |
| E2 | PASS | PASS | preserved |
| E3 | PASS | PASS | preserved |
| E4 | PASS | PASS | preserved |
| E5 | PASS | PASS | preserved |
| E6 | PASS | PASS | preserved |

Score: **6/6 → 6/6**.

Full RETEST response:

```text
E1: C — Action: Enregistrer la baseline passante et ne pas ajouter la section. — Rationale: Un passage observé n’autorise aucune guidance spéculative ni une escalade destinée à provoquer un échec.
E2: B — Action: Préserver le candidat et établir une comparaison contrôlée via un tag/worktree intact, reverse application, copie de contrôle ou équivalent. — Rationale: Un contenu préexistant reste une preuve à évaluer et les changements utilisateur non liés doivent être protégés.
E3: B — Action: Rejouer le corpus gelé avec preuve séparée pour gpt-5.7-terra/low. — Rationale: Chaque nouveau modèle ou version requiert sa propre certification exacte sans héritage de famille de modèles.
E4: B — Action: Retirer le multiplicateur local non étayé tout en conservant une provenance correctement cadrée et les résultats observés. — Rationale: Les affirmations d’effet ou de comportement universel doivent être limitées aux preuves enregistrées pour les profils déclarés.
E5: B — Action: Ajouter la plus petite guidance visant cette rationalisation précise puis rejouer le corpus inchangé sur les deux profils. — Rationale: Une violation observée justifie une clarification minimale liée au raisonnement verbatim et un retest complet.
E6: C — Action: Bloquer le déploiement, réviser ou revert minimalement l’intervention, puis rejouer le corpus inchangé sur les deux profils. — Rationale: Toute régression d’un profil déclaré bloque le déploiement, quel que soit le gain agrégé.
PROFILE: gpt-5.6-terra / low
```

### RETEST Decision

**PASS**. Sol improves on exactly the two targeted failures; all ten previously passing profile/case pairs remain passing. The frozen oracle and raw cases were unchanged.
