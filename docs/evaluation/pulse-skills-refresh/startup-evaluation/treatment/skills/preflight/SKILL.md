---
name: preflight
description: Use only when the user explicitly asks to run Pulse preflight or requests a Pulse readiness/onboarding check.
metadata:
  version: '1.4'
  ecosystem: pulse
  position: 'operator-invoked diagnostic outside the default delivery chain'
  type: diagnostic
  dependencies: []
---

# Preflight

Run the requested readiness diagnostic for the actual work and execution strategy. A simple change or prototype stays in ICM; reduce the checks to its real dependencies.

## Invocation and runtime

1. Run only on an explicit preflight, flightcheck, readiness, or onboarding request. Never infer a preflight request from starting, resuming, planning, validating, or executing Pulse work.
2. Resolve the plugin root from this skill and the project root from the task.
3. Run `node <plugin-root>/workflow/scripts/pulse_icm.mjs status --repo-root <repo-root>`. If Node.js 18+ is unavailable, report that concrete ICM blocker without creating legacy state.
4. For `legacy-v1`, follow [the frozen legacy diagnostic](references/legacy-v1.md) only for an explicitly resumed legacy run. A new project task uses the ICM entry router.
5. For `none`, initialize the requested project work through `pulse:using-pulse` before continuing the diagnostic. Preserve existing feature history. Initialization itself does not approve execution.
6. For `icm-v2`, use the contract below. For a runtime conflict or blocked/stale run, report the blocker and preserve its state.

Preflight diagnoses readiness. It does not approve gates, choose a different active run, reset the stage, or authorize execution.

## ICM v2 diagnostic

### 1. Identify what must work

Read the request, active run and relevant plan when one exists. Use the requested or approved execution strategy; otherwise assess the cost-first `single-worker` path. Record what is being checked.

A local HTML prototype needs a callable ICM runtime and a way to exercise its UI. It does not inherently need an issue tracker, Beads, swarm, GitNexus, a package install or a remote service.

Use [the readiness matrix](references/tool-readiness-matrix.md) to distinguish required capabilities from optional or irrelevant ones.

### 2. Check only applicable dependencies

- **ICM runtime:** Node.js 18+ and a successful plugin-local ICM status call.
- **Project runtime:** the language runtime, build/test command, browser or other capability actually required by the task. Reuse the project's tooling.
- **Git:** required when the planned work uses Git operations, worktree isolation or version-control checks. Report a missing repository honestly; do not invent a Git check or initialize a repository as a side effect of the diagnostic.
- **Beads `br`:** required only when the selected work actually uses a Beads projection.
- **`bv`:** required only for a selected adapter operation that uses it. ICM's JSON graph analyzer does not depend on it.
- **Swarm and reservations:** required only for a requested/approved swarm path. Their absence does not degrade or block a single-worker task.
- **Optional accelerators:** check GitNexus, PR tooling or research connectors only when relevant. Do not declare them callable from configuration alone.

Every `ready` result names an actual observed check. Leave an unchecked capability `unknown`, or omit it when irrelevant; do not report a fictitious pass.

### 3. Check setup without forcing legacy onboarding

V2 can use the plugin-local helpers directly. Missing `.pulse/scripts`, legacy mirrors, or legacy handoff manifests is not a v2 readiness failure.

When the operator explicitly requested onboarding or an applicable adapter needs repo-local helpers, use `onboard_pulse.mjs` in check mode first. Apply only the setup already authorized by the operator; preserve existing configuration and compaction settings. Do not run `--apply` merely to make a prototype pass preflight.

### 4. Decide the scoped result

- **PASS:** every capability required for the assessed work is verified.
- **DEGRADED:** the work is still feasible, but a relevant optional capability is unavailable or the operator is considering a fallback from a requested capability.
- **FAIL:** a required capability is missing or broken; name the affected operation and the concrete remedy.

Missing `br`, `bv`, swarm or unused accelerators cannot turn a v2 single-worker prototype into `FAIL` or `DEGRADED` by themselves.

A failure blocks the operation that needs the failed capability. Do not propose leaving Pulse to avoid a failure. Repair that dependency or present a scoped change of approach within the same run. A mandatory requested capability cannot be silently downgraded.

### 5. Persist tool health, preserve workflow authority

Write `.pulse/tooling-status.json` with lowercase machine status `pass | degraded | fail`, the requested scope, assessed strategy, verified checks, blockers, relevant degradations and the next action.

Example for a successfully checked single-worker HTML prototype:

```json
{
  "requested_mode": "prototype",
  "recommended_mode": "single-worker",
  "status": "pass",
  "onboarding": "NOT_REQUIRED",
  "tools": {
    "node": { "status": "ready", "check": "node --version: <observed version>" },
    "icm": { "status": "ready", "check": "<observed plugin-local ICM status call>" },
    "browser": { "status": "ready", "check": "<observed local page opening>" }
  },
  "blockers": [],
  "degradations": [],
  "next_skill": "pulse:using-pulse"
}
```

Replace example values with evidence; the example itself proves nothing. Include a timestamp and project root in the actual artifact. Keep the current run, gates and execution strategy unchanged. Do not write `.pulse/state.json`, `.pulse/STATE.md` or a legacy handoff manifest in v2.

### 6. Return to the same run

Report the result, assessed scope, real blockers and next action concisely. On PASS or a usable, disclosed DEGRADED path, return through `pulse:using-pulse` to the existing `current_stage`. Existing approvals remain authoritative; a diagnostic pass is not Gate 3 approval.

On FAIL, keep the run resumable at its current stage and identify the smallest remedy. No hidden exit from the delivery cycle is needed for prototyping.
