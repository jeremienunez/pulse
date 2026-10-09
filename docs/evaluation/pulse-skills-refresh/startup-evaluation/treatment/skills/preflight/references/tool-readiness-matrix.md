# Pulse Tool Readiness Matrix

Use this matrix for the ICM v2 diagnostic. An explicitly resumed legacy run follows its frozen [legacy contract](legacy-v1.md).

## Required capabilities follow the selected work

| Capability | Required for | Minimal evidence | If missing |
|---|---|---|---|
| Node.js 18+ and plugin-local ICM helper | ICM initialization, status and graph checks | `node --version` and the actual ICM status call | FAIL for ICM operations |
| Project runtime/build/test tools | The operations declared by the task or plan | Existing narrow build/test command or version probe as appropriate | FAIL only for the operation that needs the missing capability |
| Browser or equivalent UI inspection | A prototype/UI task whose acceptance needs runtime interaction | Open the real local page and exercise the relevant interaction | Report the UI validation blocker; do not claim runtime UAT |
| Git | Planned Git operations, isolation or version-control verification | `git rev-parse --show-toplevel` or the applicable Git check | Block those operations; do not initialize Git implicitly as a diagnostic side effect |
| `br` | A selected Beads projection | `br --help` | Block that adapter; irrelevant to plain ICM JSON planning |
| `bv` | A selected operation that uses the Beads viewer | `bv --help` | Block that operation; irrelevant to the native ICM analyzer |
| Native swarm capability | Requested/approved swarm execution | Actual runtime capability probe | Offer single-worker if acceptable; do not silently downgrade a required swarm |
| Reservation helper | Swarm paths using shared file reservations | Actual helper availability/probe | Same scope as swarm; irrelevant to single-worker |
| GitNexus | Requested accelerated code discovery | Successful callable MCP probe | Use local discovery and disclose the relevant limitation |
| PR tooling | Requested PR operations | Applicable authenticated capability check | Block the PR operation, not local prototype work |
| External research connector | Research that actually needs it | Callable source/tool probe | Use an available source or disclose the missing evidence |

Missing unrelated tools do not reduce the diagnostic result. In particular, a v2 single-worker prototype does not require `br`, `bv`, swarm, reservations or legacy `.pulse/scripts` merely because Pulse is installed.

## Outcomes

- **PASS:** all capabilities required by the assessed scope are verified.
- **DEGRADED:** a relevant optional capability is unavailable, while the stated scope remains feasible.
- **FAIL:** a required capability is unavailable or broken. Name its dependent operation and the remedy.

A configured tool is not necessarily callable. Report `unknown` when a relevant capability cannot be probed; do not invent a successful check. A required unverified capability cannot support PASS.

## Output

Persist the scoped result in `.pulse/tooling-status.json` with lowercase `pass | degraded | fail`, the requested scope, assessed strategy, checks, blockers, relevant degradations and next action.

Do not create legacy state mirrors or handoff manifests for v2. Preserve the current run and gate decisions; preflight never authorizes execution.

## Adapter install references

Only offer these when the selected operation really needs the missing adapter:

- [beads_rust](https://github.com/Dicklesworthstone/beads_rust)
- [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer)

For existing legacy runs, retain the frozen diagnostic's tooling contract. Starting new project work uses ICM v2 through the entry router.
