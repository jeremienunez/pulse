---
name: rhythmic-architectural-motion
description: >
  Design beat-synchronized architectural motion sequences using repeatable
  structures, perspective-consistent duplication, modular geometry, nested
  corridors, progressive facade reveals, streetlight arrays, and balcony
  cascades. Use for architectural music-video treatments, AI-video prompts,
  motion-design storyboards, image-to-video planning, procedural animation,
  and timing/beat maps. Do not use for unrelated architecture research.
---

# Rhythmic Architectural Motion

> Retained method from `rhythmic-architectural-motion/SKILL.md` within `pulse:design`. The current Pulse run owns its decisions and evidence. [Local adaptations](visual-direction-adaptation.md) distinguish direction from external standalone recipes.

> Reel observations below are attributed to the supplied pack’s analysis (2026-10-19); this integration has not independently viewed those Reels.


## Mission

Transform a music-driven visual concept into a **buildable motion-design plan**.
Use architecture as a rhythmic system: repeat units, reveal them on discrete
musical pulses, align transformations with scene perspective, and maintain
continuity within each shot. Balance hypnotic graphic rhythm with a stable
environment and readable geometry.

### Source and scope

Derived from the visual motifs of this approximately 20-second Instagram Reel:
https://www.instagram.com/reel/Ddt-jwsIZKW/

The video demonstrates five motifs: brutalist building blocks stacking upward,
an inward concentric architecture tunnel, windows appearing across a facade,
repeating cyan streetlamps receding in perspective, and downward-cascading rows
of balconies. Its dark, desaturated teal/green treatment and changes aligned
with the musical pulse unify the sequence. There is no speech.

**Do not claim** to know the original creator's software, generation prompts,
frame-accurate beat timing, BPM, masks, 3D setup, or editing method. The
procedural workflows, timing utility, and prompts below are this skill's
practical extensions. A viewed example does not prove how it was produced.

## Activate when

- A user requests beat-synced visual repetition, rhythm-based architecture
  animation, infinite buildings, geometric urban music video, or a looping
  brutalist/urban montage.
- The task involves directing or generating animation with buildings, windows,
  lamps, balconies, or repeated environmental modules that respond to music.
- A shot needs a storyboard, shot-by-shot prompts, masks/layering guidance,
  or a beat-map/cue sheet before animation.
- A user asks to reproduce the *effect family* of the source Reel using an
  original setting or asset set.

Use other installed skills when helpful:
- [cinematic-composition](cinematic-composition.md): establish framing, diagonals, axial balance and
  frame-within-frame geometry **before** animating repetition.
- [cinematic-prompt-direction](cinematic-prompt-direction.md): write camera/lens/light/texture instructions
  **after** deciding the motion structure and temporal beat events.
Both are optional; do not invent a dependency.

## Gather / assume

| Parameter | Examples | Why it matters |
|---|---|---|
| Footage or generator | Source clip, still image, Blender, After Effects, AI video | Determines whether precise transformations are possible |
| Audio | User-supplied track or original licensed cue | Required for accurate sync to an actual recording |
| Beat input | Timestamped beats, BPM + downbeat, or none | Determines cue times |
| Duration / frame rate | 20 s at 30 fps | Determines event/cut frame indices |
| Frame and delivery | 9:16 1080x1920 or 16:9 | Layout, repeat scale, safe areas |
| Architecture | Concrete housing blocks, modern towers, corridor | Defines repeatable modules |
| Camera space | Locked, low-angle, oblique elevation, overhead | Defines vanishing points and perspective |
| Pattern | Stack, nested tunnel, window reveal, streetlamp array, cascade | Chooses animation recipe |
| Mood | Restrained cyan, steel grey, storm light | Ensures cohesion |
| Constraints | Preserve street plan, windows count, subject, text margins | Protects continuity |

If no audio/beat data is available, provide a **proposed BPM-based timing
grid** labeled provisional. Do not say it matches the referenced song.
If exact beat alignment is requested and no timing data was supplied, ask for
the audio file, BPM/downbeat, or onset timestamps. Avoid claiming audio analysis
from a description alone.

## Core principle: geometry follows rhythm

Represent the scene as:

