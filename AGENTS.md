# AGENTS.md — Pulse Skill Ecosystem

Read this file at every session start. Re-read after any context compaction.

## What is Pulse?

A validate-first, filesystem-orchestrated skill ecosystem for agentic software delivery. Numbered contracts, explicit input/output artifacts, a plain JSON work graph, and content-bound human gates carry new runs from request to reviewed implementation. Beads and native workers are optional swarm adapters rather than the primary state machine.

## What Pulse Is / Is Not

Pulse is:

- a gated workflow with explicit human approvals and repo artifacts
- a skill plugin for Claude Code and Codex, not a separate compiled runtime
- a delivery system that can run in swarm or single-worker mode

Pulse is not:

- a license for agents to skip `CONTEXT.md`, validating, or review gates
- a promise that every task needs the heaviest possible process path
- a replacement for human gate approval or operator judgment

## One-Line Glossary

- `run.json` — canonical ICM v2 stage, gate, and execution-strategy state.
- stage contract — numbered Inputs, Process, Outputs, and Exit instructions.
- `work-graph.json` — immutable approved execution DAG.
- `execution-state.json` — mutable per-node completion state.
- legacy v1 — frozen state/shape/handoff workflow used only for existing runs.
- `pulse_status` — the read-only scout for current workflow state.

## Skill Catalog (core chain + selected support)

| Skill | Purpose | Invoke When |
|-------|---------|-------------|
| `pulse:using-pulse` | ICM run detection, creation, and stage routing | Session start, "build feature X" |
| `pulse:preflight` | Tool readiness, mode selection, project tooling status | Only on an explicit user request |
| `pulse:exploring` | Write explicit decisions | Stage 01 |
| `pulse:planning` | Write one plan and one work graph | Stage 02 |
| `pulse:validating` | Verify reality, cost-first recommendation, and swarm eligibility | Stage 03 |
| `pulse:swarming` | Optional execution strategy and Beads projection | Approved Stage 04 swarm |
| `pulse:executing` | Complete the approved work graph | Stage 04 |
| `pulse:reviewing` | Root-owned proportional review; specialists only by explicit request | After execution completes |
| `pulse:compounding` | Capture learnings → .pulse/memory/learnings/ | After reviewing, always |
| `pulse:writing-pulse-skills` | Controlled BASELINE → INTERVENTION → RETEST skill evaluation | Creating/improving Pulse skills |

### Support Skills

| Skill | Purpose |
|-------|---------|
| `pulse:systematic-debug-fix` | Root-cause-first bug fixing when workers hit blockers |
| `pulse:worktree-isolation` | Safe isolated workspaces that preserve dirty user state and establish a clean baseline |
| `pulse:governed-feature` | Optional SPDD-derived governance overlay for behavior-rich or cross-cutting changes |
| `pulse:gitnexus` | Codebase intelligence via GitNexus graph tools or local fallback |
| `pulse:architecture-rescue` | Repo-wide or subsystem-wide architecture rescue report on shallow modules, leaky seams, ownership drift, and deepening opportunities |
| `pulse:bootstrap-project-context` | Repo bootstrap and project-doc discovery/mapping before implementation in an unfamiliar repo |
| `pulse:refresh-project-docs` | Regenerate evergreen project docs to match the current repo state |
| `pulse:dev-note` | Capture one structured developer learning from the current coding-with-AI session |
| `pulse:dev-note-distil` | Distill pending raw dev notes into stable topic knowledge and rebuild the global topic index |
| `pulse:dream` | Manual dream consolidation over Claude Code or Codex runtime artifacts |

## The Chain

```
pulse:using-pulse → pulse:exploring → pulse:planning → pulse:validating → pulse:executing → pulse:reviewing → pulse:compounding
```

`pulse:preflight` is an operator-invoked diagnostic side path, not an automatic prerequisite.

## Go Mode Gates

- **GATE 1** (after exploring): approve `decisions.md`
- **GATE 2** (after planning): approve `plan.md` and immutable `work-graph.json`
- **GATE 3** (after validating): approve execution strategy before Stage 04
- **GATE 4** (after reviewing): approve merge; P1 findings block this gate

## Core Tools

- `workflow/scripts/pulse_icm.mjs` — run, gate, hash, and connectivity mechanics
- `br` / `bv` — optional swarm graph projection and coordination
- native swarm adapters — Claude Code teammates or Codex subagents in swarm mode
- `.pulse/scripts/pulse_reservations.mjs` — shared local file reservations for swarm safety
- `gitnexus` — graph-backed codebase intelligence (optional)
- CASS/CM — session search, cognitive memory (optional)

