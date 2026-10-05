# Controlled action evidence

The [action corpus](recursive-skills/action-corpus.json) measures five derived regression fixtures with the unchanged `systematic-debug-fix` body and its three declared references. AP1–AP3 are repair cases; AP4/AP5 stay reserved until final freeze. These fixtures do not prove full repository behavior or an improvement of the skill. The author knows the oracle.

Initialize the existing cycle with `--evidence-mode action`. Decision remains its default; old manifests and evidence v4 remain unchanged. Only the approved root single-worker run owns the cycle. The [action evidence module](../../scripts/lib/pulse-skill-action-evidence.mjs) is pure: it binds fixture/check bytes, condition, packet, captures and criterion references, and keeps behavior, trace, action observation and qualification separate.

```text
node scripts/pulse-skill-iteration.mjs init --evidence-mode action --repo-root OWNER --run-file history/FEATURE/run.json --cycle CYCLE --corpus CORPUS --condition CONDITION --observation OBSERVATION --max-calls 5
node scripts/pulse-skill-action-runner.mjs inspect --cycle CYCLE
node scripts/pulse-skill-action-runner.mjs run --cycle CYCLE --case-id AP1 --condition-id control --inspection INSPECTION
```

The [runner](../../scripts/pulse-skill-action-runner.mjs) uses the installed App Server and a temporary parent controller. The client runs without external network access. A namespace-local HTTP CONNECT proxy preserves native ChatGPT URLs and accepts a temporary CA only in that client. The parent relays one allowlisted account-discovery GET; analytics, arbitrary destinations and WebSocket upgrades are blocked. Native HTTP compression is disabled for this fixed profile. The runner records the effective projection, removing undeclared orchestration context and tools while keeping the frozen packet and admitted conversation history. Only `fixture_read`, `fixture_patch` and `fixture_test` are declared.

All provider response items are admitted together before dispatch. Unknown events/types, aliases/namespaces, malformed arguments, foreign thread/turn/call IDs and repeated submissions fail closed. Every fixture handler is independently captured by the parent. The [fixture worker](../../scripts/lib/pulse-controlled-fixture.mjs) mounts only installed runtime resources and the fixture readonly in Bubblewrap PID/network namespaces. Source, home, credentials, archive and private judge are outside that worker. Patch operations are bounded, allowlisted and atomic with a verified preimage. Public verification accepts no arbitrary command. Private checks run separately after the client closes.

Inspection sends no inference upstream and consumes no cycle call. Its capture, runtime/code/configuration identities, policy probes and ten-minute lifetime bind later submissions. A changed runtime requires a fresh inspection. A native reservation occurs before launch; uncertain or failed submissions are preserved and never automatically replayed. Subsequent tool rounds within an attempt may submit new conversation state; an identical uncertain provider request cannot be retried.

The returned judge envelope is intentionally incomplete until the parent judges it. Preserve capture bytes, then fill each frozen criterion with a verdict, reason and references to `response`, `trace:CALL_ID`, `check:CHECK_ID` or `file:PATH`. Quotes must occur in their source. Checks and aggregates cannot contradict captured exit status. Finish using the existing cycle command; compare AP1–AP3, freeze the final condition, then run AP4/AP5.

Missing immutable model version limits this pilot to at most five control attempts, with no guidance intervention or promotion. Requested labels, bundled catalogs, CLI versions and model self-claims do not certify an executed version. Operational failure stays operational; fixture-only tests stay synthetic. No install, commit, push or integration into the canonical source occurs before the existing review gate.

Verification: `node --test scripts/test-pulse-skill-action-evidence.mjs scripts/test-pulse-controlled-fixture.mjs scripts/test-pulse-skill-action-runner.mjs scripts/test-pulse-skill-iteration.mjs`. The runner suite uses a scripted backend and the installed CLI; it does not perform model inference.
