# Pulse Plugin Evaluation

This runbook defines the maintainer entrypoint for Pulse plugin evaluation.

It assumes the canonical workflow model in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and the live operator rules in [`../../AGENTS.md`](../../AGENTS.md). This file owns evaluator behavior only.

## Primary commands

Run the evaluator from repo root:

```bash
node scripts/pulse-plugin-eval.mjs run
node scripts/pulse-plugin-eval.mjs analyze
node scripts/pulse-plugin-eval.mjs scout
node scripts/pulse-plugin-eval.mjs benchmark
```

`run` is the default when no subcommand is provided.

## Stage map

| Command | Stages | Purpose |
|---|---|---|
| `run` | `static` → `runtime` → `scout` → `benchmark` | Full maintainer pass plus chat-benchmark preparation/finalization |
| `analyze` | `static` → `runtime` | Structural and local dependency checks only |
| `scout` | `scout` | Read Pulse readiness state without touching benchmark artifacts |
| `benchmark` | `benchmark` (+ `scenarios` after finalization) | Prepare packet/template for an interactive chat run, or compile final artifacts from filled evidence |

Use `--json` with any command for machine-readable output.

## Common options

| Option | Applies to | Purpose |
|---|---|---|
| `--workspace <path>` | all commands | Override the eval workspace root |
| `--config <path>` | all commands | Override the benchmark config file |
| `--run-cmd "..."` | `analyze`, `run` | Execute an additional local verification command during runtime checks |
| `--iteration <name|num>` | `benchmark`, `run` | Choose the benchmark iteration directory |
| `--eval-ids <list>` | `benchmark`, `run` | Select a comma-separated subset of scenario IDs |
| `--evidence <path>` | `benchmark`, `run` | Finalize benchmark artifacts from a filled evidence file |
| `--skip-static` | `run` | Skip static checks |
| `--skip-runtime` | `run` | Skip runtime and scout checks |
| `--skip-scenarios` | `run` | Skip benchmark preparation/finalization and scenario checks |
| `--strict` | all commands | Exit non-zero when any warning is present |
| `--runtime <value>` | `benchmark`, `run` | Accepted for compatibility in chat-run mode, but ignored |
| `--help` | all commands | Print CLI help |

## Inputs

The evaluator reads from two canonical inputs:

- [`.plugin-eval/benchmark.json`](../../.plugin-eval/benchmark.json) — pilot scenario IDs, shared verifier commands, and chat-run benchmark notes
- [`pulse-eval-workspace/evals.json`](../../pulse-eval-workspace/evals.json) — canonical scenario library

The benchmark config selects which scenario IDs to run. The scenario library remains the source of truth for prompt content and expectation checklists.

## Static stage

`analyze` and `run` both check:

- `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json`, and `.mcp.json` parse cleanly
- plugin and marketplace versions stay aligned
- every `skills/*/SKILL.md` contract exists
- every scenario has a unique ID and a shipped `skills/*/SKILL.md` path, and every pilot ID exists
- skill-catalog generation still matches the repo state
- packaged memory-oriented skills keep their boundary markers intact

## Runtime stage

`analyze` and `run` both check local prerequisites:

- `git`, `br`, and `bv` on PATH
- optional repo-local verification via `--run-cmd`

Example:

```bash
node scripts/pulse-plugin-eval.mjs analyze \
  --run-cmd "node skills/using-pulse/scripts/test_onboard_pulse.mjs"
```

This stage does not check for headless `claude` or `codex` execution, because benchmark scenarios run in the current interactive chat instead.

## Scout stage

`scout` and `run` read Pulse readiness through `readPulseStatus()` from `.pulse/scripts/pulse_state.mjs`.

The scout surfaces:

- onboarding status and plugin version
- tooling status and `recommended_mode`
- GitNexus readiness and fallback guidance

This stage is read-only. It tells you whether benchmark conclusions are being collected in a healthy Pulse runtime or in a degraded repo state.

## Benchmark stage

The benchmark stage works in two steps.

### Step 1 — prepare chat-run artifacts

Run `benchmark` without `--evidence` to create the packet and template for the current chat session:

```bash
node scripts/pulse-plugin-eval.mjs benchmark --iteration 8 --eval-ids 21,2
```

This writes:

- `pulse-eval-workspace/iteration-8/benchmark-packet.md`
- `pulse-eval-workspace/iteration-8/benchmark-evidence.json`

Numeric iterations are auto-numbered. Explicit descriptive names such as `baseline`, `intervention`, or `retest` are also valid. Every child run directory is generated and ignored by git, while the workspace-root `README.md` and `evals.json` remain tracked inputs.

`benchmark-packet.md` is the scenario packet to use in chat. `benchmark-evidence.json` is the template you fill with:

- the assistant response for each scenario
- the manual verdict from the same interactive session

The evaluator intentionally stops here with a warning-level reminder telling you to run the selected scenarios in chat and rerun with `--evidence`.

### Step 2 — finalize from filled evidence

After the chat run, compile the final benchmark artifacts:

```bash
node scripts/pulse-plugin-eval.mjs benchmark \
  --iteration 8 \
  --eval-ids 21,2 \
  --evidence pulse-eval-workspace/iteration-8/benchmark-evidence.json \
  --json
```

This reads the filled evidence file, runs shared verifier commands, and writes:

- `pulse-eval-workspace/iteration-8/benchmark.json`
- `pulse-eval-workspace/iteration-8/benchmark.md`
- `pulse-eval-workspace/pulse-eval-review.html`

After finalization, the evaluator also runs the `scenarios` checks against the generated benchmark artifacts.

## Scenario validation stage

After a finalized benchmark run, the evaluator checks:

- `pulse-eval-workspace/evals.json` exists and contains the requested IDs
- `pulse-eval-workspace/pulse-eval-review.html` exists
- the selected `iteration-*` exists
- `benchmark-packet.md` and `benchmark-evidence.json` exist
- `benchmark.json` and `benchmark.md` were written
- `benchmark.json` exposes summary data plus a discrimination note

## Generated artifacts

Prepare step:

- `pulse-eval-workspace/iteration-*/benchmark-packet.md`
- `pulse-eval-workspace/iteration-*/benchmark-evidence.json`

Finalize step:

- `pulse-eval-workspace/iteration-*/benchmark.json`
- `pulse-eval-workspace/iteration-*/benchmark.md`
- `pulse-eval-workspace/pulse-eval-review.html`

Treat all child run directories and review HTML as generated artifacts, not hand-maintained source files. The workspace-root `README.md` and `evals.json` remain tracked source files.

## Fix-first triage order

Use this order when reading failures:

1. static contract failures
2. local dependency failures (`git`, `br`, `bv`, or `--run-cmd`)
3. scout readiness warnings that explain degraded results
4. missing or malformed benchmark packet/evidence artifacts
5. incomplete scenario evidence in `benchmark-evidence.json`
6. judged behavioral misses in completed scenarios
7. doc drift between this runbook and generated artifacts

## Public reporting requirements

Every published evaluation summary should include:

- scenario IDs tested
- whether the run was prepared only or fully finalized
- completed / passed / failed / incomplete counts
- readiness or dependency caveats from scout/runtime checks
- links to `benchmark-packet.md`, `benchmark-evidence.json`, `benchmark.json`, and `benchmark.md`
- whether the discrimination note is still only a placeholder for this run
