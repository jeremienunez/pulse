# Pulse Plugin Evaluation

The evaluator keeps static/runtime/scout checks and adds schema-v4 preparation and finalization. Its role is evidence integrity, not provider execution or automatic skill deployment. See [recursive skills](recursive-skills.md) for the bounded cycle and native operator protocol.

## Commands

```bash
node scripts/pulse-plugin-eval.mjs run --json
node scripts/pulse-plugin-eval.mjs analyze --json
node scripts/pulse-plugin-eval.mjs scout --json
node scripts/pulse-plugin-eval.mjs benchmark --iteration baseline --eval-ids 21,2 --json
```

`run` combines static, runtime, scout and benchmark; `analyze` checks structure and local prerequisites; `scout` remains read-only. `benchmark` prepares artifacts or finalizes an explicitly supplied evidence file. Preflight is not invoked automatically.

Existing `--workspace`, `--config`, `--run-cmd`, `--iteration`, `--eval-ids`, `--evidence`, skip flags, `--strict` and `--json` remain. `--runtime` is accepted as the existing deprecated option. New options:

| Option | Purpose |
| --- | --- |
| `--condition JSON` | Load a frozen explicit skill condition with exact inline content |
| `--references PATHS` | Declare comma-separated references loaded inline alongside the skill |
| `--execution-kind native` | Native response evidence, subject to provenance qualification |
| `--execution-kind fixture` | Synthetic structure test; never promotion eligible |
| `--legacy-audit` | Historical v3 path in a fresh output workspace, audit only |

The default inputs remain [benchmark config](../../.plugin-eval/benchmark.json) and [scenario library](../../pulse-eval-workspace/evals.json). The config may declare `skillReferences` keyed by skill name. Each scenario needs a unique ID, prompt and explicit expectations. A condition includes SKILL.md and only the references explicitly declared; no autonomous discovery is claimed.

## Prepare v4

Use a new single-component iteration directory name. Preparation refuses to overwrite existing frozen input or evidence.

It writes:

- `preparation.json`: private frozen corpus, criteria, condition and request bindings.
- `runner-packet.json` and `.md`: exact inline guidance, context and prompt, without the case oracle.
- `judge-packet.json`: criteria and their stable IDs, kept outside the replay context.
- `benchmark-evidence.json`: schema v4 template containing full evidence and judgments.
- `benchmark-packet.md`: compatibility alias of the blind runner Markdown.

Submit one `runner-packet.json.cases[n].request` per fresh context. Preserve the actual tool arguments, fork mode, request bytes, native identity and response verbatim. Never send the preparation manifest, judge packet, prior answers or whole folder to the replay. The evaluator itself invokes no model.

## Finalize v4

Fill each required `criterion_results` entry with `criterion_id`, `pass|fail|invalid`, a quote present in the response, and its reason. Criteria coverage is exact. If a supplied `judge.passed` contradicts the derived verdict, finalization fails. Copied prompts, oracles, expectations and request bindings must match the frozen manifest and current condition; divergent values are rejected rather than silently replaced with canonical text.

```bash
node scripts/pulse-plugin-eval.mjs benchmark --iteration baseline --eval-ids 21,2 --evidence pulse-eval-workspace/baseline/benchmark-evidence.json --json
```

Use the same config, condition and reference options as preparation. Invalid or incomplete evidence creates no finalized result. A complete judged failure remains publishable audit evidence with a non-zero content result. A finalized iteration cannot be overwritten by another attempt.

Successful evidence validation writes `benchmark.json`, `benchmark.md` and the existing HTML review entrypoint. The JSON preserves full responses and criteria. Content verdicts and proof qualification are separate:

- `complete`: declared profile and full no-tools trace are available under the operator's provenance contract.
- `diagnostic`: fields are missing/unverified, or the run is an explicit fixture.
- `invalid`: observed tools conflict with the no-tools measurement.

Unavailable metadata remains null with a reason; an absent trace is not an empty verified tool list. Diagnostic text can be archived and judged, but cannot certify or support promotion. The evaluator checks consistency and hashes, not authenticity of an externally supplied transcript. A zero exit code on structure is not proof that a model was run.

Shared verifier commands stay explicit config inputs. Their failures prevent promotion eligibility. They are separate from content judgment. `--strict` treats warnings, including diagnostic qualification, as a failing exit.

## Legacy and published results

Use `--legacy-audit` with a fresh output workspace to inspect a matching v3 corpus/evidence. Existing archive files are not migrated or overwritten. Outputs are `audit_only: true` and `promotion_eligible: false`; v3 cannot certify a new condition by inference.

Report IDs, exact observed profile and its source, execution kind, content counts, qualification and missing metadata, prepared/finalized status, verifiers and links to full evidence. Paired superiority needs the same frozen cases/profile/context, corrected targeted failures and zero required regressions; the evaluator alone does not establish a baseline delta.

Historical [Pulse 3.6.0 certification](certifications/pulse-3.6.0.md) and its fixed verifier remain unchanged. New profiles, conditions or runtimes require their own evidence. No new version certificate or installation is produced by this workflow.
