# CLAUDE.md

This repository packages Pulse 4 for Codex first, with best-effort Claude metadata compatibility.

## Architecture

Pulse uses Interpretable Context Methodology:

- `workflow/CONTEXT.md`  router and Layer 1 context.
- `workflow/stages/01_explore` through `06_compound`  canonical numbered stage contracts.
- `workflow/graph.json`  declarative stage graph.
- `skills/*/SKILL.md`  plugin-discovered skills; seven core skills are generated from workflow contracts.
- `skills/*/references/legacy-v1.md`  frozen complete legacy contracts.
- `skills/using-pulse/scripts/pulse_icm.mjs`  deterministic run, gate, hash, and connectivity mechanics.
- `.mcp.json`  GitNexus, Docker MCP, and Morph companion configuration.
- No lifecycle hooks are packaged or installed.

## Delivery Graph

```text
using-pulse -> exploring -> planning -> validating -> executing -> reviewing -> compounding
```

Brainstorming is optional. Preflight is explicit-only. Swarming is an approved Stage 04 strategy.

## New-Run Artifacts

```text
.pulse/active-run
history/<feature>/
  request.md
  run.json
  stages/01_explore/output/decisions.md
  stages/02_plan/output/plan.md
  stages/02_plan/output/work-graph.json
  stages/03_validate/output/validation.json
  stages/04_execute/output/execution-state.json
  stages/04_execute/output/execution-report.md
  stages/04_execute/output/verification/
  stages/05_review/output/review.json
  stages/05_review/output/uat.md
  stages/06_compound/output/compounding.md
```

Gate approvals bind hashes. Work graph status never changes after Gate 2; execution status belongs in `execution-state.json`.

## Editing and Testing

1. Edit canonical files under `workflow/`, then run `node scripts/build-workflow-skills.mjs`.
2. Preserve each frozen legacy contract unless intentionally fixing legacy behavior with its own baseline/retest.
3. Run `node --test workflow/scripts/test_pulse_icm.mjs workflow/scripts/test_workflow_contracts.mjs`.
4. Run `node skills/using-pulse/scripts/test_onboard_pulse.mjs`.
5. Run the strict plugin evaluator and plugin validator before installation.
6. Use `pulse:writing-pulse-skills` for exact-profile BASELINE -> INTERVENTION -> RETEST evidence.

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
