---
name: reverse-engineering
description: "Use when a question depends on shipped application artifacts, decompilation, version comparisons or browser/Electron observations that the available source repository does not establish."
metadata:
  version: '1.0'
  ecosystem: pulse
  position: 'support skill — loaded by target and activity on demand'
  dependencies: []
---

# Reverse engineering

Investigate the product selected for the current Pulse task. Start through
`pulse:using-pulse` and contribute findings to that run's current stage or node.
Implementation of a reconstruction follows its approved work graph.

Ordinary analysis of a complete source repository belongs to repository tools
and GitNexus. REA contributes a separate view of shipped artifacts and behavior.

## Load the relevant guide

| Target or activity | Guide |
| --- | --- |
| ASAR, extracted JavaScript/Electron, IPC or feature tracing | [JavaScript applications](references/javascript-applications.md) |
| Native binary, managed assembly or package inventory | [Native and packaged artifacts](references/native-and-artifacts.md) |
| Browser/Electron observation or declared runtime actions | [Runtime observation](references/runtime-observation.md) |
| Partial results, comparisons, Evidence export or resumption | [Evidence workflows](references/evidence-workflows.md) |
| An observed missing tool, connection or provider | [Connection and recovery](references/connection-and-recovery.md) |

Use the target already identified for the task and the connected runtime's
actual tool names and schemas. The guides provide recipes, not a promise that
every installed release or provider implements them. Prefer an existing REA
connection or CLI; acquisition and configuration are separate from this skill.

A retained view or trace examines its parent's **already analyzed sources**.
It cannot inspect files outside that source selection. Additional files require
a changed analysis input and new Evidence; keep the earlier parent's scope.
Read the Evidence guide when interpreting partial source coverage.

## Keep the existing owner

REA owns its technical sessions, resources and Evidence ledger. Pulse owns the
delivery decisions, graph, findings and review. Use the current stage's existing
artifact layout for conclusions and supporting exports; no extra workflow,
global memory or report schema is required.

Return the answer with its source locations, Evidence references, limits and
remaining questions. Preserve the complete supporting Evidence when it must
survive the REA session.

Adapted from REA under MIT; see [NOTICE](NOTICE), [LICENSE](LICENSE) and the
[source lock](references/rea-source-lock.json). Evaluation scope is recorded in
[CREATION-LOG.md](CREATION-LOG.md).
