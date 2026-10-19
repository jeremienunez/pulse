# JavaScript and Electron artifacts

Use this recipe for an explicit ASAR or extracted application directory.
`analyze_javascript_application` reads its files statically; no Hopper/Ghidra
or execution of the application is needed. Follow the connected schema.

## Start with the question

Identify the relevant entry point, module, route, string or IPC channel.
For unknown/large inputs, request `detail: "summary"` when advertised.
That reduces delivery, not the underlying analysis work.

When exact inventoried source paths are known and `source_paths` is advertised,
select the needed scripts plus their supporting manifests/source maps.
Dependencies are not implicitly analyzed. `source_selection` records this
scope: an inventory of a file does not mean its source was examined.

The summary has its own Evidence ID. Its
`normalized_result.parent_evidence_id` identifies the retained complete
analysis record. Use actual returned identities for follow-up.

## Inspect one module

Page the parent's module identities, then select a returned `node_id`.
One physical path can have several graph roles.

Example input for `inspect_analysis_view` (replace the placeholder):

```json
{
  "source": {
    "kind": "retained-evidence",
    "evidence_id": "<returned parent Evidence ID>"
  },
  "view": {
    "kind": "page",
    "collection": "modules",
    "offset": 0,
    "limit": 16
  }
}
```

For an item use `view: {kind: "item", collection: "modules",
selector: {node_id: "<returned module node ID>"}}`.
Follow a page's continuation only when it matters to the question.

Use `trace_application_feature` after a seed is known. Choose its direction
from the question. Containment links can reach sibling modules; membership in a
trace alone does not identify the feature's implementation.

For IPC, follow renderer API usage, the preload exposure and the main handler,
citing their actual channel names and source locations. Static links describe
the implementation; observing execution is a separate runtime question.

## Source coverage and delivery

A module page, item or trace reads the parent's retained facts. It does not
parse previously unexamined files. If the question needs additional scripts,
change the explicit source selection and obtain new analysis Evidence.
Retain both records and explain the change in coverage. Repeating the identical
producer merely to read a smaller projection adds no source coverage.

A source-analysis limit can preserve some facts while leaving semantic links
unknown. Read the reported limits and any retained partial observation before
deciding whether a changed input or resource choice is useful.

## CLI

Save the complete record before projecting it:

```sh
rea analyze-javascript-application /absolute/path/to/app --json > app-evidence.json
```

Use a JSON reader already available in the environment. The public
`inspect-analysis-view` CLI accepts a JSON request with
`source: {kind: "inline", evidence: <complete saved record>}`.
A summary is not the complete source record to supply here.

For recovery, comparisons and less common graph facets, consult the
[pinned upstream guide](https://github.com/morluto/rea/blob/d5fc7e6ebf9af050081fc4c6e18b9079cfaa5cdc/.agents/skills/reverse-engineer-anything/references/javascript-applications.md)
and the runtime's actual schema. Recovery may need caller-supplied Wakaru;
it is a separate capability from static application analysis.