## Five-Layer Context Model

Use this mental model when deciding where to read next:

1. **Identity** — `AGENTS.md` / `CLAUDE.md`.
2. **Routing** — `workflow/CONTEXT.md`, `.pulse/active-run`, and `run.json`.
3. **Stage contract** — `workflow/stages/<number>/CONTEXT.md`.
4. **References** — stable project rules and `.pulse/memory/`.
5. **Working artifacts** — `history/<feature>/stages/*/output/`.

Downstream repos may also expose a separate project-docs plane through repo-owned `CONTEXT.md`, `CONTEXT-MAP.md`, and `docs/adr/`; Pulse maps those inputs via `.pulse/project-docs.json` and keeps them distinct from feature history.

## File Conventions

```
.pulse/active-run                       ← relative path to active v2 run.json
history/<feature>/run.json              ← canonical stage and gate state
history/<feature>/stages/*/output/      ← stage intermediate representations
.pulse/memory/                          ← durable cross-run reference material
.beads/                                 ← optional swarm projection only
```

## Critical Rules

1. **Never execute without validating.** Gate 3 is non-negotiable.
2. **Route from `run.json.current_stage`.** Do not infer from legacy mirrors in v2.
3. **Gate approvals bind hashes.** Changed approved artifacts require reapproval.
4. **Scout first, drill down second.** Prefer `pulse_status`, then open the specific artifact it points to.
5. **After compaction: re-read this file, status, current stage contract, and declared inputs.**
6. **P1 findings always block merge.** Even in go mode.

---

## Native Swarm Coordination

Pulse keeps one swarm contract and adapts it to the active runtime.

### Runtime adapters

- **Claude Code** — use teammate primitives such as `TeamCreate`, `Agent`, and `SendMessage` when swarm mode is active.
- **Codex** — use native subagents and parent-thread follow-ups.
- **Shared reservation layer** — every runtime uses `.pulse/scripts/pulse_reservations.mjs` and `.pulse/reservations.json` to prevent overlapping edits.

### Same Repository Workflow

When multiple agents operate in the same repository:

1. **Spawn with bounded context** — workers receive runtime identity, coordinator identity, epic ID, feature name, and an optional startup hint.
2. **Reserve files** — before editing, a worker claims the files listed in its bead's `files` field through the local reservation helper.
3. **Report on the active coordination surface** — workers post `[ONLINE]`, `[DONE]`, `[BLOCKED]`, `[FILE CONFLICT]`, and `[HANDOFF]` as state changes happen.

### Shared rules

- `work-graph.json` defines approved work; Beads mirrors it only during approved swarm execution
- do not edit without reservations
- do not invent extra registration, inbox, or topic mechanics when the runtime does not use them
- release reservations before advertising completion or pause

### Quick Reads

- Scout: `node .pulse/scripts/pulse_status.mjs --json`
- Reservations: `node .pulse/scripts/pulse_reservations.mjs list --active-only --json`
- Graph: `bv --robot-triage --graph-root <EPIC_ID>`

### Macros vs Granular Tools

Some runtimes expose high-level worker-spawn macros. Others expose a smaller set of teammate or subagent primitives. Pulse skills reference the behavior contract; keep the behavior, not the spelling.

### Common Pitfalls

- **Forgetting to release files.** Always release reservations after closing a bead or pausing.
- **Skipping `[ONLINE]`.** Startup is not complete until the worker reports in.
- **Treating tasks, Beads, or chat threads as the approved plan.** The immutable `work-graph.json` stays authoritative.
- **Editing around a conflict.** Report `[FILE CONFLICT]` and wait for resolution.

---

<!-- bv-agent-instructions-v1 -->

## Beads Workflow Integration (Legacy V1 and Approved Swarm Only)

Pulse may use [beads_rust](https://github.com/Dicklesworthstone/beads_rust) for legacy v1 work or as a temporary coordination projection after Gate 3 approves swarm. New v2 planning never makes Beads the canonical graph.

**Important:** `br` is non-invasive — it NEVER runs git commands automatically. After `br sync --flush-only`, stage durable Beads files explicitly before committing. Do not stage SQLite cache/sidecar or recovery artifacts such as `.beads/beads.db`, `.beads/beads.db-wal`, `.beads/beads.db-shm`, or `.beads/.br_recovery/`.

### Essential Commands

```bash
# View issues (launches TUI - avoid in automated sessions)
bv

# CLI commands for agents (use these instead)
br ready              # Show issues ready to work (no blockers)
br list --status=open # All open issues
br show <id>          # Full issue details with dependencies
br create --title="..." --type=task --priority=2
br update <id> --status=in_progress
br close <id> --reason="Completed"
br close <id1> <id2>  # Close multiple issues at once
br sync --flush-only  # Flush bead changes to disk (does NOT run git)
```

### Workflow Pattern

1. **Project**: Materialize only the approved component/node set from `work-graph.json`
2. **Claim**: Use `br update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `br close <id>`
5. **Sync**: Always run `br sync --flush-only` then manually commit at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `br ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers, not words)
- **Types**: task, bug, feature, epic, question, docs
- **Blocking**: `br dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status                                      # Check what changed
git add <files>                                 # Stage code changes
br sync --flush-only                            # Flush bead changes to disk
git add .beads/issues.jsonl .beads/config.yaml # Stage durable bead state only
git commit -m "..."                             # Commit code + beads together
git push                                        # Push to remote
```

