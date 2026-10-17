# cli-bridge creation log

## Purpose and ownership

The requested capability is inter-CLI delegation through native CLI transports,
with a portable standalone skill. Pulse's coordinator and existing ICM run retain
ownership. The implementation is in the approved `antigravity-cli-interop` run.

## Frozen comparison

`pressure-corpus.json` contains five frozen prompts and parent-owned verdict
rules: prompt data, uncertain submission, exit-0 tool refusal, MCP-only routing
and cyclic delegation. The operator changed the evaluation effort to `max`
before any BASELINE observation; the case prompts and oracles were unchanged.

Declared profile: `deepseek-direct`, API model `deepseek-flash`, documented model
version DeepSeek-V4.1-Flash, effort `max`, local MCP runtime
`deepseek-coder-direct 1.2.0`. No local output-token cap. The provider returns an
alias rather than an immutable model-build digest; this record establishes this
observed profile, not certification of future alias changes or other models.

The evaluator received only each case and its available guidance. It did not
receive the oracle, prior responses or evaluation history. It had no tools;
responses are proposed coordinator decisions, not claimed command executions.

## BASELINE

Control: no local cli-bridge guidance. Response ID
`29213bf5-284f-48db-a0c4-979bda231c3b`, completed; five PASS.

All declared safety decisions were already correct. The passing cases were
retained unchanged. No pressure escalation or additional warning sections were
introduced to manufacture an intervention. The new skill documents the requested
helper commands, request/result interface and actual runtime capabilities.

## RETEST

The identical case task was replayed with `SKILL.md` and `transports.md`
available. Response ID `9dd146ae-4c14-4c24-b68b-fbd0f188b9a2`, completed;
five PASS, zero regressions. C1 now selects the supplied JSON-request helper.

Full prompts, exact condition text, provider responses, actions, rationalizations
and parent-assigned verdicts are preserved under the run's
`stages/04_execute/output/verification/CLI-2/` directory. The frozen public corpus
is shipped here; private runtime traces are not copied into plugin distributions.

## Direct implementation verification

Eight Node tests passed with real local subprocesses. They exercise all four
CLI argument adapters, filesystem refusal in consultation, explicitly isolated
work, uncertain timeout without replay, cycle/depth checks, MCP routing without
OpenCode execution, bounded output, split UTF-8 and terminal-status parsing.
These subprocesses use test peers; actual authenticated CLI calls and installed
skill discovery are recorded separately in the installation node.

The skill frontmatter validator passed. Native installation and runtime evidence
are recorded in the installation node: Antigravity, Claude and Codex returned
the expected marker through the helper; a fresh Claude session loaded cli-bridge
and called Codex through it. Antigravity loaded the installed using-pulse skill
and executed status/init, with the new test run's four human gates still pending.
Codex's native skills/list also reports the standalone skill enabled.

Gemini 0.35.3 discovers the shared skill, but its current OAuth account path
returns UNSUPPORTED_CLIENT before generation. This inherited service refusal is
not reported as a working model call, and no credential or client migration is
included. The installer uses the shared agents root for current Gemini to avoid
duplicate discovery. No aggregate score or one-profile result is presented as
multi-model certification.

## Operator retirement update — skill 1.1

The operator subsequently retired Gemini CLI and OpenCode. Skill 1.1 advertises
Antigravity, Claude and Codex, retaining DeepSeek's direct MCP route. The removed
names and aliases are rejected even when tripwire executables exist in PATH.
The installer's retired Gemini option is rejected without touching Antigravity's
shared `.gemini` data. The native package can explicitly exclude an optional MCP
server; this installation excludes opencode-models.

The original frozen case prompts, oracles and recorded BASELINE were preserved.
The same five cases were replayed against skill 1.1 with the same declared
DeepSeek max profile; five PASS, no regression. Historical cases mentioning
retired actors remain evidence about refusal and recovery; they do not restore
those actors as supported transports. Full retirement inputs, response and
verdicts are retained in CLI-2's verification directory. Nine current subprocess
tests cover the reduced helper surface, including explicit retirement rejection.

## Source publication verification — 2026-10-17

The operator requested publication of the latest source on GitHub. Root review
confirmed a focused DeepSeek advisory: after the output limit, empty Buffer views
could retain subsequent process output until forced termination. The helper now
retains chunks only while capture capacity remains. A local fixture emitting
32 MiB while ignoring termination reproduces the excess retention before the
repair and verifies its removal afterward; bounded logs and no replay are also
checked. All 28 existing targeted tests pass again. The fresh native package
passes strict validation with 26 skills, three MCP definitions and no findings.
These checks concern source publication; installed copies and live account
availability were not refreshed.
