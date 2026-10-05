---
name: using-pulse
description: Use when bootstrapping or resuming work in a Pulse project, or when a request needs Pulse work-shape/current-work routing and mode-aware skill selection.
metadata:
  version: '2.3'
  ecosystem: pulse
  dependencies:
    - id: node-runtime
      kind: command
      command: node
      missing_effect: unavailable
      reason: Pulse scout and session helpers require Node.js 18+.
    - id: beads-cli
      kind: command
      command: br
      missing_effect: unavailable
      reason: Pulse execution routing needs the beads CLI; using-pulse reports its absence without invoking preflight.
    - id: beads-viewer
      kind: command
      command: bv
      missing_effect: unavailable
      reason: Pulse graph routing needs the beads viewer; using-pulse reports its absence without invoking preflight.
---

# using-pulse

Bootstrap meta-skill. Load this first to route into the correct next Pulse skill and resume safely.

Use this 3-plane model:
- **Operator plane** — user goal, approvals, active mode, and next gate.
- **Cookbook plane** — which Pulse skill to invoke next.
- **Scout plane** — repo truth: onboarding/tooling health, state mirrors, handoffs, checkpoints, and memory pointers.

This skill is a pure router + scout brief. It does not replace downstream skill contracts, write onboarding/remediation state, or manufacture runtime-readiness decisions.

## Opt-In Preflight Contract

`pulse:preflight` is an operator-invoked diagnostic, not a prerequisite or automatic workflow edge.

- Do not invoke `pulse:preflight` unless the user explicitly requests it.
- Missing or stale `.pulse/tooling-status.json` is the absence of an advisory report, not a trigger.
- If a current report exists, consume it as evidence and surface any relevant `FAIL`, `blocked`, or `DEGRADED` result without refreshing it.
- Check an immediate dependency only when the selected skill needs it; report a missing dependency locally instead of escalating to preflight.
- If dependency warnings are surfaced in preflight output, keep command-vs-MCP wording explicit:
  - `Missing commands: ...`
  - `Missing MCP server configuration: ...`

Do not run `onboard_pulse.mjs --apply` from this skill. Any onboarding or remediation change requires an explicit user request and belongs to `pulse:preflight`.

## Before Anything Else

1. If `.pulse/scripts/pulse_status.mjs` exists, run `node .pulse/scripts/pulse_status.mjs --json`.
2. Read `.pulse/tooling-status.json` only when it exists; record whether it is current or stale.
3. If the scout or readiness artifact is missing, continue with bounded direct inspection and report the missing surface. Do not invoke preflight.
4. When a current explicit preflight result exists, respect its `recommended_mode`:
   - `swarm` → `pulse:swarming` allowed
   - `single-worker` → skip swarming, use `pulse:executing`
   - `planning-only` → do not start execution
   - `blocked` → clear blockers first
5. Without a current preflight result, planning may continue; execution defaults to `single-worker`. Swarm requires an explicit user request plus direct live capability checks in `pulse:swarming`.

## Session Scout

After onboarding, run:

```bash
node .pulse/scripts/pulse_status.mjs --json
```

Scout is read-only orientation. It summarizes onboarding, dependency health, state mirrors, handoffs, advisory checkpoints, project-doc routing hints, and targeted memory recall.

Scout output is context, not a gate bypass. Keep gates and downstream skill contracts intact.

Project docs are part of the scout contract:
- if `.pulse/project-docs.json` is mapped, read the mapped repo-level docs before feature history when terminology or architecture boundaries matter
- if project docs are only detected, surface that and consider `pulse:bootstrap-project-context` before deeper planning
- if project docs are missing, do not invent a repo glossary silently; keep the absence explicit

### Checkpoint and State Posture

Checkpoint files under `.pulse/checkpoints/<feature>/...` are **advisory snapshots only**.

Authoritative sources remain:
1. active entries in `.pulse/handoffs/manifest.json`
2. owner handoff file selected from the active manifest
3. current state mirrors (`.pulse/state.json`, `.pulse/STATE.md`)

Use checkpoints for quick comparison, recall hooks, and resume briefing acceleration. Never treat checkpoints as a second state machine.

See `references/handoff-contract.md` for canonical pause/resume companion rendering, and `references/history-lifecycle-contract.md` for durable audit expectations.

### GitNexus Readiness Is Part of Session Start

Treat `gitnexus` as preferred discovery when configured.
- `configured = true`: prefer `pulse:gitnexus`, then verify with file reads.
- `configured = false`: continue with grep/file inspection.
- Use `matched_sources` to verify where MCP config came from.

Readiness here is config availability, not index-quality validation.