### Best Practices

- Check `br ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `br create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always `br sync --flush-only`, stage `.beads/issues.jsonl` and `.beads/config.yaml` explicitly, then commit before ending session

<!-- end-bv-agent-instructions -->

---

## Beads Viewer (bv) — Graph-Aware Triage Engine

`bv` is the graph-aware viewer and analytics engine for the bead dependency graph. It provides TUI mode for humans and structured robot-output mode for agents.

> **Scope boundary:** `bv` reads and analyzes the bead graph. It does not create, update, or close beads — use `br` for mutations.

### CRITICAL: Use ONLY `--robot-*` Flags

In automated or agent sessions, never launch the TUI. Always use robot-output flags that return structured JSON:

```bash
bv --robot-triage              # Prioritized triage of actionable work
bv --robot-priority            # Priority-ranked list of all beads
bv --robot-suggest             # Dependency suggestions and fixes
bv --robot-insights            # Graph health analysis
bv --robot-triage --graph-root <ID>  # Scoped to a specific epic/subtree
```

### The Legacy/Swarm Adapter Workflow

Use triage only when a legacy run or approved swarm projection is active:

```bash
bv --robot-triage
```

This returns the most actionable view: beads sorted by priority with dependency status, blockers surfaced, and ready work highlighted.

### Command Reference

#### Planning Commands

| Command | Purpose |
|---------|---------|
| `bv --robot-triage` | Actionable work, sorted by priority, blockers surfaced |
| `bv --robot-priority` | All beads ranked by priority score |
| `bv --robot-suggest` | Suggested dependency additions or fixes |

#### Graph Analysis Commands

| Command | Purpose |
|---------|---------|
| `bv --robot-insights` | Graph health: cycles, bottlenecks, orphans, disconnected clusters |
| `bv --robot-triage --graph-root <ID>` | Triage scoped to a specific epic subtree |

#### History Commands

| Command | Purpose |
|---------|---------|
| `bv --robot-triage --include-closed` | Include closed beads in triage output |
| `bv --robot-priority --include-closed` | Full priority list including closed work |

#### Other Commands

| Command | Purpose |
|---------|---------|
| `bv --help` | Full flag reference |
| `bv` | Launch TUI (humans only, never in agent sessions) |

### Scoping & Filtering

Scope triage to a specific epic or subtree:

```bash
# Triage only beads under a specific epic
bv --robot-triage --graph-root EPIC-001

# Priority ranking within a subtree
bv --robot-priority --graph-root EPIC-001

# Insights for a specific subgraph
bv --robot-insights --graph-root EPIC-001
```

### Understanding Robot Output

All `--robot-*` commands return JSON. Key fields:

- `id` — bead identifier
- `title` — human-readable summary
- `status` — open, in_progress, closed, blocked
- `priority` — numeric (P0-P4)
- `dependencies` — list of upstream bead IDs
- `blockers` — unresolved blocking beads
- `files` — file paths in scope

### jq Quick Reference

```bash
# List IDs of all ready beads
bv --robot-triage | jq -r '.[] | select(.status == "open" and (.blockers | length == 0)) | .id'

# Count open beads by priority
bv --robot-priority | jq 'group_by(.priority) | map({priority: .[0].priority, count: length})'

# Find beads touching a specific file
bv --robot-priority | jq -r '.[] | select(.files[]? | contains("src/auth")) | .id'

# List all blocked beads and what blocks them
bv --robot-triage | jq '.[] | select(.blockers | length > 0) | {id, blockers}'
```

---

## Operator Cookbook

### Start a fresh Pulse session

1. Run `pulse:using-pulse`.
2. Use `node .pulse/scripts/pulse_status.mjs --json` when available for a read-only scout pass.
3. For v2, open `.pulse/active-run`, its `run.json`, the current numbered stage contract, and declared inputs. For legacy, surface the selected handoff and state mirrors.
4. Run `pulse:preflight` only when the user explicitly requests it.