- **Anchor:** stable architecture, ground plane/horizon, camera, lighting.
- **Module:** one repeatable unit (building, window, lamp, balcony cell).
- **Replication transform:** translation, scale, rotation or depth mapping
  constrained by the shot's projection.
- **Event:** a beat-anchored discrete creation, removal, reveal or offset.
- **Ease:** snap on beat, then settle quickly; or start on beat and travel across
  a defined subdivision.
- **Exit:** hold, match-cut, or directional transition into the next pattern.

Use one dominant transformation per shot. Distinguish **object multiplication**
from a camera zoom; a zoom changes all apparent scene sizes while duplication
adds modules and preserves existing anchors.

### Five recipes

| Motif | Camera / structure | Beat action | Safeguards |
|---|---|---|---|
| 01. Vertical block stack | Vertical wide frame, locked camera, repeating concrete building module | Add a module above the current silhouette or extend the stack upward on every chosen pulse | Keep block orientation, façade scale and sky/horizon coherent; avoid morphing |
| 02. Recursive sky tunnel | Low-angle centered view of four building sides enclosing sky | Insert successively smaller rings/inset facades toward a shared central opening | Preserve converging edges and center; no irregular gaps in recursion |
| 03. Window grid reveal | Oblique facade view, fixed grid and surface normal | Reveal cells in deliberate row/column/order, usually one or a batch per pulse | Keep cell spacing, surface perspective, frame geometry and light direction |
| 04. Perspective lamp array | Street-level oblique composition with vanishing point | Add another cyan-lit streetlight along a single line, receding into depth | Decrease projected size and spacing consistently, avoid floating bases/duplicate shadows |
| 05. Balcony cascade | Near-orthogonal building-facade view, repeated vertical balcony modules | Offset or reveal rows downward by one module step per pulse | Preserve curvature, cast shadows and vertical grid alignment; no melted rails |

More specific shot language is in [references/shot-recipes.md](rhythmic-shot-recipes.md).

## Production workflow

### A. Creative treatment
1. Identify the musical feel (mechanical, hypnotic, oppressive, playful)
   without relying on adjectives alone.
2. Pick a visual rhythm: multiplication, reveal, recursion, or translation.
3. Select one coherent architectural vocabulary and a restrained palette.
4. Fix the camera for each pattern unless movement is crucial: repeat effects
   are easier to read against a stable spatial reference.
5. Define a visual escalation: e.g. stack → tunnel → grid → depth → cascade.

### B. Temporal design
1. Use measured beat/onset timestamps from the supplied track if available.
2. Otherwise choose a **planning tempo** and downbeat, explicitly provisional.
3. Choose cue frequency: one event every beat, every two beats, or at an
   eighth-note subdivision only if readability and frame rate allow.
4. Define shot cuts and on-beat events independently.
5. Export a beat/cut cue sheet in both seconds and frame indices, then
   confirm alignment in the target editor against the actual audio waveform.
6. Introduce short holds after rapid cascades to avoid exhausting viewers.

The external source’s `rhythmic-architectural-motion/scripts/beatmap.py` converts manual BPM or a JSON list of **known
beat times** into approximate frame-quantized cue markers. This is **not an audio
analysis or onset detection** script. Read [references/timing-and-workflows.md](../../visual-assets/references/beatmap-workflow.md).

**Timing consistency:** derive each shot duration from end minus start and its nominal beat count from duration × BPM / 60. For an edit whose cuts are quantized by round(time × fps), the difference between the end/start cut indices counts frames on that edit grid; actually place the cuts on those same indices. A renderer sampling i/fps against raw second boundaries can count differently: [0, 0.06) at 24 fps contains two samples, while the rounded cut indices differ by one. State the convention, then make labels, intervals and totals agree. For example, 2 seconds at a proposed 120 BPM contain 4 beats and 48 frames at 24 fps. These remain nominal calculations, never measured alignment to an absent audio track.

### C. Build repeatable geometry
Choose a method based on available tools:

**Deterministic 2D/compositing:**
- Stabilize/track a source shot if camera moves.
- Isolate the repeatable component on a layer or matte.
- Copy/instance it; apply transforms fitted to vanishing lines or the plane
  of the facade (perspective warp if needed).
