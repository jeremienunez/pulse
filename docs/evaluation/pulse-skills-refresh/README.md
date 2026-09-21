# Pulse 4.0.1 local source recovery and workflow correction

## Result

Recovered the working ICM v2 source and installed-only advisory model tools into one isolated candidate. Corrected brainstorming handoff and preflight behavior, and made the operator's mandatory ICM entry rule explicit for small changes and prototypes.

The three observed failures are corrected in the frozen decision corpus: v2 brainstorming no longer writes legacy state, a late no-runtime handoff initializes ICM without overwriting an existing spec, and preflight no longer blocks a v2 single-worker prototype on unused Beads/swarm tooling.

## Evidence

- 69 deterministic tests passed, including ICM, generated contracts, onboarding, packaging, version handling and evaluator evidence binding. See `final-tests.txt`.
- Offline MCP initialize/tools-list passed with zero provider calls. The recovered server exposes `list_models`, `ask_model` and `compare_models`.
- A real temporary prototype directory, without Git or legacy onboarding, initialized and resumed ICM without creating legacy mirrors. See `prototype-bootstrap-smoke.json`. This is bootstrap evidence, not UI acceptance or a completed delivery run.
- Behavioral profile: `gpt-5.6-sol`, reasoning `high`, `codex-cli 0.155.0-alpha.2.6`, ephemeral read-only sessions. Every run used supplied source snapshots, an empty working directory, no tools, and an oracle hidden from the model. The provider exposed a model selector, not a dated backend snapshot; conclusions are scoped to these observed runs.

| Frozen case | Control | Treatment | Decision |
| --- | --- | --- | --- |
| S1 simplicity | PASS | PASS | Keep existing guidance |
| S2 vertical slices and wide migration | PASS | PASS | Keep existing guidance |
| S3 behavior tests | PASS | PASS | Keep existing guidance |
| S4 v2 brainstorming handoff | FAIL | PASS | Runtime-specific handoff |
| S5 legacy / no runtime / conflict handoff | FAIL | PASS | Initialize missing runtime, preserve legacy/conflict boundaries |
| I1 prototype startup | PASS | PASS | Preserve behavior; operator explicitly requested a model-independent entry rule |
| I2 prototype preflight | FAIL | PASS | Check only required capabilities and preserve v2 state |
| I3 compact preparation | PASS | PASS | Keep concise artifacts and explicit approvals |

The 16 full responses, rationalizations, CLI events, profiles, input hashes and verdicts are retained under `behavior-evaluation/` and `startup-evaluation/`. The second corpus was frozen separately after the operator clarified the mandatory-startup requirement. Neither original scenarios nor oracles were changed after observing responses. These are bounded action-decision tests, not a claim that every model will obey the skills in every live task.

## Intervention ownership

- `skills/brainstorming/SKILL.md`: S4/S5, correct state surface, preserve approvals, initialize through the entry router, and initialize before future brainstorming artifacts.
- `skills/preflight/SKILL.md` and its readiness matrix: I2, v2 checks scoped to the selected work, no forced legacy onboarding or state mirrors. The previous diagnostic is retained as a frozen legacy reference.
- `workflow/CONTEXT.md`, router description and managed repository guidance: the operator's explicit policy that every project task, including prototypes and small changes, enters ICM first. I1 already passed; no incremental performance claim is attached to this policy clarification.
- Existing planning, execution and review contracts remain unchanged for S1–S3. There is no wholesale upstream skill import, new hidden persistent mode, automatic gate approval or mandatory review swarm.

## Recovery fixes

See `recovery.json` for file provenance and the four reconciliation findings: the fourth MCP server in packaging, empty deleted hook directories left by the worktree overlay, explicit dependency coverage for the recovered advisory skill plus the deployed GitNexus pin, and a benchmark verifier which depended on an ignored generated helper.

The original working checkout and installed/cache copies were reference inputs. The new branch retains source version 4.0.1 independently of any deployment cachebuster. The MCP registration still targets the existing local installation path. Live OpenCode provider routing was not repaired or recertified by recovery.

## Sources studied

- [Matt Pocock skills, c55ee460](https://github.com/mattpocock/skills/tree/c55ee46073ed923f86ce59a5eb3b6d895095d1b7), MIT: useful vertical-slice and behavior-test disciplines, already demonstrated by the control profile.
- [Ponytail, e3ba2aa6](https://github.com/DietrichGebert/ponytail/tree/e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156), MIT: simplicity ladder compared with existing Pulse guidance. Its global persistence and blanket test restrictions were not imported.

No upstream skill body was copied into the runtime in this change. The research corpus and original notices remain in the separate study directory.

## Boundaries

Frontend skill selection is the next slice. The technical preflight now supports prototypes inside ICM. The existing content-bound human gates remain; no new approval-bundling mechanism has been introduced. The operator clarification question about whether “flightcheck” also meant those human checkpoints had not been answered when this report was written.

The feature run records actual operator instructions and keeps pending gates pending; no approval hashes were retroactively attributed to the operator. This report documents the tested local candidate, not a fabricated completed Pulse run or a public release certification.