### Resume safely

- V2 resumes from `run.json.current_stage` and optional `resume_path`.
- Legacy resumes from the frozen owner-scoped handoff contract.
- If both are active, stop and ask which surface owns the work.

### Pick swarm vs single-worker

- Recommend swarm only for two or more weakly disconnected, file-disjoint graph components.
- Use single-worker for one component, overlap, invalid graphs, or a user downgrade.
- In both paths, Gate 3 approval is still required before execution begins.

### Scout guidance

- Treat `pulse_status` as the first read, not the full source of truth.
- Treat it as an orientation surface that tells you where to look next.
- If the scout and deeper artifacts disagree, trust the underlying artifacts and surface the mismatch.

## Landing the Plane (Session Completion)

Every session must end cleanly. Before stopping, run through this mandatory workflow:

### 1. Record Remaining Work

For v2, add approved follow-up nodes in a new planning revision; for legacy or approved swarm, Beads may record deferred work:

```bash
br create --title="<description>" --type=task --priority=<N>
```

### 2. Quality Gates

Confirm that no P1 findings remain unresolved:

```bash
bv --robot-triage | jq '.[] | select(.priority == 0 or .priority == 1) | select(.status != "closed")'
```

If P1 items remain open, they block merge. Fix or escalate before ending.

### 3. Update Status

Update v2 stage outputs and `run.json`, or the frozen legacy state surfaces for legacy work.

### 4. Sync Beads When the Adapter Is Active

```bash
br sync --flush-only
git add .beads/issues.jsonl .beads/config.yaml
```

### 5. Hand Off

If context budget is near 65%:

1. For v2, write a stage-local handoff and set `run.json.resume_path`.
2. For legacy, write and register the owner-scoped legacy handoff.

If the session is the final session for a feature:

1. Ensure all beads are closed or intentionally deferred
2. Run `pulse:compounding` to capture learnings
3. Report the completed run and leave commit/push decisions to the user.

---

## CASS — Cross-Agent Session Search

CASS (Cross-Agent Session Search) lets you find information from previous agent sessions. Use it to recover decisions, find prior approaches, or locate work done in earlier contexts.

### Examples

```bash
# Find sessions that worked on authentication
cass search "authentication login JWT"

# Find sessions that modified a specific file
cass search "src/auth/middleware.ts"

# Find sessions related to a specific bead
cass search "BEAD-042"
```

### Tips

- Use specific terms: file paths, bead IDs, feature names, error messages.
- Combine multiple search terms for narrower results.
- CASS indexes session transcripts, not code. It finds what agents discussed, not what they wrote.

### Usage Rules

- CASS is optional. If unavailable, fall back to reading `history/` and `.pulse/` artifacts directly.
- Do not use CASS as a substitute for reading `CONTEXT.md` or `STATE.md` — those are always the source of truth.
- CASS results are hints, not authoritative. Always verify findings against the current codebase state.

---

## Memory System: cass-memory

`cass-memory` (also called `cm`) is the persistent cognitive memory layer. It stores and retrieves durable knowledge across sessions — patterns, preferences, project-specific rules, and accumulated context.

### Quick Start

```bash
# Store a memory
cm store "br is the beads CLI binary, not bd"

# Recall memories relevant to a topic
cm recall "beads CLI commands"

# List recent memories
cm list --recent
```

### Protocol

1. **Store early.** When you discover a non-obvious fact, project convention, or user preference, store it immediately.
2. **Recall before assuming.** At session start or when entering unfamiliar territory, recall relevant memories before guessing.
3. **Trust but verify.** Memories may be stale. Cross-check recalled facts against the current codebase.

### Key Flags

| Flag | Purpose |
|------|---------|
| `--recent` | Show most recently stored memories |
| `--tag <tag>` | Filter by tag |
| `--context <text>` | Provide context for smarter recall |

### Rules

- `cass-memory` is optional. If unavailable, rely on `.pulse/memory/` and `.pulse/STATE.md`.
- File-based learnings under `.pulse/memory/` remain the canonical source of truth for compounded knowledge. `cass-memory` is a convenience index, not a replacement.
- Do not store secrets, credentials, or tokens in memory.

<!-- PULSE:START -->
# Pulse Workflow

Use `pulse:using-pulse` first for every new or resumed project task, including small changes and prototypes. Initialize ICM before producing task artifacts when no run exists; reuse the matching active run. Apply this entry rule regardless of the model or task size.

## Architecture