- Animate visibility, position or scale keyed to cue frames.
- Add contact shadows, occlusion, grain and a consistent atmospheric grade.
- Prevent visible seams when cloning repeated concrete textures.

**Deterministic 3D/procedural:**
- Build one source module and instance it in a grid/array or as nested rings.
- Fix camera and focal parameters; project instances into shot space.
- Animate instance count or individual visibility on cue frames.
- Ensure geometry order, sky visibility, shadows and occlusion remain coherent.
- Render with stable motion blur as appropriate; composite against scene.

**AI image/video generation:**
- Create a base environment image with legible geometry and locked palette.
- Generate **one clear transformation per clip**, specifying initial state,
  what appears/moves, where, and what must remain unchanged.
- When frame accuracy matters, assemble short clips/stills in an editor and
  schedule cuts/object reveals using a deterministic timeline.
- Do not promise the generator will make each clone appear on the exact beat
  or preserve identical structures; use masks, layers, or re-render when it
  drifts. Pure text prompting is best-effort, not frame-accurate automation.

### D. Camera and visual continuity
- Specify a **vanishing point**, horizon and facade plane before cloning.
- Use atmospheric depth and perspective scale for elements farther away.
- Anchor lamps to the same curb and plane; align window grids to facade axes.
- Constrain exposure, reflections, cyan emission and concrete weathering
  across cuts.
- Preserve scene identity and original assets if editing user-provided media.
- Respect overlays/safe areas in vertical video; do not recreate source
  watermarks, including the watermark visible in the reference Reel.

### E. QA: what to inspect in the rendered output
- Does each event land on its intended frame ± allowed edit tolerance?
- Does each copy obey the shot's projection, occlusion and lighting?
- Are element counts and positions stable between events (no flicker/morph)?
- Does the viewer register one structural change per pulse?
- Is the cold cyan/teal grade coherent and details still legible?
- Are cuts deliberate and synchronized to the **actual** soundtrack?
- Does the work use original or appropriately licensed media and music?

## Required output

For an open-ended design request, deliver:

1. **Concept:** subject/location, emotion, aspect and duration.
2. **Five-shot or tailored shot list:** shot length, composition, repeat module,
   beat event, camera, palette and transition.
3. **Event plan:** beat/time/frame cues and explicit tempo provenance.
4. **Copyable AI prompts or implementation plan:** select based on the user's
   actual tools; don't imply both can execute without extra software.
5. **Negative / preserve constraints:** no structural morphing, flicker, wrong
   perspective, random color changes, illegal asset sourcing.
6. **Validation:** shot-specific checks, one revision recommendation if needed.

If only asked for a prompt, be concise: provide the shot description, ordered
beat actions, invariants and critical negatives, and note whether sync is
provisional or verified.

## Example short prompt

> Vertical 9:16, one locked-off low-angle shot of weathered concrete residential
> towers encircling a dark stormy sky opening. Five seconds. A nested geometric
> ring of identical facades appears at each marked beat and recedes toward the
> fixed center of the sky, producing a deep architectural tunnel; original
> outside buildings remain motionless. Cold desaturated teal-grey concrete,
> restrained cyan edge light, deep atmospheric perspective. Keep the central
> aperture, parallel facade axes, windows and sky shape consistent. No melted
> masonry, no random camera zoom, no text or watermark, no frame-to-frame
> geometry drift. Sequence precise event/cut frames later in an editor.

## Included resources

- [references/shot-recipes.md](rhythmic-shot-recipes.md): practical shot design and five example prompts.
- [references/timing-and-workflows.md](../../visual-assets/references/beatmap-workflow.md): manual BPM/beat markers, AI vs compositing
  vs 3D implementation details, QA and troubleshooting.
- `references/sample-shot-plan.json`: optional sample five-shot layout, NOT a
  transcription of measured source music.
- `scripts/beatmap.py`: dependency-free, manual beat-grid → cue sheet JSON/CSV.

## Honest scope

The reference Reel shows pattern duplication in time with its audio but does
not disclose the construction method. The choices in this skill are plausible
ways to build related **original** visual effects; they are not “the exact
prompts used” nor a reconstruction of the source master.
