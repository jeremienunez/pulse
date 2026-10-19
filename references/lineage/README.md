# Pulse Lineage and Adaptation Boundaries

Pulse is a single, independently packaged workflow. Upstream projects informed selected behaviors; they are not vendored wholesale and do not create parallel lifecycle authorities inside Pulse.

## Superpowers

- Source: [obra/superpowers](https://github.com/obra/superpowers)
- Evaluated source version: `5.1.3`
- License: MIT, copyright Jesse Vincent
- Adapted into Pulse: safe worktree-isolation behavior; selected root-cause tracing, condition-based waiting, and defense-in-depth guidance; and the pressure-scenario method used for controlled skill evaluation.
- Preserved as evaluation/provenance material: testing anti-pattern cases and review prompts. Passing baseline cases did not justify importing standalone skills or full workflows.
- Not imported: the complete Superpowers lifecycle, its TDD ceremony, parallel-dispatch workflow, plan-execution workflow, or generic brainstorming workflow.

Pulse owns the resulting skills and routing. In particular, `worktree-isolation` is a bounded support skill, `systematic-debug-fix` remains the debugging owner, and `writing-pulse-skills` uses `BASELINE → INTERVENTION → RETEST` rather than destructive test-first ordering.

## SPDD Codex Skills

- Source pack: `spdd-codex-skills`
- Evaluated source version: `1.0.0`
- License: MIT, copyright SPDD Codex Skills contributors
- Adapted into Pulse: fitness/change routing, REASONS, `OP-n` operation identifiers, safeguards, and traceability checks.
- Integration boundary: these concepts live in the optional `governed-feature` overlay. Pulse `CONTEXT.md` remains authoritative, and Pulse Gates 1–4 retain approval ownership.
- Not imported: the source pack's 15-skill lifecycle, a second state machine, or its Python workspace/runtime.

## Impeccable

- Source: [pbakaus/impeccable](https://github.com/pbakaus/impeccable), skill/plugin `4.5.2`, commit `245ad82def45831dc56a21b683c7a1ff530b06cc`.
- License: Apache-2.0, included with the modified adaptation and notices in `skills/design/`.
- Adapted into Pulse: selected web framing, craft and observed-review methods in one on-demand support skill; Pulse keeps artifacts, gates and revisions.
- Excluded: engine/detectors, hooks, vendor agents, state, native-platform guides and full catalogue import.
- [Source paths/hashes, changes and diagnostic adoption boundary](../../docs/design/impeccable-provenance.md).

## Awwwards / jury

- Source: [juliobsz/skills](https://github.com/juliobsz/skills/tree/f193f6745aae738e9d54a0ca28792822e4777a63), commit `f193f6745aae738e9d54a0ca28792822e4777a63`.
- Licence: MIT, copyright 2026 Julio (juliobsz); [exact licence](../../skills/design/LICENSE.juliobsz-skills) and [notice](../../skills/design/NOTICE).
- Retained: substantive design directions, examples, numbers, code recipes and exceptions in 18 on-demand references covering 19 text sources. The generated quality-bar copy is deduplicated against the canonical jury source. Both master skills' own directions remain available.
- Adapted locally: artefacts/ownership, authorised critic routing, historical calibration status and specific documented recipe discordances. An [exact operation ledger and source mapping](../../docs/design/awwwards-provenance.md) make the differences assessable; byte reconstruction alone does not approve their meaning.
- External: helper scripts, framework/rendering installations, provider accounts and the upstream delivery lifecycle. Recipe text is not an installed or locally qualified engine.
- [Evaluation and limits](../../docs/evaluation/awwwards-design-integration.md) preserve the current cycle's explicit human source-proposal path; behavioural baseline/retest are not executed and automatic promotion remains false.

## REA

- Source: [morluto/rea](https://github.com/morluto/rea), guidance commit `d5fc7e6ebf9af050081fc4c6e18b9079cfaa5cdc`.
- License: MIT, copyright 2026 morluto; [license](../../skills/reverse-engineering/LICENSE), [modification notice](../../skills/reverse-engineering/NOTICE) and [source hashes](../../skills/reverse-engineering/references/rea-source-lock.json) are preserved.
- Adapted: a short support entry with target-specific investigation, connection and original Evidence recipes. Pulse retains the delivery lifecycle; REA retains its technical sessions and ledger.
- Excluded: engine/provider implementations, package dependencies, submodules, automatic installation/registration and upstream orchestration choices.
- [Local evaluation and qualification limits](../../docs/evaluation/reverse-engineering.md). A published CLI package and upstream guidance commit are separate identities; feature parity is not assumed.

## Other Influences

- [Khuym](https://github.com/hoangnb24/skills/tree/main) informed much of the validate-first chain and Flywheel-style bead workflow.
- [Agent Flywheel](https://agent-flywheel.com/complete-guide) informed beads, graph-aware triage, and execution coordination.
- [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) informed specialist review and the compound-learning loop.
- [GSD](https://github.com/gsd-build/get-shit-done) informed the discuss, research, plan, and verify-before-execution philosophy.

This record describes provenance, not permanent model compatibility. Pulse publishes compatibility only through replayable certification for an exact declared model/profile tuple.
