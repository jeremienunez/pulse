# Production playbook: code-based collage explainers

> Retained method from `code-animated-explainer/references/production-playbook.md` within `pulse:visual-assets`. The current Pulse run owns its decisions and evidence. [Local adaptations](../../design/references/visual-direction-adaptation.md) distinguish direction from external standalone recipes.


## The five steps actually shown in the Reel

1. Find and save a visual style reference.
2. Upload reference image and idea to Claude.
3. Generate scene stills in that style with Higgsfield MCP.
4. Select a separate motion skill to animate the scenes.
5. Animate images piece by piece in code, timed to voiceover.

The Reel demonstrates an ancient Egyptian sci-fi explainer, with surreal
vintage cutouts, paper-tear wipes, graphic title cards, and a voiceover.
The concrete method for source segmentation, animation and rendering is
not revealed. Treat all steps below as **implementation choices**.

## Example: script and edit beats

An original 12-second speculative explainer on comets:

| Global time (example) | Spoken phrase | Visual event | Files |
|---|---|---|---|
| 0.0–2.8 s | “For centuries, comets seemed to appear from nowhere.” | Telescope observer rises; comet enters above | observer.png, comet.png, sky.png |
| 2.8–5.5 s | “Some feared they were messages from the sky.” | Handwritten notes pivot open around a star | notes.png, star.png |
| 5.5–8.7 s | “Then we learned they follow enormous paths.” | Orbital track reveals; comet follows a curve | orbit.png, comet.png |
| 8.7–12.0 s | “Their return was a pattern, not a warning.” | Repeat comet apparition, final title holds | comet.png, title typography |

The times above are *storyboard estimates*. Once real narration is recorded,
replace them with measured timecodes. A word-level timed narration demands
transcription with timestamps or manual audio editing; the sample renderer
cannot determine speech onsets.

## Layer-to-code handoff

For every scene, give the coding agent:

- scene name, start/end, script text and asset filenames;
- background image and individually cut subject/object PNGs;
- base position, width, z order and each keyframe transform;
- transitions and camera movement if present;
- captions with safe areas and exact on-screen interval;
- voiceover file plus verified cue timecodes.

Plan no more than 1–3 new visual events per spoken phrase. Prefer a stable
readable scene over nonstop motion.

## Example keyframe design

```json
{
  "src": "assets/hand-cutout.png",
  "x": 0.64, "y": 0.50, "width": 0.38, "z": 8,
  "keyframes": [
    {"t": 0, "dx": 0.18, "dy": 0.02, "rotate": 11, "opacity": 0},
    {"t": 0.4, "dx": 0, "dy": 0, "rotate": 0, "opacity": 1, "ease": "ease-out"},
    {"t": 1.4, "dx": 0, "dy": -0.01, "rotate": -2, "ease": "ease-in-out"}
  ]
}
```

The layer starts just off-position, snaps gently into place over ~0.4 s,
then drifts slightly while the narrator continues. This is a visual cue,
not motion learned from video diffusion.

## Python/FFmpeg reference path

1. Build `code-animated-explainer/examples/demo-project.json` in the external source or a scene plan using user assets.
2. Resolve each transparent layer file. Confirm alpha actually exists.
3. Validate durations and narration length.
4. Sample keyframe transforms at each frame using eased interpolation.
5. Rasterize per-layer transforms in ascending z order.
6. Zoom/pan the artwork using optional scene camera keyframes.
7. Add captions separately so camera movement does not move text.
8. Composite a jagged tear wipe when entering a new scene.
9. Encode frames via an FFmpeg stdin pipe to H.264 4:2:0 MP4.
10. Add voice/music (if supplied) through a second FFmpeg pass.
11. Watch the entire result to check lips? (Do not assume any speaking
    cutout has lip-sync. This sample engine does not lip-sync characters.)

## TypeScript/React alternative

For a web-first agent, translate the scene plan into **Remotion** components:

- `AbsoluteFill` for base plate and layers;
- `Img` for extracted transparent artwork;
- `useCurrentFrame()` and `interpolate()` / `spring()` for every keyframe;
- `Sequence` for scene-relative timings;
- SVG mask or `clipPath` for torn-paper transition;
- `Audio` for narration/music and `renderMedia` for MP4 export.

Mapping frame time: `frame = round(seconds * fps)`. A Remotion composition
should keep captions outside animated camera scale transforms. This is a
**blueprint**, not an assertion that the bundled Python script outputs a
fully equivalent Remotion project.

## Higgsfield MCP handoff notes

- Use the connected model catalog and per-model constraints rather than
  inventing IDs or ratios.
- If the user authorizes image generation, use still-image generation tools,
  not `generate_video`; check credits/cost and job status as required.
- For numerous independent stills, batch image jobs within the actual batch
  limit and preserve each job/index; inspect outputs before compositing.
- Referenced style images must be supplied/authorized; do not invent a URL.
- If generating the subject in a flattened scene, prepare segmentation
  afterward. Do not promise native alpha without checking.

## Quality rubric

Score each item: `pass`, `needs work`, `not applicable`.

| Criterion | Specific evidence |
|---|---|
| Narration sync | Each intended reveal begins within acceptable frames of actual voice cue |
| Clear layers | Cutout edges don't reveal white boxes; every independent object can move |
| Coherent art direction | Reused palette, texture, shadows and typography across scenes |
| Composition | Focal object remains readable during pan, zoom and transition |
| Motion | One meaningful move per cue; no abrupt accidental jump or unnatural morph |
| Captions | Large enough, enough on-screen time, stable and within safe margins |
| Transition | Tear edge crosses cleanly and conceals entire prior frame by completion |
| Audio | Voice intelligible over music; no abrupt cuts/clip truncation |
| Rights and transparency | Original or licensed assets; no source logo/watermark imitation |

## Troubleshooting

- **Too static:** separate elements into more cutouts, not more video
  generation prompts.
- **Too busy:** fewer simultaneous moves; hold captions for a full phrase.
- **Sprite has white background:** create an alpha mask or regenerate a
  clean cutout on a removable background.
- **Audio appears late:** verify start silence and scene/cue timestamps;
  fixed timeline time 0 must match narration time 0.
- **Narration longer than export:** lengthen scene timeline or trim script
  intentionally; never silently crop the spoken sentence.
- **Papery look not convincing:** improve *original still assets* and
  textures; temporal code alone does not invent print engraving detail.
- **AI visuals drift:** use the same static cutouts reused in the same shot
  and draw them every frame instead of regenerating frame images.

## Reference execution status

Python/Pillow/FFmpeg above describe the pinned standalone recipe. The pack’s
renderer tests cover five unit methods, not a proved end-to-end encode/audio
export here; none of the archive’s 20 test methods were executed in this lot.
No Remotion project or implementation is bundled by this blueprint. Keep
project/assets in the admitted operation’s fresh folder and its evidence in
the current Pulse run; never silently install dependencies or overwrite an
existing export because the source example names one.
