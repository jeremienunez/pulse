# Timing, cue generation and production workflows

> Retained method from `rhythmic-architectural-motion/references/timing-and-workflows.md` within `pulse:visual-assets`. The current Pulse run owns its decisions and evidence. [Local adaptations](../../design/references/visual-direction-adaptation.md) distinguish direction from external standalone recipes.


## Do not infer the reference track's exact BPM

The Reel analysis provides scene durations and general pulse alignment, **not**
measured onsets. Its five scenes are approximately 0–3, 3–7, 7–11,
11–15, 15–20 seconds. Those boundaries are descriptive, not frame-accurate
edit points. A beat grid you generate below is a **new timing proposal**.

## Manual tempo cue sheet

Standalone source recipe from the externally supplied
`rhythmic-architectural-motion/` directory, after inspection and separate
admission. No Pulse beatmap command is bundled:

```bash
python scripts/beatmap.py \
  --bpm 120 \
  --duration 20 \
  --fps 30 \
  --subdivision 1 \
  --start 0 \
  --shots references/sample-shot-plan.json \
  --output cues.json \
  --csv cues.csv
```

- `--bpm`: planning BPM (not detected from audio).
- `--start`: downbeat timestamp in seconds, default 0.
- `--subdivision`: pulses per beat (1 = beats; 2 = eighth-note pulses when
  BPM is quarter-note BPM; 4 = sixteenth-note pulses).
- `--shots`: assign named effects to time intervals and emit shot cut markers.
- `--fps`: time-to-frame rounding; **does not** modify the source recording.
- `--output` and optional `--csv`: cue files for editing.

To use an externally measured beat list, create `beats.json`:

```json
{
  "beats_sec": [0.10, 0.62, 1.14, 1.66, 2.18],
  "source": "Beat times marked manually from user-provided audio"
}
```

Then run:

```bash
python scripts/beatmap.py \
  --beats-file beats.json \
  --duration 3 \
  --fps 30 \
  --subdivision 2 \
  --output cues.json
```

Subdivided timestamps are **interpolations**, not detected additional
onsets. Always inspect resulting cues against the actual waveform.

### How to map beats to transformations

- **Bar-level cut:** first beat of a chosen bar.
- **Every beat:** one unit appears or advances.
- **Half-beat subdivision:** useful for window strobing or lamp chains,
  but only when readability allows.
- **Ease window:** 0–3 frames of short motion after event time; hold.
- **No event:** occasionally let existing geometry breathe.

The script reports a shot's event name; refine actual animation poses,
copy count and easing in the target editor.

## Software-specific realization

### Editing / compositing

1. Make a master composition at fixed frame rate and aspect ratio.
2. Import the beat cue sheet; place markers at `frame` indices.
3. Key visibility/position/scale using layer instances on those frames.
4. Track planes / masks as needed; maintain occlusion and realistic contact.
5. Add a coherent grade across shots. Render and inspect in motion.
6. Ensure final audio is licensed/original.

### Blender / 3D

1. Create one clean modular asset (lamp/window/balcony/building).
2. Use arrays, Geometry Nodes, or scripted object instancing.
3. Put instances at valid world positions and use a stable camera projection.
4. Animate instance count or visibility on each cue frame.
5. Verify lighting, depth and shadows for all inserted modules.
6. Render a preview pass first; use full sampling only after QA.

### Generative video

1. Generate one controlled **base plate** per shot.
2. Direct one transformation per clip; ideally provide a start frame
   and constraints on fixed geometry.
3. Prefer short segments if the model struggles with strict repetition.
4. Extract the best usable frames/clips and align cuts/events in an editor.
5. Expect drift in identity, window spacing, lighting and architecture.
   Use deterministic layering to get **precise** on-beat multiplication.

## QA & troubleshooting

| Symptom | Likely issue | Fix |
|---|---|---|
| Repeats feel like random morphing | No stable base geometry | Lock the plate and instance preapproved modules |
| Windows jump between cells | Grid/projective plane not fixed | Define facade axes and grid indices; use planar tracking |
| Lamps grow as they recede | Incorrect depth mapping | Rebuild size/spacing from a consistent vanishing point |
| Beat appears late | Marker mismatch or easing lag | Move keyframe/snap event to cue frame; account for anticipation |
| Rapid beats look like flashing noise | Too many events per second | Group a pair of beats or reveal several cells together |
| Mix changes dramatically between cuts | Shot-wise color drift | Use shared palette/grading reference and exposure anchors |
| Cross-cut doesn't feel rhythmic | Cuts on arbitrary frames | Snap cuts to measured beat/downbeat times |
| Text/CTA unreadable | Background too busy | Place safe area over stable negative space |

Never claim the provided script detected audio or solved 3D geometry: it
produces **timing metadata** only.

## Cue contract and output limits

The external utility accepts positive real fps and at most 50,000 markers.
Keep ideal times, quantized times, frame indices, shot cuts and quantization
collisions distinct in the handoff. A subdivision interpolates between known
beats; it does not add measured onsets. Inspect collisions instead of claiming
extra temporal resolution. The JSON/CSV paths can overwrite; a future admitted
run needs fresh output destinations and its own receipt.
