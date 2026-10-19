# Connection and recovery

Read this guide for an observed blocker. Diagnose the operation that failed
and retain the original target/question. If the connected tools already work,
continue the investigation with their actual schemas.

## Choose the remedy

| Observation | Next step |
| --- | --- |
| No REA tools in the active client | Distinguish registration from an active connection |
| Registration missing, malformed or stale | Prepare a scoped configuration repair |
| Registration aligned, tools still absent | Inspect the launch error / reconnect the affected client |
| One provider unavailable | Inspect that operation's availability and its prerequisites |
| CLI missing only in a child shell | Check that shell's PATH and launcher |
| Client policy rejects a tool call | Use the client's actual approval flow; engine setup is unrelated |

Existing installed commands:

```sh
rea doctor --client codex --json
rea setup --client codex --dry-run --json
```

Client IDs maintained by Pulse are `codex`, `claude_code` and
`antigravity`. Doctor/registration checks do not prove that tools appear in
the current agent session.

## Configuration and package acquisition

Show the dry-run plan's exact paths, backups, configuration changes and any
bundled upstream-skill replacement. Apply the same concrete scope when it is
authorized, preserving prior authorizations. Do not add an approval question
for every already authorized analysis call.

Installing this Pulse skill neither registers REA MCP nor installs providers.
An existing REA CLI remains useful without MCP. When package acquisition is
within scope, the evaluated package reference is `rea-agents@6.5.0`; use a
version-pinned local invocation instead of an implicit `@latest` update.
For example, after acquiring that package:

```sh
npx --yes rea-agents@6.5.0 analyze-javascript-application /absolute/path/to/app --json
```

This invocation may populate npm's cache. It is a CLI analysis, not a setup
or proof of MCP connection. Follow the installed CLI's help if its version
differs. No package command runs merely by loading the skill.

Native decompilation, Android and firmware workflows use their selected
bring-your-own tools. Static JavaScript needs no native engine. REA setup does
not install or upgrade Node/npm, Java, Ghidra, IDA or unrelated prerequisites;
provider availability is separate from client registration.

After an authorized connection repair, verify the actual tools appear and
resume the original question. If they do not, inspect the launch failure
rather than repeating setup.

For a CLI JavaScript result, save the complete record and use the
[JavaScript](javascript-applications.md) / [Evidence](evidence-workflows.md)
recipes. Ordinary shell observations stay labeled as shell observations.
