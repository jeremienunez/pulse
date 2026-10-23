---
name: visual-assets
description: "Use when selecting or producing specialized visual assets, geometric SVG guides, symbolic shotboards, manual beat/cut cue sheets or code-rendered layered explainers, including image-input, vector-export and accepted brand-asset briefs."
metadata:
  version: '1.1'
  ecosystem: pulse
  position: 'support skill — loaded by capability need'
  dependencies: []
---

# Visual assets

Start through `pulse:using-pulse` and contribute to its current task. Resolve the asset's job, required effect, image role (`material`, `reference` or neither), output format, controls, rights and constraints before selecting a method.

Read [routing](references/routing.md) and inspect the relevant record in the [capability catalogue](references/capabilities.json). Compare effect, input, output and availability as separate fields:

| Method | Input/process | Output and fit |
| --- | --- | --- |
| Threading | An image as material for a thread/peg process | Native vector SVG string art, when its local profile and driver are available |
| Primitive | An image approximated by selected geometric shapes | Native geometric SVG; a different effect from string art |
| Nonflowers | Seeded procedural drawing | Raster; an external reference in this release |
| Book of Shapes | External shape/pattern authoring | Final assets under its licence; no bundled pattern library or generator |
| Composition guides | Geometry/focus and optional raster image | Editable SVG planning overlay; an embedded image remains raster; external recipe |
| Shotboard | Direction JSON, symbolic camera/subject/light positions | Markdown cards and schematic SVGs, without photometry; external recipe |
| Beatmap | Manual BPM/downbeat or known times, duration, fps, subdivision | Ideal/quantized times, frames, cuts and collisions; external recipe, no audio analysis |
| Layered explainer | Project JSON, independent image layers, fonts, optional audio | Code-composed frames, MP4 and editable project/assets when requested; external recipe |

Match every firm requirement, then establish actual availability with the capability's inspection path. A record describes a contract; it does not attest an installed source/profile or a successful export. Selection remains separate from admission and execution. A missing required capability returns to validation/revision before an effect is attempted.

The four Visual Direction additions have no Pulse local adapter. Use their methods to prepare a brief, overlay plan or timeline without installing a helper. [Beatmap](references/beatmap-workflow.md), [explainer production](references/explainer-production.md) and [project format](references/explainer-project-format.md) retain complete standalone recipes and corrected limits. Actual execution requires a separately inspected/admitted source, dependencies, bounded inputs and fresh output paths. Prompt or photo-brief work requires no Python, Pillow, FFmpeg or image-provider account.

For open expressive choices, load the common [cultural method](../design/references/cultural-digging.md), keeping its tree and root substance review in the same task research. [Design](../design/SKILL.md) owns composition and motion guidance. An accepted direction and its relevant research can be reused.

After an admitted local operation, preserve its exact input, rights basis, source/profile, parameters, operation identity, native output and receipt. Inspect the output in its intended composition. Follow the method's bounds and failure rules. Never equate an unavailable method, a catalogue label or a proposed test with an executed export.

Use [brand assets](references/brand-assets.md) when the brief asks for a coherent family. This skill adds no lifecycle, retrieval service, provider account or budget. Its creation log records the decision diagnostics and their qualification limits.
