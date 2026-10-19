# Native, managed and packaged artifacts

Choose the route from the supplied artifact and the analyst's question.
The names below refer to public REA operations when advertised by the runtime.

| Question / input | First route | Boundary |
| --- | --- | --- |
| Native executable, library or analysis database | `open_binary`, then focused searches/function tools | Selected Hopper, Ghidra or IDA provider |
| ZIP/APK/IPA/MSIX/AppX/DMG inventory | `open_binary`, then `inspect_artifact` when useful | Package inventory does not execute its members |
| PE/CLI managed assembly | `inspect_managed_artifact` | Static metadata/CIL; no native engine |
| Embedded Go/Rust build metadata | `inspect_go_binary` / `inspect_rust_binary` | Explicit local artifact; no language runtime needed |
| Offline ELF layout | `inspect_binary_layout` | Caller-supplied provider/prerequisites |
| Local WASM sections and WAT | `inspect_wasm_artifact` | Caller-supplied WABT; decoded representation |

For Android code, firmware extraction and other formats, use the
[pinned upstream artifact recipes](https://github.com/morluto/rea/blob/d5fc7e6ebf9af050081fc4c6e18b9079cfaa5cdc/.agents/skills/reverse-engineer-anything/references/native-and-artifacts.md)
with the selected runtime's availability. Code inspection, archive inventory
and extraction have distinct prerequisites and effects.

## Bind the analysis

Open only the target selected for the task. Use focused search, pseudocode,
assembly, callers/callees and cross-references from that binding.
`binary_overview` is useful when supported; IDA does not supply it.

`binary_session` reports target identity, selected provider and tool
availability. Provider candidates are possible routes; top-level capabilities
describe the current binding. `tools/list` supplies the canonical schemas.
A missing provider affects operations requiring that provider, not every
static inspection route.

For IDA, use the original input binary with `provider_id: "ida"`, rather
than an attached `.idb`/`.i64` database. Retain the returned identity/binding
and leave a user-owned GUI database open and unsaved.

## Interpret the result

Pseudocode and recovered names are analysis results, not original source.
For Ghidra, `read_bytes` reads analysis memory, potentially including loader
fixups; it is not a live-process read or necessarily the original file bytes.
Retain source ranges and mapping/coverage limits when relating addresses to bytes.

Metadata claims embedded in a binary do not authenticate themselves.
Missing build metadata does not prove the binary's language or dependencies
are absent. Complete page traversal and complete source coverage are distinct;
see [Evidence workflows](evidence-workflows.md).

Use retained function dossiers/views for a focused follow-up rather than
repeating analysis. Comparisons need compatible artifact/provider identities
and the coverage required by the claim.

## Finish

Export supporting Evidence that must survive the session. Close the REA
session opened for the investigation with `close_binary` when finished,
respecting its real cleanup outcome. An attached application/database still
belongs to the user; do not save or close that GUI on its behalf.