Pulse 4 uses an interpretable filesystem workflow. One agent loads only the current numbered stage contract and its declared inputs. Plain Markdown and JSON artifacts carry context between stages; deterministic local scripts validate paths, gates, hashes, and graph connectivity.

Preflight is a manual diagnostic outside the delivery graph. Run `pulse:preflight` only when the user explicitly requests it.

## Glossary

- `run.json` — canonical v2 run state and content-bound gate approvals.
- stage contract — one numbered stage's Inputs, Process, Outputs, and Exit rules.
- `work-graph.json` — immutable approved execution DAG.
- `execution-state.json` — mutable node completion state; never stored in the plan graph.
- legacy v1 — existing `.pulse/state.json`, shape artifacts, checkpoints, and owner handoffs, resumed without migration.

## Startup

1. Read this file after session start or compaction.
2. Run `node .pulse/scripts/pulse_status.mjs --json` when the helper exists; otherwise invoke `pulse:using-pulse` and resolve the plugin-local ICM status script.
3. For ICM v2, read `.pulse/active-run`, the referenced `run.json`, the current stage contract, and only its declared inputs.
4. For legacy v1, surface the active handoff/state and wait for explicit resume confirmation.
5. If v2 and legacy surfaces conflict, stop without writing either.
6. If no run exists, initialize one through `pulse:using-pulse` before brainstorming, prototyping or implementation. Keep simple/prototype decisions, plans and checks proportionate inside that same cycle.

## Delivery Graph

```text
pulse:using-pulse
  -> pulse:exploring
  -> pulse:planning
  -> pulse:validating
  -> pulse:executing
  -> pulse:reviewing
  -> pulse:compounding
```

- `pulse:brainstorming` is an optional pre-stage.
- `pulse:swarming` is an execution strategy inside Stage 04, not a delivery stage.
- `pulse:preflight` is invoked only on explicit user request.

## Human Gates

- Gate 1 approves `01_explore/output/decisions.md`.
- Gate 2 approves `02_plan/output/plan.md` and immutable `work-graph.json`.
- Gate 3 approves validated execution and the selected strategy.
- Gate 4 approves merge after review and UAT; open P1 findings block it.

Approvals bind artifact SHA-256 hashes. Any approved artifact edit makes the gate stale and blocks downstream routing until reapproval.

## Execution Strategy

- Every valid graph recommends `single-worker` as the cost-first default.
- Connectivity determines swarm eligibility only: at least two file-disjoint components are eligible, capped at four workers; conflicts are ineligible.
- Gate 3 human approval is required before either strategy starts and may explicitly choose eligible `swarm`.
- Beads and reservations are optional swarm projections. `work-graph.json` remains the plan authority and `execution-state.json` remains the completion authority.

## Canonical Files

```text
.pulse/active-run
history/<feature>/
  request.md
  run.json
  stages/
    01_explore/output/decisions.md
    02_plan/output/plan.md
    02_plan/output/work-graph.json
    03_validate/output/validation.json
    04_execute/output/execution-state.json
    04_execute/output/execution-report.md
    04_execute/output/verification/
    05_review/output/review.json
    05_review/output/uat.md
    06_compound/output/compounding.md
```

Legacy files remain readable and executable only through frozen legacy contracts. Never rewrite them into v2 automatically.

## Critical Rules

1. Never execute before Gate 3 approval.
2. Route v2 strictly from `run.json.current_stage`; do not infer a next skill from stale mirrors.
3. Load only the current stage contract, its Inputs, and minimal project references.
4. Do not mutate `work-graph.json` after Gate 2; execution progress belongs in `execution-state.json`.
5. Do not invoke preflight, onboarding, swarming, or legacy migration automatically.
6. Preserve dirty worktrees and declare exact file scopes before editing.
7. P1 findings block Gate 4.
8. Root-owned review is the v2 default; specialist agents require an explicit operator request.
9. Behavioral changes use scenario-first BDD: define expected behavior, edge cases, and failure behavior before implementation.

## Session Finish

1. Leave current stage outputs and `run.json` coherent.
2. If pausing v2 work, write a stage-local handoff and record its path in `run.json.resume_path`.
3. If pausing legacy work, use the frozen owner-scoped handoff contract.
4. Report blockers, stale approvals, remaining graph nodes, and the next explicit human decision.
<!-- PULSE:END -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **pulse-tuned** (2155 symbols, 3755 relationships, 159 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/pulse-tuned/context` | Codebase overview, check index freshness |
| `gitnexus://repo/pulse-tuned/clusters` | All functional areas |
| `gitnexus://repo/pulse-tuned/processes` | All execution flows |
| `gitnexus://repo/pulse-tuned/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
