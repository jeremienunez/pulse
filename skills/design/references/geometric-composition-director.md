---
name: geometric-composition-director
description: >
  Develop and critique deliberate geometric framing for images, video shots,
  storyboards and visual UI hero imagery. Choose golden-section or approximate
  golden-spiral flow, rule of thirds, circular framing, centered axes, scale
  contrast or triangular composition. Deliver camera/focal placement specs,
  model-ready prompts, editable SVG planning overlays and quality checks.
  Use when a user requests geometric cinematic framing or visual hierarchy;
  do not apply to unrelated text-only tasks.
---

# Geometric Composition Director

> Retained method from `geometric-composition-director/SKILL.md` within `pulse:design`. The current Pulse run owns its decisions and evidence. [Local adaptations](visual-direction-adaptation.md) distinguish direction from external standalone recipes.

> Reel observations below are attributed to the supplied pack’s analysis (2026-10-19); this integration has not independently viewed those Reels.


## Intent

Translate a scene's narrative intent into **specific spatial relationships**:
where the viewer looks first, how secondary masses support the subject, and
which edges, shapes and perspective lines guide attention. Select one principal
composition device rather than covering every image with multiple overlays.

**Observed source:** https://www.instagram.com/reel/DdACuZkMZwL/
(22-second Instagram Reel, analysed 2026-10-19). The clip first shows a
transparent Golden Ratio Card held in front of a traffic cone, then examples
labelled *golden ratio*, *rule of thirds*, *circular*, *centered*, *scale*, and
*triangular*. The examples show a man lifting a hatch in a dark space with a
spiral guide, a dark-room scene with a thirds grid, a silhouetted figure in
a light beam with a circular guide, a woman framed in a central doorway,
a small figure by a large manor house to establish scale, and a woman near
an ornate mirror with triangular guides. The source does **not** supply an
exact shooting recipe or machine-readable geometry. The workflows, numerical
placement suggestions and guide generator in this skill are original
interpretations—not the video's author's code.

The Reel depicts some geometric guides over images: **an overlay is an aid,
not proof that a picture mathematically satisfies a composition rule**.

## Activation

Use when the task is to:

- Choose composition for a photo, film still, animated shot, storyboard,
  generated image, hero visual, or editorial layout.
- Place a subject using a golden-section focus, thirds, central axis,
  circular visual frame, relative scale, or a triangle of important features.
- Diagnose why an image lacks a focal point, scale, balance, or eye movement.
- Produce guides a human can overlay onto an actual image for revision.
- Coordinate multiple shots using distinct, intentional geometries.

For leading-line **diagonals** and tunnel / *frame within frame*, use
[cinematic-composition](cinematic-composition.md) when that profile is useful. Its thirds and symmetry rules
partly overlap this skill; do not generate two separate conflicting grids.
Use [cinematic-prompt-direction](cinematic-prompt-direction.md) to add controlled camera/light/texture
instructions after choosing a geometry. Those skills are optional.

## Inputs

Gather what is available; do not delay with needless questions:

1. **Scene**: subject, action, place, depth cues, important secondary objects.
2. **Narrative**: what first attracts attention; intended emotion and hierarchy.
3. **Medium**: still, video, generated image, editor overlay, web hero.
4. **Canvas**: dimensions/aspect, safe areas, title / subtitle zones.
5. **Available geometry**: walls, doorways, arches, horizon, figures, groups.
6. **Camera**: viewpoint, field of view, shot size, movement or fixed camera.
7. **Preservation**: identity, props, architecture, original photo boundaries.

If given an actual image, inspect it before critique, and say what can and
cannot be verified. If a user gives only an idea, infer an explicit frame
and label it as an assumption. Do not pretend that a synthetic overlay
measured the underlying picture.

## Choose the dominant composition

| Method | Narrative signal | Production instruction | Pitfall |
|---|---|---|---|
| **Golden section / spiral flow** | Discovery, organic eye path, revelation | Position principal point of interest near a golden section (e.g. x≈0.618, y≈0.382) **if useful**; construct a curved pathway of lines, light and secondary shapes toward it | Forcing unrelated scene geometry to follow a mathematical spiral; treating a drawn curve as empirical proof |
| **Rule of thirds** | Naturalistic asymmetry, editorial space | Place subject at x≈1/3 or 2/3; align horizon or major line near y≈1/3 or 2/3, while retaining look-room | Rigid placement ignoring gesture/gaze or overlap with type |
| **Circular framing** | Spotlight, isolation, contemplation, discovery | Organize natural circles/ellipses using a shaft of light, lens-like aperture, doorway, arch, bodies or circular objects around the subject | Adding a random drawn ring into final imagery or obscuring the person |
| **Centered framing** | Formality, suspense, ritual, confrontation | Build around an axial doorway, corridor or central object; preserve a deliberate left/right mass relationship | Accidental symmetry, no depth, uncomfortable headroom |
| **Scale contrast** | Awe, isolation, vulnerability, monumentality | Show a legible human/object reference against larger architecture; use a comparable depth plane or deliberate perspective | Misleading physical-scale claims from projected pixel size |
| **Triangular composition** | Stability, tension, relationships among three accents | Connect three meaningful landmarks to form a visual triangle; choose direction, heights and focal priority intentionally | Arbitrary triangle laid over unrelated details |

### Key distinctions

- A **golden-section point** is a reproducible numerical planning reference:
  φ=(1+√5)/2≈1.618. Useful normalized coordinates include 1/φ≈0.618 and
  1−1/φ≈0.382. The *golden spiral* is a distinct curved construction; do not
  claim a subject near (0.618,0.382) thereby proves golden-spiral composition.
- **Circular framing** can be a perceptual ring of light, architecture, or
  bodies; it does not require an actual mathematically circular aperture.
