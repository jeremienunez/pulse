<!-- PULSE:START -->
# Pulse Workflow

Use `pulse:using-pulse` first in this repo unless you are resuming an already approved Pulse handoff.

## What Pulse Is / Is Not

Pulse is a validate-first, docs-first skill workflow for Claude Code and Codex.
Pulse is not a license to skip `CONTEXT.md`, validating, review gates, or human approval.

## One-Line Glossary

- `CONTEXT.md` — locked decisions downstream work must honor.
- `work-shape.md` / `phase-plan.md` / `epic-map.md` — approved planning shape artifact.
- current-work artifact — execution-ready slice (`work-shape.md` section, `current-story-pack.md`, or `phase-<n>-contract.md` + `phase-<n>-story-map.md`).
- story map — the reason beads are sequenced the way they are.
- bead — one worker-sized unit of work with exact files and checks.
- handoff — the pause/resume contract for the next actor.
- `pulse_status` — the read-only scout for current workflow state.

## Startup

1. Read this file at session start and again after any context compaction.
2. If preflight readiness is missing/stale/blocked in `.pulse/tooling-status.json`, stop and run `pulse:using-pulse` before continuing.
3. If `.pulse/scripts/pulse_status.mjs` exists, use `node .pulse/scripts/pulse_status.mjs --json` for a fast read-only status snapshot.
4. If `.pulse/handoffs/manifest.json` exists, do not auto-resume. Surface the saved state and wait for user confirmation.
5. If `.pulse/memory/critical-patterns.md` exists, read it before planning or execution work.

## Chain

```
pulse:preflight
  → pulse:using-pulse
  → pulse:exploring
  → pulse:planning
  → pulse:validating
  → pulse:swarming
  → pulse:executing
  → pulse:reviewing
  → pulse:compounding
```

## Critical Rules

1. Never execute without validating.
2. `CONTEXT.md` is the source of truth for locked decisions.
3. If context usage passes roughly 65%, write `.pulse/handoffs/manifest.json` and pause cleanly.
4. Treat `.pulse/state.json` as the routing mirror and `.pulse/STATE.md` as the human-readable narrative; keep them aligned.
5. After compaction, re-read `AGENTS.md`, run `node .pulse/scripts/pulse_status.mjs --json` if present, then re-open `.pulse/handoffs/manifest.json`, `.pulse/state.json`, `.pulse/STATE.md`, and the active feature context before more work.
6. P1 review findings block merge.

## 3-Plane Model

1. **Control plane — `.pulse/`**: live workflow state, routing mirrors, handoffs, and operator surfaces.
2. **Memory plane — `.pulse/memory/`**: shared root for reusable cross-feature memory, including critical patterns, learnings, corrections, and ratchet artifacts.
3. **Feature record plane — `history/`**: feature-specific decisions, plans, contracts, story maps, and durable narrative.

## Working Files

```
.pulse/
  onboarding.json     ← onboarding state for the Pulse plugin
  state.json          ← machine-readable routing/status mirror
  STATE.md            ← approved current-work focus
  handoffs/
    manifest.json     ← pause/resume artifact
  memory/             ← shared reusable memory root
    critical-patterns.md ← globally promoted patterns
    learnings/          ← durable cross-feature learning entries
    corrections/        ← durable corrections to prior guidance
    ratchet/            ← durable quality bars and non-regression rules

history/<feature>/
  CONTEXT.md          ← locked decisions
  discovery.md        ← research findings
  approach.md         ← approach + risk map

.beads/               ← bead/task files when beads are in use
.spikes/              ← spike outputs when validation requires them
```

## Operator Cookbook

### Startup scout

1. Run `pulse:using-pulse` if preflight readiness is missing, stale, or blocked.
2. Run `node .pulse/scripts/pulse_status.mjs --json` when available.
3. Use the scout to choose the next artifact instead of opening everything at once.

### Resume scout

- If `.pulse/handoffs/manifest.json` exists, surface it and wait for explicit confirmation.
- Re-open the handoff plus `.pulse/state.json` and `.pulse/STATE.md` before continuing.
- If current state and a handoff disagree, surface the mismatch instead of guessing.

### Swarm vs single-worker

- Use swarm when approved current work has enough parallelizable beads to justify coordination overhead.
- Use single-worker when approved current work still needs Pulse discipline but parallelism is not.
- Gate 3 still blocks both modes until validating approves execution.

## Codex Guardrails

- Repo-local `.codex/` files installed by Pulse are workflow guardrails, not optional decoration.
- Use `node .pulse/scripts/pulse_status.mjs --json` as the preferred quick scout step when it is available.
- Treat `compact_prompt` recovery instructions as mandatory.
- Use `bv` only with `--robot-*` flags. Bare `bv` launches the TUI and should be avoided in agent sessions.
- If the repo is only partially onboarded, stay in bootstrap/planning mode and surface what is missing before implementation.

## Session Finish

Before ending a substantial Pulse work chunk:

1. Update or close the active bead/task if one exists.
2. Leave `.pulse/state.json`, `.pulse/STATE.md`, and `.pulse/handoffs/` consistent with the current pause/resume state.
3. Mention any remaining blockers, open questions, or next actions in the final response.
<!-- PULSE:END -->
