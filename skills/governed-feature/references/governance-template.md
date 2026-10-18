# Governance Overlay Template

Copy this template to `history/<feature>/governance.md` only for a `strong` fitness result. Remove instructional placeholders while preserving the section structure.

Use the active runtime's approved intent for Authoritative context: the decisions path below for ICM v2, or `history/<feature>/CONTEXT.md` for an existing legacy v1 run.

## Governance Metadata

- Feature: `<feature>`
- Fitness: `strong`
- Change class: `<new | intent-change | preserve | containment | test-only>`
- Overlay status: `<draft | in-review | current | needs-refresh>`
- Authoritative context: `history/<feature>/stages/01_explore/output/decisions.md`
- Context approval/version: `<approved marker or revision>`
- Last reviewed: `<ISO-8601 timestamp>`

## Requirements References

Reference approved intent; do not rewrite it.

| Decision/scenario ID | Derived acceptance mapping | Notes |
|---|---|---|
| `<D-n or S-n>` | `<what the overlay must make traceable>` | `<none or clarification>` |

### Scope In

- `<governed behavior or boundary>`

### Scope Out

- `<explicit exclusion>`

## Entities

| Entity / concept | Responsibility | Owner boundary | Invariants |
|---|---|---|---|
| `<name>` | `<one responsibility>` | `<module/team/system>` | `<observable invariant>` |

## Approach

### Chosen Approach

`<approach tied to approved intent and repository reality>`

### Trade-offs

| Choice | Benefit | Cost / risk |
|---|---|---|
| `<choice>` | `<benefit>` | `<cost>` |

### Rejected Alternatives

| Alternative | Rejection reason | Revisit trigger |
|---|---|---|
| `<alternative>` | `<evidence-backed reason>` | `<condition or never>` |

## Structure

| Boundary / component | Responsibility | Dependencies | Owner | Constraint |
|---|---|---|---|---|
| `<boundary>` | `<responsibility>` | `<dependencies>` | `<owner>` | `<constraint>` |

## Operations

Keep IDs stable. Add new IDs monotonically; mark removed behavior `retired` without reusing its ID.

### OP-1 — `<observable operation>`

- Status: `<active | retired>`
- Intent refs: `<D-n, S-n>`
- Actor / trigger: `<who or what initiates it>`
- Preconditions: `<required observable state>`
- Behavior: `<externally meaningful result>`
- Postconditions / invariants: `<state guaranteed afterward>`
- Failure behavior: `<observable failure contract>`
- Verification target: `<lowest sufficient proof layer>`

## Norms

| Norm ID | Rule | Applies to | Evidence / enforcement |
|---|---|---|---|
| `N-1` | `<must / must not rule>` | `<boundary or OP-n>` | `<check or review owner>` |

## Safeguards

| Risk / invariant | Prevention | Detection | Recovery | Owner |
|---|---|---|---|---|
| `<risk>` | `<preventive control>` | `<signal or check>` | `<recovery behavior>` | `<owner>` |

## Traceability

| Decision/scenario | Operation | Invariant / safeguard | Verification target | Evidence status |
|---|---|---|---|---|
| `<D-n or S-n>` | `<OP-n>` | `<invariant or safeguard>` | `<test/check/UAT>` | `<planned | observed | stale>` |

## Review Record

| Date | Reviewer / role | Scope | Finding | Resolution |
|---|---|---|---|---|
| `<date>` | `<human or agent role>` | `<sections or IDs>` | `<finding or none>` | `<action/status>` |

## Open Blockers

| Blocker | Affected IDs | Required owner | Exit evidence |
|---|---|---|---|
| `<blocker or none>` | `<D-n / OP-n>` | `<owner>` | `<proof>` |

## Approval State

- Structural completeness: `<unchecked | complete | incomplete>`
- Semantic review: `<pending | accepted | revise>`
- Human Pulse gate: `<not-requested | pending | Gate n approved>`
- Approval evidence: `<artifact or user decision reference>`

Structural completeness is not semantic correctness and does not grant human approval.