- **Centered** is not necessarily mirror symmetry. The focal axis can be
  centered while the masses, lighting and figures remain asymmetrical.
- **Scale** is a relationship among objects and viewpoint, **not** a generic
  overlay formula; known sizes, camera distance and perspective matter.
- **Triangular** requires three actual visual anchors or directions, not
  merely three convenient random coordinate points.

## Working procedure

1. **Name the story beat** in one sentence: what do we want the viewer to
   discover and why now?
2. **Choose one primary geometry** from the table based on the scene's real
   lines, groupings and story. Select at most one secondary support system.
3. **Map the frame** with normalized x/y∈[0,1]; state a focal point, camera
   height and distance, major silhouettes, top/bottom safe areas and negative
   space. Treat anchor coordinates as approximations, not hard constraints.
4. **Direct foreground / middle / background** and contrast: size, tonal
   separation, leading edges, depth, body gestures and secondary visual weight.
5. **Preserve camera continuity** for a moving shot: specify start composition,
   camera movement, and end composition with focus and spatial relations intact.
6. **Generate a prompt or shot brief** with physically observable framing
   directions. Avoid a pile of unrelated aesthetic adjectives.
7. **Check in a guide** using `scripts/composition_guides.py` if the user wants
   visual planning overlays or measurable rough placements. The guide is a
   manual alignment tool, not a machine vision scoring engine.
8. **Critique the resulting composition** in terms of subject readability,
   true scene geometry, edge clutter, depth, and emotional effect. Revise
   one spatial variable at a time before adding more effects.

## Deliverable contract

For standard direction requests, provide:

**Intent:** one sentence on emotional effect and story.

**Dominant geometry:** name, why it fits, optional supporting device.

**Frame:** aspect, approximate focal coordinates, camera height/angle,
foreground/midground/background, safe areas and negative space.

**Prompt/shot brief:** concise, filmable camera and subject directions, with
preservation constraints if editing. Prefer actionable relations (“figure
occupies 8% of frame height at the bottom of a palace stair”) to inflated
adjectives (“incredibly epic 8K masterpiece”).

**Validation:** 3–5 checks for readability, geometry, intentional balance,
consistent perspective, and text collisions where applicable.

If user only wants **a prompt**, give the prompt and crucial restrictions
rather than a long report. For **critique**, assess current image first,
then propose one change to framing. For **multi-shot**, show a shot-by-shot
sequence, time, geometry, motion and match/cut relationship.

## Example direction briefs

**Golden flow, opening hatch:**

> Vertical 9:16, medium shot from above the loft floor toward a wooden
> hatch opening into daylight. A young person lifts the hatch and looks up;
> place the face near the upper-right golden-section region (about x=.62,
> y=.38). Curving fabric folds, the hand/hinge arc and the light gradient
> move the eye naturally toward the face. Strong exposure separation from
> dark beams to the bright hatch, distinct silhouette, restrained negative
> space. Preserve consistent hinge geometry. No decorative spiral visible
> in final render.

**Circular framing, dark-room figure:**

> Eye-level fixed shot of a crouching figure in a dark concrete room;
> a soft circular cone of bluish light and a curved doorway edge enclose
> the subject in the middle third. Keep the rest of the room very dark but
> not featureless, allowing the light to define the visual aperture.
> The circle is created by architecture and lighting, not a graphic overlay.

**Scale, monumental building:**

> Locked symmetrical wide shot of an immense old manor with a central
> staircase; one plainly visible person stands in the near plane at the
> entrance, occupying about 5% of the image height, with stairs and façade
> dominating the rest. Keep architecture vertical, human legible and
> perspective plausible. A subtle overcast sky gives size without fake
> lens distortion.

**Triangle, portrait with mirror:**

> 16:9 medium shot of a woman in a coat beside an ornate mirror. Compose a
> visual triangle linking her eyes, the mirror's upper gold edge and her
> hand at the lower frame. Use slight asymmetry and negative space to her
> left; direct shadow gradients so the face remains first to be noticed.

**External guide recipe:** `scripts/composition_guides.py` below is in the pinned `geometric-composition-director/` source, outside Pulse. Its 32–16384 canvas bounds, normalized focus and supported JPG/PNG/WebP/GIF inputs belong to that recipe. Inspect and separately admit any future execution; an embedded photograph makes the SVG mixed raster/vector, and files may be overwritten. No Pulse adapter is bundled.

## Overlay tool

`python scripts/composition_guides.py --technique golden --width 1080 --height 1920 --output golden.svg`

Other techniques: `thirds`, `circle`, `center`, `scale`, `triangle`. Add
`--image photo.jpg` to embed a supported image in the SVG behind the guides,
`--focus 0.62,0.38` to move the overlay reference point, or
`--all --output-dir guides/` to create a series.

These SVGs are **editable presentation/planning overlays**. They do not
recognize subjects or grade composition. The golden overlay contains a
logarithmic **approximation** to a golden spiral (radius multiplies by φ
every quarter-turn), not a quarter-circle Fibonacci-square construction.
See [references/geometry-and-verification.md](geometric-verification.md) for the mathematical cautions.

## Final QA gate

- [ ] A clear narrative target determines the visual center of gravity.
- [ ] Chosen geometry fits actual objects/lines, not merely a diagram.
- [ ] Focal point, contrast, background depth and frame edges are readable.
- [ ] Scale claims are consistent with perspective and available measurements.
- [ ] An overlay is not confused with a validated mathematical property.
- [ ] Centering, thirds or circularity are used intentionally, not as rigid laws.
- [ ] A sequence maintains continuity or uses intentional compositional cuts.
- [ ] When editing, required identity, object, text and style are preserved.