---

## Dependency Declaration Contract

Every packaged Pulse skill must make its dependency posture explicit. There are only three valid states:

1. **Command-backed skill** — declare each required CLI under `metadata.dependencies` with `kind: command`, the binary name in `command`, a truthful `missing_effect`, and a short `reason`.
2. **MCP-backed skill** — declare each required MCP server under `metadata.dependencies` with `kind: mcp_server`, the expected `server_names`, the supported `config_sources`, a truthful `missing_effect`, and a short `reason`.
3. **Dependency-free packaged skill** — declare `metadata.dependencies: []` to say the skill was reviewed and does not rely on first-class external tools.

Do not leave a packaged skill with undeclared dependency posture.

When updating or adding packaged Pulse skills, run:
- `node skills/using-pulse/scripts/test_onboard_pulse.mjs`
- `bash scripts/sync-skills.sh --dry-run`

---

## Routing Cookbook

Use this routing cookbook to route into the next specialist skill. It is a maintained using-pulse routing aid, not a complete packaged-skill inventory.

| # | Skill | Load when... |
|---|---|---|
| 0 | `pulse:using-pulse` | Starting or resuming any Pulse session |
| opt-in | `pulse:preflight` | User explicitly requests Pulse preflight/readiness/onboarding diagnostics |
| 1b | `pulse:brainstorming` | Intent is vague and design is not locked |
| 2 | `pulse:exploring` | Feature intent exists but implementation decisions are fuzzy |
| 3 | `pulse:planning` | Decisions are locked and implementation planning is next |
| 4 | `pulse:validating` | Current work and beads must be proven execution-ready |
| 5 | `pulse:swarming` | `recommended_mode=swarm` and execution is approved |
| 6 | `pulse:executing` | Direct implementation is happening |
| 7 | `pulse:reviewing` | Execution is complete and quality gate is next |
| 8 | `pulse:compounding` | Completed Pulse cycle and post-cycle machine learnings should be captured |
| 9 | `pulse:systematic-debug-fix` | Agent path is blocked by failures |
| 10 | `pulse:gitnexus` | Architecture/discovery/impact questions when configured |
| 11 | `pulse:dev-note` | User explicitly asks to record one learning from this conversation |
| 12 | `pulse:dev-note-distil` | User asks to distill accumulated dev-notes into reader-facing topics |
| 13 | `pulse:dream` | User asks to consolidate runtime artifacts into machine-readable memory |
| 14 | `pulse:writing-pulse-skills` | Editing Pulse skills |
| 15 | `pulse:architecture-rescue` | Architecture cleanup report is requested |
| 16 | `pulse:bootstrap-project-context` | Project-doc bootstrap or glossary setup is requested |

## Routing Logic

### Mode Selection

| Mode | Use when... |
|---|---|
| `small_change` | Low-risk local fix/tweak with no new capability/API/data-model/ownership boundary |
| `standard_feature` | Default for feature work and medium-scope refactors |
| `high_risk_feature` | Cross-cutting or high-blast-radius feature/refactor work |

If a request introduces user-visible capability, workflow, subsystem, API surface, durable data-model change, or ownership boundary, it is feature work.

### First-Skill Routing

| Request type | First skill |
|---|---|
| Unformed idea / unclear design intent | `pulse:brainstorming` |
| Feature intent is clear but implementation decisions are unresolved | `pulse:exploring` |
| Clear implementation request with decisions already locked (approved `CONTEXT.md`) | `pulse:planning` |
| Small low-risk fix | `pulse:exploring` for an approved mini `CONTEXT.md`, then `pulse:planning` (`small_change`) |
| "Review my code" | `pulse:reviewing` |
| "Note this learning from this conversation" | `pulse:dev-note` |
| "Distill accumulated dev notes for reading" | `pulse:dev-note-distil` |
| "Consolidate runtime artifacts into machine memory" | `pulse:dream` |
| "Capture post-cycle machine learnings" | `pulse:compounding` |
| "Improve Pulse itself" | `pulse:writing-pulse-skills` |
| "Architecture rescue" asks | `pulse:architecture-rescue` |
| Architecture/discovery asks | `pulse:gitnexus` |
| Repo/project-doc bootstrap or glossary setup | `pulse:bootstrap-project-context` |
| Blocked/failing agent flow | `pulse:systematic-debug-fix` |
| `/go` / full pipeline | Go Mode (`references/go-mode-pipeline.md`) |
| Resume interrupted work | Resume logic from handoff manifest |

