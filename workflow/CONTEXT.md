# Pulse ICM Router

Pulse 4 uses the filesystem as its primary orchestration surface. The canonical delivery graph has six numbered stages. The active `run.json`, declared stage inputs, output files, and content-bound human gates determine what happens next.

Start every new project task through this router, including a small edit, a disposable prototype or an unclear idea. Detect and initialize ICM before producing project, prototype or brainstorming artifacts. Reuse the matching active run instead of creating one per session. The model, task size and intended lifetime do not change this entry rule.

Do not invoke `pulse:preflight` unless the user explicitly requests it. Preflight is a manual diagnostic outside the delivery graph.

## Inputs

- User request and repository instructions.
- `.pulse/active-run` when present.
- The referenced `history/<feature>/run.json` for an active ICM v2 run.
- Legacy `.pulse` state and handoffs only when no v2 run is active or the user explicitly resumes legacy work.

## Process

1. Resolve the plugin root from this installed skill and run `node <plugin-root>/workflow/scripts/pulse_icm.mjs status --repo-root <repo-root>`.
2. On `icm-v2`, route strictly from `current_stage`; do not infer another skill from prose or stale mirrors.
3. On `legacy-v1`, surface the saved work. Resume through `references/legacy-v1.md` when the user chooses resume. For a clearly new feature, initialize a distinct v2 run instead of rewriting legacy history.
4. On `conflict`, stop and present both active surfaces. Never choose or rewrite one automatically.
5. On `none`, shape a lowercase feature slug and initialize the run with `node <plugin-root>/workflow/scripts/pulse_icm.mjs init --repo-root <repo-root> --feature <slug> --request '<request>'`.
6. Load only the contract and artifacts for the selected stage. Stable project rules are references; run outputs are working artifacts.
7. Human gates remain explicit. A recommendation or output file never counts as approval.

## Recorded revisions

Resume unchanged work from its current stage and recorded handoff. When a requested correction reopens finished work, use the ICM helper's `revise` command before editing artifacts; there is no `rewind` or `recover-revision` command. Resolve the plugin and repository roots as above.

```bash
node <plugin-root>/workflow/scripts/pulse_icm.mjs revise --repo-root <repo-root> --stage <target-stage> --reason '<requested correction>'
```

Choose the earliest stage whose approved content must change:

| Target | Retained approvals | Reset approvals |
| --- | --- | --- |
| `01_explore` (intent or decisions) | none | G1, G2, G3, G4 |
| `02_plan` (scope or graph) | G1 | G2, G3, G4 |
| `03_validate` (feasibility or strategy) | G1, G2 | G3, G4 |
| `04_execute` (repair inside the approved scope) | G1, G2, G3 | G4 |
| `05_review` (review evidence only) | G1, G2, G3 | G4 |

For `04_execute`, add `--nodes <id,id>` naming the affected approved nodes. Their dependent nodes reopen too; independent completed nodes stay complete. The helper archives the superseded outputs with hashes before changing the run. Plan/decision revisions discard the old active execution state. A stale gate is not approval: revise its owning stage and obtain the required content-bound approvals again. Existing user authorization remains usable only for the content and scope it actually covers.

If status is blocked with `revision_prepared`, read the recorded revision manifest and use its exact 64-character revision ID:

```bash
node <plugin-root>/workflow/scripts/pulse_icm.mjs revise --repo-root <repo-root> --recover <revision-id>
```

Recovery verifies archive and live-file bindings and refuses a live owner or mismatched files. Do not force it, edit lifecycle state by hand, or replay product/provider effects. Re-read status after revision or recovery and load the newly selected stage.

A completed run remains immutable. For a new request that builds on it, initialize a distinct feature with `init ... --from-run history/<parent>/run.json`; a completed active run is also the default parent. The successor references verified parent artifacts and starts with fresh gates. Parent approval never approves successor content.

## Proportionate preparation

Simple work and prototypes stay inside the same ICM cycle. Keep decisions short, use one graph node when sufficient, and verify the actual behavior with the project's existing tools. Record the prototype's purpose, limits and disposal path. Do not require a new framework, a large specification, Beads, swarm or legacy onboarding merely to make it count as Pulse work.

Use the existing human approvals; do not add new confirmation rounds for choices already authorized. Readiness checks apply to the capabilities the selected work actually needs. A prototype is neither an exemption from ICM nor an automatic reason to run the optional full preflight diagnostic.

Support routing remains explicit and outside the six-stage delivery graph:

- "Note this learning from this conversation" → `pulse:dev-note`.
- "Distill accumulated dev notes for reading" → `pulse:dev-note-distil`.
- "Consolidate runtime artifacts into machine memory" → `pulse:dream`.
- "Capture post-cycle machine learnings" → `pulse:compounding`.

## Outputs

- A new `history/<feature>/run.json` and six-stage output layout, or a precise resume/status brief.
- Exactly one next stage selected from the canonical graph.
- No v2 writes to legacy state mirrors, global handoffs, or checkpoints.

## Exit

- Route to `pulse:exploring` for `01_explore`, `pulse:planning` for `02_plan`, `pulse:validating` for `03_validate`, `pulse:executing` for `04_execute`, `pulse:reviewing` for `05_review`, or `pulse:compounding` for `06_compound`.
- For `complete`, report completion and the final `run.json` path.
- For conflict or failed revision bindings, stop without mutation. For stale approval, route through a recorded revision of the owning stage and the required approvals.
