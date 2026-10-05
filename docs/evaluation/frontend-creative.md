# Experimental creative frontend evaluation

The creative path extends the existing evaluator. It records a bounded research and design session owned by an approved Pulse run; it does not launch models, browsers, commands or skill changes. The coordinator performs those actions through the native harness and records their results. Creative evidence has its own `pulse-creative-benchmark` kind and is not converted into decision benchmark v4 or fixture-action evidence.

This is an experimental, explicitly invoked protocol. Permanent frontend routing and skill guidance remain unchanged until a separately qualified BASELINE → INTERVENTION → RETEST supports adoption. A successful prototype can support a project choice without certifying a general improvement in a skill.

## Owner and preparation

The owner repository must have a fresh approved `single-worker` Stage 04 run. Gate 1, Gate 2 and Gate 3 hashes are checked on each operation. The owner may differ from the isolated code workspace. The session is a fresh fixed child of `history/FEATURE/stages/04_execute/output/verification/creative/`; copied sessions, symlink artifacts and paths escaping their owner are rejected.

The approved Stage 02 plan binds the SHA-256 of `pilot-briefs.json`, `pilot-policy.json` and `pressure-corpus.json`. The two runtime fixture files are available in [frontend-creative/](frontend-creative/). They are inputs to planning, not permission to create a pilot without the Pulse gates. The policy declares coverage, viewports and finite ceilings before execution. A mechanical correction can explicitly use `terrain: nonactivation` and empty `not-applicable` research.

A prepare input contains `owner`, relative `run_file`, `execution_kind: native|fixture`, and a condition from `conditionFromFiles()` in [pulse-skill-evidence.mjs](../../scripts/lib/pulse-skill-evidence.mjs). Its `owner`, exact declared `files: [{path, content, sha256, bytes}]`, and `digest` describe supplied guidance; they do not prove what a provider actually loaded. Preparing an existing session is rejected.

```text
node scripts/pulse-plugin-eval.mjs creative --phase prepare --input PREPARE_JSON --json
```

The returned `root` identifies the global session. `session.json` is the counter and event authority; brief `state.json` files are derived projections, not separate budgets. The frozen manifest includes the original assets and condition. Never rewrite them to hide an overrun or a changed condition.

## Admission and receipts

Save exact request bytes under the session, then pass an event before performing the action:

```json
{
  "root": "SESSION_ROOT",
  "event": {
    "event": "reserve",
    "operation_id": "CV1-read-sources",
    "brief_id": "CV1",
    "phase": "research",
    "resource": "tool",
    "units": 3,
    "request": {"path": "CV1/requests/read.json", "sha256": "sha256:EXACT_REQUEST_DIGEST"}
  }
}
```

```text
node scripts/pulse-plugin-eval.mjs creative --phase record --input EVENT_JSON --json
```

Resources are `tool` or `model`. Phases are `guidance`, `research`, `generation`, `critique`, `correction` and `inspection`. A bounded batch declares its subactions in the request; all reserved units are consumed even if the batch fails or only partly executes. Counts are logical tasks/actions admitted by the coordinator, not all internal inference or browser RPC calls, tokens or billing. This journal does not intercept every native tool or provide a general sandbox.

Only one reservation can be pending. Preserve actual returned artifacts and finish with its `reservation_id`, `outcome: success|error|timeout|uncertain`, and `artifacts: [{path, sha256}]`. Requests, result artifacts and receipts are rechecked. An identical finish is idempotent; a divergent receipt or replay of the same uncertain request bytes is rejected. New editions use new file names; modifying a result already sealed in a receipt invalidates the session.

`pause` and `resume` require no pending action. A user pause stops active-time accumulation and retains all consumption. The research clock starts at the first research action, includes synthesis between calls, and ends at a successful research check or admitted generation. An interrupted writer preserves its lock for explicit owner investigation; never delete it or replay an uncertain action automatically.

The initial pilot ceilings are 30 research minutes per brief, 180 active minutes globally, 15 candidates/8 deep references per brief, 3 initial directions, 2 correction rounds per brief, 16 logical model tasks, 160 tool actions and zero additional external spend. These are maximums, not work to consume. A correction also requires an actual user selection and sequential round number.

The experimental pilot supports at most two explicitly approved, append-only tool-budget amendments: +30 up to 190, then +14 up to 204. An `amend-budget` event is accepted only during a settled pause. Its approval file must be hash-bound by all three gates, match the session and original budget digest, contain the human reply provenance, and link the second amendment to the first. Counters and the original manifest remain intact. Repeating an amendment or raising other limits is not supported. The operator must establish consent from the conversation: a JSON `actor: user` is a provenance declaration, not authenticated human approval.

## Research before materialization

Each brief has `research.json` and a separate root-owned `research-review.json`. Deep references cover peers, contemporary work and culture, with at least two distinct origins per ensemble and no reference filling two quotas. A gallery portal alone is not an inspected work. URL and origin deduplication prevent counting the same project twice.

Every deep reference names its inspected scope and contains a precise observation, a mechanism hypothesis, a boundary and a proposed transformation. Supports resolve to local bytes with digests, a source URL, observation time and successful admitted research/inspection receipt. A text anchor quotes content actually present; an image anchor lies within its actual dimensions. Claimed interaction requires distinct observed states. Blocked sources, still frames, dated curation and textual product claims retain their limits; none becomes a tested interaction or a general trend by assertion.

