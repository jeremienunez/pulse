# Impeccable adaptation into Pulse design

`pulse:design` is a Pulse-owned web interface support skill, adapted from selected Impeccable guidance. Pulse retains the delivery graph, artifact ownership, approval gates, revision mechanics and review severity.

## Pinned source

- Repository: [pbakaus/impeccable](https://github.com/pbakaus/impeccable).
- Skill/plugin: `4.5.2`, commit [`245ad82def45831dc56a21b683c7a1ff530b06cc`](https://github.com/pbakaus/impeccable/tree/245ad82def45831dc56a21b683c7a1ff530b06cc).
- License: Apache-2.0; [included license](../../skills/design/LICENSE) and [modified-adaptation notice](../../skills/design/NOTICE).
- License SHA-256: `02bb8c3b4e70190e3986c0404ad2fd8d639b4f534252d82379cc1b502b6d1812`.

The references are rewritten and condensed, not copied as a second runtime. The notice identifies the modifications and preserves upstream's third-party notice, with native-platform material explicitly outside this selection.

## Source hashes

Paths are relative to the pinned upstream repository. Files inform the adaptation; agents load the three Pulse guides rather than the upstream catalogue.

| Source path | SHA-256 |
| --- | --- |
| `skill/SKILL.src.md` | `78573ef57390d37ece0366e2746b1dda6a20e2a74352a0abc2e6d05518e87d47` |
| `skill/reference/shape.md` | `a55f016c046cb6a27c55bd7f346375aeb506a755c4fbca19a5f92dbd42309c23` |
| `skill/reference/new-work.md` | `261898ae1223293f5ef576a2e1b8b4a1886ba3eb11c4fedc71aed7fc7a585f3d` |
| `skill/reference/mode-operate.md` | `7a52dd7a94ee75f6ae89542c86a1b6e1d306812b16e0d9dbf12d4acad44d148b` |
| `skill/reference/mode-read.md` | `a569989e6a3d6453b4c45e9474e162a15cc54e11732ac6baa7990a6e7cccc0b5` |
| `skill/reference/mode-persuade.md` | `b3f8b39cbf89392b62c07298361fb2a7e8e0b4ef13bbb38bac974ccd8fd835fd` |
| `skill/reference/craft-floor.md` | `db4dfe2f0b316a94026b89e8cb3c9026042e661ca156dfae747a733e1ab500ed` |
| `skill/reference/polish.md` | `c504e12ea076fd1a57b8c9ece79fbb532c54226b2b6298c5c62fa889ae1dd34d` |
| `skill/reference/typeset.md` | `bf0259f5b8363d09591885ca6b27ac97bbdf754c130fb2799b949d783a97186b` |
| `skill/reference/layout.md` | `14ba132b6168bf0a7498f8c3fbbb41b73ff704da5dc3688fd842807446e54a05` |
| `skill/reference/harden.md` | `6674a6fc1eb681f2ad266dc0a3a71cec29dc4dcd3a1ff91195d2302582fa7c58` |
| `skill/reference/adapt.md` | `fe0f1e0a642575737711ad93f22482b8469c021ffd587f94910893683cb8f316` |
| `skill/reference/clarify.md` | `4738e125835bd6c166aec2622977c9bc59bada52aaeb186585ed38b3900860b5` |
| `skill/reference/animate.md` | `59f38d50c799aa47ecd7288c69dce0245d8c3e3e2368b29499d583996b5030b3` |
| `skill/reference/critique.md` | `8d2cdf4f583a0caf7685620069069354b4fb81582fb63c349783298454140a0e` |
| `skill/reference/audit.md` | `d2aa90f30ba7a0082d242ab69a2a9d46298abb5f36b43308fe7e3c36fa9a9056` |

## Adaptations and boundaries

| Contribution | Selected methods | Pulse ownership |
| --- | --- | --- |
| [Framing](../../skills/design/references/framing.md) | Surface modes, audience/job/content/constraints, established identity, grounded structural choices | Task spec when needed, then approved decisions |
| [Implementation](../../skills/design/references/implementation.md) | Task hierarchy, typography, layout, copy, relevant states, adaptation and useful motion | Approved graph node and its verification |
| [Review](../../skills/design/references/review.md) | Observed visual reading followed by technical evidence, assessable findings | Existing root review, P1/P2/P3, UAT and revisions |

The entry selects one contribution by current activity. Existing project docs, tokens, components and assets provide context. No new PRODUCT/DESIGN document is mandatory. Backend work and exact label corrections trigger no creative contribution. New or explicitly replaced identity can open structural directions; an extension uses its existing system.

Excluded: engine and detector binaries, launchers, hooks, vendor agents, `.impeccable` state/storage, live/generate variants, concept-seed dice/catalogue, mandatory cascaded commands and native-platform references. Absolute aesthetic bans and numeric craft defaults become contextual methods; this adaptation adds no numeric accessibility standard or required animation.

## Evidence boundary

The pre-change control was Pulse commit `93966e677acfffce4ae77bc413f861e10bc38fd9`, with the design module genuinely absent. Five frozen decision cases compared its current guidance with this candidate: E1 and R1 already passed, N1 exposed audience/factual-framing and inspected-reference omissions, and B1/M1 constrained nonactivation. All thirteen required candidate criteria pass; only the two observed N1 gaps support the intervention. Conditional framing contributions were added to brainstorming/exploring; no new executing/reviewing hook was justified.

The [creation log](../../skills/design/CREATION-LOG.md) and [evaluation protocol](../evaluation/design-integration.md) preserve scope. The canonical source run is `history/impeccable-integration/`. Native executed model/version/reasoning and full trace were unavailable; N1's approved single-read setup conservatively invalidates a zero-tools proof. The first shortened N1 attempt was excluded and counted. Global qualification rules and automated ineligibility remain unchanged.

The user explicitly authorized a bounded diagnostic comparison and human adoption path for this cycle. Two local fictional structures were rendered in installed Chrome, with measured CSS viewports and exercised relevant keyboard/states; the user selected D1. NA1 preserved the exact mechanical scope. This supports a source proposal for human Pulse review, with no automatic model certification, discovery proof, universal craft improvement or inherited compatibility claim. Another upstream version or model/profile needs its own evidence.
