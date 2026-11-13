# Shared-instinct controller evaluation log

Status: implementation baseline and fixture retest recorded; no active shared
instinct is deployed.

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

- Python controller suite: 39 tests passed.
- CLI bridge: 14 tests passed, including tool-free evaluate arguments and
  canonical model extraction from one-model Claude `modelUsage` output.
- One native Claude transport smoke returned a tool-free response from
  `claude-opus-5-5`; it is not a full behaviour qualification and does not
  activate an instinct.

## Limits

The current corpus fixtures validate the controller only. Per-runtime context
delivery, session-end capture and full baseline/candidate qualification remain
explicitly pending in the runtime matrix. A later active rule requires a new
frozen corpus and exact-profile replay; this record cannot be reused after
guidance, profile or corpus bytes change.