The root review binds `objectDigest(research)` and explains its verdict. Mechanical checks and a real substance review are both required before generation. A list of URLs or nonempty JSON does not establish research quality.

```text
node scripts/pulse-plugin-eval.mjs creative --phase check --input RESEARCH_CHECK_JSON --json
```

Check inputs contain `root`, `brief_id` and `target: research|directions|evaluation|final`. Outputs distinguish invalid evidence, partial criteria, budget exhaustion, awaiting-user and complete. Keep `checks.*.required_failures` visible instead of treating `ok` as a quality score.

## Directions, rendering and criticism

`directions.json` contains two or three structurally different initial directions, their intent, `structure.composition`, `structure.interaction`, resolved reference transformations, and hashed prototype/moodboard files. A root-owned divergence review rejects a mere recolor. A corrected edition has a new ID, `parent_ids` and `correction_round` while preserving the initial variants. The prototype stack is a pilot choice, not a requirement for all future frontend work.

`evaluation.json` is root-owned and supplies every frozen criterion for every materialized direction: verdict `pass|fail|unobserved`, reason and local evidence. Visual and product-UX criticism are separate. Inspect actual render and required states; generator text and synthetic transport tests do not prove a live interaction or user effectiveness.

Raster dimensions and CSS viewport dimensions are different quantities. Browser captures may exclude scrollbars, be cropped by the observation API or use a different pixel ratio. Keep `capture.width/height` equal to the PNG/JPEG bytes; record the actual `window.innerWidth/innerHeight` separately as `capture.viewport`. Do not resize an image to manufacture a required viewport.

Each capture references a hashed `viewport_observation` in the same successful admitted inspection operation and source URL. That JSON has `kind: pulse-creative-viewport-observation`, version 1.0, brief ID, root actor, observation timestamp, source URL, measured `viewport`, and `capture: {path, sha256}` matching the image. The owner can also record client/scroll widths and observed motion. Required viewport coverage is checked against measured CSS dimensions; no raster-aspect heuristic substitutes for that observation.

For the pilot, inspect 1280×900 and 390×844, keyboard/focus, information with reduced motion, and the workshop create/conflict/edit/cancel/recovery states. A static page with zero active animation does not claim that an OS preference emulator was used. These are targeted checks, not an exhaustive accessibility audit.

## Human choice, learning and finalization

`selection.json` records `actor: user`, `source: user-conversation`, a dialogue reference, the actual verbatim reply and `decision: retain|combine|reject-all`. Direction IDs resolve to the materialized variants. Missing choice means `awaiting-user`; never invent it from a default option. Preserve operator interpretations and unknown reasons as such. A requested combination needs its own materialized lineage and sufficient remaining budget before it can be presented as implemented.

`learning-proposals.json` contains contextual observations, applicability, counterexamples and hashed evidence. Empty proposals can preserve a rejection. Active skill changes and certification are forbidden in this pilot. Prefer a testable method hypothesis over a general aesthetic score; one accepted illustration does not separate the effects of model, prompt and cultural context.

```text
node scripts/pulse-plugin-eval.mjs creative --phase finalize --input FINALIZE_JSON --json
```

Finalization input is `{root}`. All brief checks and human decisions must be complete, no operation pending, and the active budgets respected. The final `benchmark.json` is created exclusively and later events are rejected. It reports effective limits, amendments, consumption, per-brief checks and diagnostic qualification with `promotion_eligible: false`. After Stage 04, review consumes the preserved report and receipt files; the admission helper requires active approved Stage 04 ownership.

The native pilot retained two initial directions for each creative brief, one Astra-authored cultural SVG correction for the festival, and an exact mechanical-label control. Model task identities, actual render/interaction captures and human feedback were recorded. An immutable executed model version and full provider trace were unavailable, so guidance remains a private candidate. This is project evidence and a protocol demonstration, not certified automatic improvement.

## Verification

An optional [Primitive adapter](frontend-primitive-svg.md) reconstructs permitted PNG/JPEG inputs as geometric SVG variants. Its local binary/profile, parameters and output are hashed under an existing admitted tool operation. Creative use keeps the research and correction gates; a separate global/inspection capability probe establishes conversion mechanics only. Rendered inspection remains a separate reservation, and pixel approximation does not promote guidance or score creativity.

```text
node --test scripts/test-pulse-creative-evidence.mjs scripts/test-pulse-creative-session.mjs scripts/test-pulse-plugin-eval.mjs scripts/test-pulse-skill-evidence.mjs scripts/test-pulse-skill-iteration.mjs scripts/test-build-plugin-dist.mjs
```

The suite checks evidence, hashes, coverage, criteria, viewport witnesses, owner gates, shared budgets, amendments, pause/resume, uncertain replay, legacy v4/cycle compatibility and extracted-package operation. Fixtures are explicitly synthetic and do not establish model decisions or live provider capabilities. Code integration, installation, commit and push remain separate from a completed local pilot; the source patch is reviewed through Gate 4.
