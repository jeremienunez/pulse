# Pulse Tuning — Candidate Delta Scenarios

Date: 2026-08-04
Purpose: test proposed Superpowers deltas that were not justified by the first portability corpus.

Expected contracts were frozen before responses were collected.

## A1 — Test-only production API

> Tests need to clean a workspace after each case. The production `Session` type does not own workspace lifecycle and no runtime caller needs `Session.destroy()`.
>
> A) Add public `Session.destroy()` because tests need it.
> B) Put cleanup in a test utility that calls the actual workspace owner; add a production API only if a real runtime lifecycle requires it.
> C) Add a hidden `testing` boolean to `Session.destroy()`.

Expected contract: B.

## A2 — Mocking a dependency with required side effects

> A duplicate-account scenario calls `createAccount()` twice. That function writes the uniqueness index and then sends email. Email is slow, so the test currently mocks all of `createAccount()` and can no longer observe the duplicate.
>
> A) Keep mocking `createAccount()` and hard-code the duplicate error on the second call.
> B) Preserve the real account/index behavior and replace only the external email boundary with a test double after verifying the dependency path.
> C) Remove the duplicate scenario and rely on unit tests of the index helper.

Expected contract: B.

## A3 — Contract-faithful test doubles

> A client consumes a versioned API response. A hand-written fixture uses `as any` and omits metadata that downstream retry logic reads. Tests pass while production retries fail.
>
> A) Keep the smallest fixture because each test should define only what it reads directly.
> B) Build the fixture through the real response contract or a schema-validated builder, including contractually required downstream fields while allowing irrelevant optional fields to default.
> C) Delete unit tests and use only live API integration tests.

Expected contract: B.

## R1 — Existing Pulse review prompt against missing and extra scope

Evaluator setup: read `skills/reviewing/references/review-agent-prompts.md` and act as Agent 1 `code-quality` using only this synthetic context and diff.

Synthetic `CONTEXT.md`:

```text
D1: `report export` emits JSON to stdout.
D2: This task must not add persistent state or new CLI flags.
```

Synthetic diff:

```diff
+const exportCache = new Map<string, string>();
 export function exportReport(report, args) {
+  if (args.includes("--cache")) exportCache.set(report.id, "seen");
-  return JSON.stringify(report);
+  return toYaml(report);
 }
```

Expected contract: independently flag both the missing/changed D1 behavior and the unrequested D2 cache/flag. Do not accept the diff because it is readable, and do not invent unrelated findings.

## Results

| Scenario | Profile | Choice / Result | Verdict |
|---|---|---|---|
| A1 | `gpt-5.6-terra` / low | B | PASS |
| A2 | `gpt-5.6-terra` / low | B | PASS |
| A3 | `gpt-5.6-terra` / low | B | PASS |
| A1 | `gpt-5.6-sol` / medium | B | PASS |
| A2 | `gpt-5.6-sol` / medium | B | PASS |
| A3 | `gpt-5.6-sol` / medium | B | PASS |
| R1 | `gpt-5.6-terra` / low + current Pulse prompt | Both D1 and D2 flagged | PASS |
| R1 | `gpt-5.6-sol` / medium + current Pulse prompt | Both D1 and D2 flagged | PASS |

### Verbatim Rationalizations

`gpt-5.6-terra` / low:

- A1: “Tests do not justify expanding the production Session API; add lifecycle methods only for real runtime ownership needs.”
- A2: “It tests duplicate-account behavior without hiding the uniqueness side effect.”
- A3: “It preserves unit-test speed while exercising the actual versioned contract and preventing `as any` omissions that break production retries.”

`gpt-5.6-sol` / medium:

- A1: “Adding Session.destroy() would expose a misleading production API solely for tests, while a hidden testing boolean would create environment-dependent behavior and obscure lifecycle ownership.”
- A2: “This exercises the duplicate-account behavior and its index side effect while keeping the test deterministic and preventing real email delivery.”
- A3: “This keeps tests aligned with the production contract and prevents omitted downstream fields from silently passing type checks.”

### R1 Findings

Both profiles independently reported:

- D1: YAML output breaks the locked JSON contract, with `report export | jq .` as a concrete failure.
- D2: the new `--cache` flag and process-lifetime `Map` violate the prohibition on flags and persistent state.

### Interpretation

The proposed standalone `testing-anti-patterns.md` import is not supported for the initial certified profiles: all three targeted behaviors pass without it. The existing Pulse code-quality review prompt also catches missing and extra scope on both profiles, so no review-prompt edit is justified by R1. Keep the source material and scenarios as future portability probes; add guidance only when a declared target fails.
