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

## Other Influences

- [Khuym](https://github.com/hoangnb24/skills/tree/main) informed much of the validate-first chain and Flywheel-style bead workflow.
- [Agent Flywheel](https://agent-flywheel.com/complete-guide) informed beads, graph-aware triage, and execution coordination.
- [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) informed specialist review and the compound-learning loop.
- [GSD](https://github.com/gsd-build/get-shit-done) informed the discuss, research, plan, and verify-before-execution philosophy.

This record describes provenance, not permanent model compatibility. Pulse publishes compatibility only through replayable certification for an exact declared model/profile tuple.