Deterministic tie-breaker:
- If the request is still unclear after a quick scout (problem, user, or success criteria not concrete), route to `pulse:brainstorming` first.
- Otherwise, route to `pulse:exploring`.

Maintenance rule: when adding/removing a first-skill routing row in the table above, update this Routing Cookbook in the same change.

Do not route directly to `pulse:planning` unless an approved `history/<feature>/CONTEXT.md` already exists for this exact work slice.

## Gate and State Ownership

Entry-layer ownership is explicit:
- `pulse:preflight` owns readiness artifacts (`.pulse/tooling-status.json`, `.pulse/state.json`, preflight status in `.pulse/STATE.md`).
- `pulse:using-pulse` owns routing guidance only; it must not rewrite gate outcomes from later phases.
- `pulse:exploring` owns writing `history/<feature>/CONTEXT.md` and handoff-ready state hints.
- Gate 1 approval is a human decision on `history/<feature>/CONTEXT.md`; after approval, runtime state should carry `gate_status: approved`, `next_skill_recommended: pulse:planning`, and `next_action: manual_invoke` by default.

Do not mark Gate 1 approved before explicit user approval.

## Resume Logic

Resume handling stays in the scout plane.

1. Read `.pulse/handoffs/manifest.json`.
2. Present active handoffs by owner, skill, feature, active work slice, summary, and next action.
3. If multiple active entries exist, ask user which one to resume.
4. Open only the selected owner file and resume from `summary`, `next_action`, `read_first`, and `payload.transfer`.
5. Optionally use latest matching checkpoint as advisory aid.
6. Load the chosen handoff skill and continue.
7. Do not auto-resume without user confirmation.

Canonical pause/resume schema and rendered companion contract live in `references/handoff-contract.md`.

## Go Mode

Go mode is the full operator-plane pipeline with 4 human gates. Canonical details live in `references/go-mode-pipeline.md`.

Trigger:
- `/go <feature>`
- "run the full pipeline"
- "go mode"

Non-negotiable gates:
- Gate 1: approve `history/<feature>/CONTEXT.md`
- Gate 2: approve selected shape artifact (`work-shape.md`, `phase-plan.md`, or `epic-map.md`)
- Gate 3: approve feasibility-validated current work execution
- Gate 4: approve merge after reviewing (`P1` findings still block)

Execution branch:
- current explicit preflight `recommended_mode=swarm` → `pulse:swarming`
- current explicit preflight `recommended_mode=single-worker` → `pulse:executing`
- current explicit preflight `recommended_mode=planning-only|blocked` → do not start execution
- no current preflight result → default to `pulse:executing`; use `pulse:swarming` only after an explicit user request and live capability checks

## Priority Rules

1. `P1` review findings always block merge.
2. Context budget always applies: if context exceeds 65%, current owner writes its own handoff and updates manifest.
3. `CONTEXT.md` is source of truth for product and architecture decisions.
4. Planning owns `critical-patterns.md` ingestion; workers execute from bead context first.
5. Planning defines `spike_question` for each HIGH-risk item; validating owns spike bead creation/execution.
6. GATE 3 is critical. If plan soundness is uncertain, do not approve execution.
7. Spike failures halt pipeline and route back to planning.
8. A current explicit preflight result may constrain execution mode; without one, default to direct single-worker execution unless the user explicitly requests swarm.
9. Never skip validating.

## Red Flags

Pause and surface immediately when:
- flow jumps from exploring to execution
- execution starts with `recommended_mode=blocked`
- retired/global handoff path is used instead of owner-scoped handoffs
- HIGH-risk plan has no `spike_question`
- review is skipped outside approved lightweight `small_change` flow
- active handoff manifest/file references are inconsistent
- `state.json` or `STATE.md` is stale after active-work transition

## File Quick Reference

```text
.pulse/tooling-status.json            <- optional explicit preflight output
.pulse/state.json                     <- machine-readable routing/status mirror
.pulse/STATE.md                       <- shared project state
.pulse/project-docs.json              <- project-doc routing map
.pulse/handoffs/manifest.json         <- active handoff index (authoritative)
.pulse/checkpoints/<feature>/...      <- advisory checkpoint snapshots
history/<feature>/CONTEXT.md          <- locked decisions from exploring
history/<feature>/work-shape.md       <- approved shape for direct/spike/small work
history/<feature>/phase-plan.md       <- approved shape for milestone/phase-shaped work
history/<feature>/epic-map.md         <- approved shape for capability/risk-shaped work
history/<feature>/lifecycle-summary.md <- durable audit summary
```

## References

- `references/go-mode-pipeline.md`
- `references/handoff-contract.md`
- `references/history-lifecycle-contract.md`
