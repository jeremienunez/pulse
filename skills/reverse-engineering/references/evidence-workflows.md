# Evidence, coverage and resumption

REA Evidence is the technical source record. Preserve its `evidence_id`,
subject/provider/profile, parameters, raw/normalized results, source locations,
confidence, authority, limitations, relationship coverage and links as returned.
Pulse's stage report can reference that record without redefining its schema
or replacing REA's session ledger.

An `observed` static fact can be a byte or source observation; the confidence
label alone does not say the application was executed. Keep observations,
derivations, inferences and remaining unknowns explicit.

## Two different kinds of completeness

- **Source coverage:** which artifacts/scripts were actually examined and
  which facts/relationships were resolved.
- **Delivery coverage:** which portion of retained Evidence a summary, page or
  item displays.

Finishing a page sequence does not complete an unfinished source analysis.
Reading a complete retained record does not extend its `source_selection`.
A trace over that record traverses already retained facts, not unexamined files.

To investigate omitted files, change the explicit analysis input/source
selection and obtain new Evidence for that scope. Keep the previous parent
and explain the coverage change. Use a retained view for information already
analyzed; do not repeat an identical producer to bypass a truncated display.

The supported summary's `parent_evidence_id` belongs to the same REA
connection. A summary/view has its own identity, distinct from that parent.
Use returned module/node identities where paths have multiple graph roles.

## Keep useful evidence beyond the session

Use `export_evidence_bundle` when a complete session bundle is needed,
with an output path selected within the task's authorized evidence location.
For CLI analysis, save the complete JSON Evidence before projecting it.
A complete portable record can be read after the producing process exits.

Retained references are session-bound and can be cleared on close.
After resumption, read the actual export/record and its target identity.
An old Evidence ID or historical observation does not establish current state.
If no portable supporting record exists, explain the missing evidence rather
than inventing it or replaying an uncertain runtime effect.

When the runtime exposes `record_unknown` / `update_unknown`, use its
actual revisions and supporting/contradicting Evidence. The current Pulse
artifact keeps the delivery question and outstanding work; it is not another
global unknown registry.

## Comparisons

Compare compatible complete records/page sets for an absence or equivalence
claim. `compare_artifacts`, `compare_functions` and `compare_bundles`
address different identities/scopes. Static differences are candidates for a
behavioral change, not causal runtime proof.

A reconstruction check covers its declared finite claims. Return which
questions are answered, partial or unresolved in the task's existing report
or UAT layout. No extra durable report format is required.

See the [pinned upstream Evidence recipes](https://github.com/morluto/rea/blob/d5fc7e6ebf9af050081fc4c6e18b9079cfaa5cdc/.agents/skills/reverse-engineer-anything/references/evidence-workflows.md)
for additional views and comparison operations supported by the connected runtime.
