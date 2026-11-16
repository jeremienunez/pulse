# Shared-instinct controller evaluation log

Status: controller and temporary-profile verification recorded on 2026-11-16.
Deployment awaits the candidate review.

## Baseline

Before this feature, `pulse:dream` performed manual fact consolidation only.
There was no shared-instinct store, no deterministic delivery receipt, no
session-range cursor and no tool-free Claude evaluator. The pre-change bridge
consult mode exposed read tools, so it could not certify a tool-free judgement.

## Intervention

The controller adds contracts, persistent receipts, relevance selection,
tool-free `evaluate` transport, frozen behavioural qualification and explicit
runtime matrix states. It keeps the manual Dream contract and `.pulse/memory/`
ownership unchanged. The bridge adds a Claude-only evaluate mode; ordinary
consult/work behavior is covered by existing regression tests.

## Retest

- Python controller suite: 75 tests passed.
- CLI bridge: 14 tests passed, including tool-free evaluate arguments and
  canonical model extraction from one-model Claude `modelUsage` output.
- Native Claude transport records effective `claude-opus-5-5`, low effort and
  zero tools. A complete twelve-response comparison retained an uncertain
  judgment in review. Native activation eligibility remains pending.
- Claude and Codex temporary profiles receive complete contextual guidance
  across native start, prompt, resume and end events. Their MCP clients list
  `select`, `observe` and `remember_preference`.
- Antigravity receives start and pre-invocation context. The managed launcher
  closes its admitted range. Its MCP client lists the same three tools.

## Guidance pressure evidence

The frozen corpus contains `verified-outcome`, `missing-identity` and
`manual-facts`. Baseline and retest used `claude-opus-5-5`, low effort, with no
tools. All three decisions passed the root review. These passing cases require
no added behavioral warning. The user-approved routing change clarifies the
evaluator's method proof and each consumer's separate evidence. Its final source
received a further replay of the identical corpus, with all three cases passing.

Full prompts, responses, exact source digests, wire receipts and root verdicts
are retained in the canonical run under
`stages/04_execute/output/verification/functional-20261116/`.

## Limits

Fixture-qualified reflexes used in transport probes establish delivery.
Method quality and each consumer's behavior have separate receipts in the
runtime matrix. OpenBot has a source-bound patch, six focused tests and a Node
type check. Application-level delivery awaits its isolated build and deployment.
Early Antigravity probes caused unintended native generations. Those records
are retained separately from the later zero-token probes.
