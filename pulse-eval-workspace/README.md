# pulse-eval-workspace

This workspace stores Pulse evaluation inputs and generated benchmark artifacts.

## Source of truth

- `evals.json` is the canonical scenario library.
- The benchmark runner reads pilot scenario IDs and shared verifier commands from [`.plugin-eval/benchmark.json`](../.plugin-eval/benchmark.json).

## Chat-run benchmark flow

### 1. Prepare packet + evidence template

```bash
node scripts/pulse-plugin-eval.mjs benchmark --iteration 8 --eval-ids 21,2
```

This generates:

- `iteration-8/benchmark-packet.md`
- `iteration-8/benchmark-evidence.json`

Use the packet inside the current interactive chat. Paste the assistant responses and manual verdicts into the evidence template.

Keep the generated evidence header unchanged: it binds the file to the exact schema, iteration, config, scenario source, ordered scenario IDs, and frozen scenario-content digest. Copying evidence between iterations or editing the selected corpus requires a fresh generated template and replay.

Before running scenarios, fill the exact runner tuple in the evidence template:

- `model_id`
- `model_version`
- `reasoning_effort`
- `runtime`

All four values are required. Finalization fails instead of publishing ambiguous evidence when any value is missing.

### 2. Finalize benchmark artifacts

```bash
node scripts/pulse-plugin-eval.mjs benchmark \
  --iteration 8 \
  --eval-ids 21,2 \
  --evidence pulse-eval-workspace/iteration-8/benchmark-evidence.json
```

This generates:

- `iteration-8/benchmark.json`
- `iteration-8/benchmark.md`
- `pulse-eval-review.html`

The JSON, Markdown, and HTML outputs preserve the runner tuple so a later model/profile replay cannot be confused with an earlier certification.

## Generated runs

- Every child directory is generated output and ignored by git; `README.md` and `evals.json` at the workspace root are the tracked inputs.
- Numeric iterations use `iteration-*` automatically. Explicit descriptive labels such as `baseline`, `intervention`, and `retest` are also supported and remain generated snapshots.
- `pulse-eval-review.html` is the latest rendered review for the most recent finalized run. Incomplete evidence is rejected before final artifacts are written; complete judged failures remain visible for audit and return a failed evaluator status.
- Treat these as archival references unless a task explicitly asks you to refresh a specific iteration.
