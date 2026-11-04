# Pulse / Onii discovery: scope and evidence closure

This record accepts the discovery as a study supported by prototype evidence. It does not declare a complete Onii product, production readiness or cross-platform parity. The figures below come from retained historical reports; their tests were not rerun for this publication.

## Accepted direction

- Build on proven desktop, agent, storage, provider and distribution capabilities before adding new runtime machinery.
- Retain Onii, the otter identity and the accepted visual direction for a workspace covering development, research, design and automation. Visual acceptance does not certify every interaction.
- Keep Pulse/ICM responsible for delivery state and approvals. Existing mailbox protocols and stores retain their own responsibilities.
- Treat the earlier greenfield architecture and twelve-lot roadmap as historical alternatives, superseded by the preference for reuse.

The approximately 95% understanding target concerned familiarity with relevant functionality and mechanisms. It was not a claim that 95% of a new product had been implemented or certified.

## Recorded evidence and its boundaries

| Evidence | Recorded result | Boundary |
| --- | --- | --- |
| Native API audit | 547 of 615 request IDs had a domain case; 69 selected suites recorded 1,608 checks | These are different units, not a product-completion percentage. They do not establish every branch or every operating system. |
| Remaining API cases | 68 request IDs lacked a domain case | The audit was closed on 31 October 2026. Further exhaustive probing was no longer a prerequisite for integration; the gaps remain documented. |
| Team / Atelier / Studio POC | Native navigation, retained draft/frame state, contextual file association and restoration after reload were reported | This demonstrates navigation and file-reference integration, not a unified agent execution system. |
| Focused POC checks | The POC report records 24 OpenBot tests and two design-boundary tests, plus affected typechecks and changed-file checks | These checks are separate from the API-audit totals. Broad suites and packaged or multiplatform release checks were not run. |

The [audit closure receipt](evidence/pulse-onii-discovery/round12-audit-closure.json) records no additional native test or environment launch in its final source-review pass. Its remaining source-only analysis did not establish a new positive account-free path for the reviewed account/billing cases.

Missing evidence for data integrity, permissions, migrations or an essential user journey remains a blocker for a future implementation slice that depends on it. Optional account- or OS-dependent gaps do not automatically block unrelated slices.

## Evidence inventory

The receipt below is included unchanged. Other evidence remains local and is identified by its inspected content digest. A digest identifies an artifact; it does not make unpublished evidence independently reproducible.

| Artifact | SHA-256 | Availability |
| --- | --- | --- |
| Reuse framing (`cadrage-reutilisation.md`) | `859ff6e22732ca351f0c50e3c446fb5797d5701e6c249e02abf1879633d32aeb` | Local evidence; not bundled |
| [Round 12 audit closure](evidence/pulse-onii-discovery/round12-audit-closure.json) | `a93b96eb159f26c50c1eed0e557e256b9f84ecbb3b9e4648ef70c1ceb4a38c9e` | Published metadata receipt |
| Unification POC README | `86dc690b655d3a9548e1f83c4198de61c5374b1d1b12826c5d4b3759d1011350` | Local evidence; not bundled |
| Unification POC ICM report | `f03ea708c50073384b748cc2ebcb1c1b02090765f8101a2fa3426bc40177ca31` | Local evidence; not bundled |

The discovery used Pulse source at `a7a61a5e9e91f55f29abaabd5f1c6336621a9bf8` and an OpenBot audit snapshot at `8d1db276a248302fd0ef38cc2c01a7ba9dca04b5`. Source, prototype and installed-release observations keep their separate provenance; a result from one is not transferred to another.

## Decisions deferred to a future product lot

The following are deliberately outside this documentary closure:

- The concrete reuse modality, including interfaces, integration or a fork, and the applicable licensing conditions.
- Product V1 boundaries, the first pilot and its budget, distribution and the Linux confinement qualification.
- The parent native bridge for folder selection, capture/PDF and export handoff, and the explicit team-to-design tool adapter.
- Atomic expected-version file writes, cancellation, restart, recovery and queued-task behavior.
- Packaging, essential export/import journeys and separate qualification on other operating systems.
- A Rust replacement of agent/team capabilities after stabilization. No Rust port or complete behavior-parity claim follows from the POC.

The retained standalone design modules remain distinct from the carrier. A contextual channel/file association is not a new workflow authority or permission grant.

## Publication and next-work boundary

This publication contains this synthesis, one metadata receipt and its documentation-index entry. It includes no user profiles, credentials, private fixture identifiers, raw transcripts, databases, VM images, dependencies or copied application trees.

The canonical ICM run remains responsible for approval and delivery status. This document does not substitute for its gates. Shared agent memory, Dream integration changes and optional GitNexus use belong to a separate scope after this run's documentary delivery is completed.
