---
name: photographic-art-direction
description: >
  Direct a coherent photographic scene or photo series from a visual intent:
  subject blocking, eye-path and compositional grammar (golden-spiral, radial,
  symmetry, frame-within-frame), physical camera viewpoint, practical lighting,
  focus/exposure intention, palette, location and continuity. Use for photo-art
  direction, commercial/editorial treatments, AI still-image generation briefs,
  set design, photographer shot lists and critique. This skill creates decisions
  and production briefs rather than just overlays or generic cinematic prompts.
---

# Photographic Art Direction

> Retained method from `photographic-art-direction/SKILL.md` within `pulse:design`. The current Pulse run owns its decisions and evidence. [Local adaptations](visual-direction-adaptation.md) distinguish direction from external standalone recipes.

> Reel observations below are attributed to the supplied pack’s analysis (2026-10-19); this integration has not independently viewed those Reels.


## Role and distinctive purpose

Act as a **photographic art director / director of photography**. Turn the intended
feeling of a photograph into a shootable visual system: *what the audience should
notice*, *where the camera and subject belong*, *where light comes from* and
*what must remain consistent*. Choose visual geometry in service of narrative,
not as a checklist of rules.

This is **not** a generic prompt-polishing skill, a camera-settings oracle,
photographic-scoring AI, a retouching tool or an automatic composition detector.
The user can apply its decisions to a real camera crew or an image generator.

### Source Reel and what is actually shown

Source: https://www.instagram.com/reel/DeviTkoTJxn/

The approximately 15-second video shows four composition demonstrations:

1. **Golden ratio / spiral**: over-the-shoulder view of fireworks, with a red
   spiral guide superimposed.
2. **Radial**: a person beneath a neon starburst-like fixture, organized around
   the subject's head.
3. **Symmetry**: a night city street framed around a centered street lamp.
4. **Frame within a frame**: a silhouetted person seen through a dark passage
   toward a bright exterior.

The Reel illustrates the *resulting photographic compositions*, **not** the
original lighting setup, lens focal lengths, equipment, camera settings or
production process. Specific methods and plans in this skill are **original
operational extensions**, not information directly demonstrated by the Reel.

## Use this when

- The user needs **direction photographique**, a look bible, art direction,
  location treatment, editorial/photo-ad brief, or a coherent photo series.
- They ask what lens/viewpoint/light/subject placement would tell their story.
- They want an AI still-image prompt grounded in plausible photographic choices.
- They bring reference images and need to extract principles, not blindly copy.
- They ask why an image lacks a clear focal subject or credible light.

**Do not activate** merely to calculate an exposure value or describe camera
gear without any art-direction decision. If the user asks only for a grid,
[geometric-composition-director](geometric-composition-director.md) is more appropriate.

## Input contract: six questions (infer where low risk)

Capture these, ideally from the user's brief or images:

| Dimension | What to identify | Output consequence |
|---|---|---|
| Narrative purpose | What does the image need to communicate? | Primary subject and emotional beat |
| Subject / action | Person, object, action and gaze | Blocking, eye-line, focus priority |
| Space | Indoor/outdoor, architecture, time, weather, set dressing | Available depth, geometry and practical light |
| Medium | Physical shoot, AI still, image edit, photo series | Technical recommendations vs prompt constraints |
| Delivery | 4:5 editorial, 9:16 campaign, 16:9 web hero, print | Camera orientation, negative space, crop safety |
| Non-negotiables | Identity, branding, budget, references, location, accessibility | Continuity and production feasibility |

Ask one targeted question only when a missing detail would make the deliverable
unusable (e.g. no subject or medium). Otherwise state a reasonable assumption.
Do not claim to have seen unavailable references or infer exact lenses used.

## Six-stage direction workflow

### 1. Translate intention into observable choices

Write a one-sentence **director's thesis**, e.g. “The station feels immense;
a solitary commuter is visibly exposed.” Tie every technical decision back to
this sentence. Select one lead subject and one secondary context cue; define
an explicit eye-path **entry → focal point → exit/secondary detail**.

### 2. Choose one compositional grammar, then decide camera and subject blocking

Choose the structure that serves the story. The following are **options**,
not objective formulas for beauty:

- **Golden spiral / golden-section flow**: controlled attention through a
  curved/descending eye-path; place the meaningful focal detail near the
  intended spiral center. The spiral is a graphic planning aid, not proof of
  mathematical optimality; be wary of forced spirals.
- **Radial**: repeated lines/lights/architecture radiate around a subject;
  good for revelation, spectacle, ritual or hypnotic attention. Keep subject
  legible against the radiating pattern.
- **Symmetry / central axis**: balance around a central vanishing axis to
  communicate calm, ritual, power or unease; small deviations can add tension.
- **Frame within a frame**: doors, windows, arches, tunnels and shadows
  contain the subject; control how foreground darkness guides the eye into
  the scene and don't obscure the needed subject details.

If no grammar is useful, omit it and direct an observational composition.
Specify camera height, orientation, proximity, lens **look** (not an imaginary
magic lens setting), subject position, depth layers and negative space.
For geometry-only overlays, use [geometric-composition-director](geometric-composition-director.md).

### 3. Direct **motivated light**, not “dramatic lighting”

Identify actual or narratively believable light sources and their locations.
Record **key**, **fill** (or deliberate absence), separation/rim and visible
**practicals**. Describe:

- Direction and relative distance from subject (top/side/back/frontal).
- Quality (hard vs diffuse), falloff, specular highlights and shadows.
- Relative key/fill contrast as a *visual target*, not a promised measurable
  ratio when the setup is hypothetical.
- Color temperature relationship (e.g. cool dusk outside / warm lamp inside)
  and skin/material response; avoid arbitrary colored rim lights.
- Exposure trade-offs: silhouette vs face readability vs highlight retention.

A physical shoot requires scouting, meter/test photos and real gear limits.
An image generator can be asked to imitate the look, but lens, aperture, lux,
Kelvin and shutter terms do **not** guarantee physically controlled output.
See [references/camera-lighting.md](photographic-camera-lighting.md).

### 4. Direct the rest of the photographic world

Specify wardrobe, palette, materials, set dressing, scale cues, weather,
foreground occluders, background bokeh/detail, subject gesture, gaze direction,
and the state of the space. Choose a restrained set of **visual invariants**
for a series: consistent time-of-day logic, color family, subject identity,
horizon behavior and contrast structure.

Do not use “flawless, hyperrealistic, 8K, epic, perfect” as substitutes for
physical or artistic instructions. Allow believable texture and imperfections
only where story-relevant; avoid unrequested damage or model glitches.

### 5. Produce executable shot cards

For each shot (usually 1–5, depending on the ask), record:

- **Intent / emotional beat** and hero detail.
- **Composition:** one dominant visual grammar plus placement and eye-path.
- **Blocking:** relative camera, subject, foreground and depth.
- **Camera:** position, shot size, format/crop, lens look or *optional* focal
  length range with sensor context, focus plane and perspective intent.
- **Lighting:** motivated key/fill/rim/practicals, direction/quality/contrast.
- **World:** palette, props, wardrobe, atmosphere and color treatment.
- **Preserve / avoid:** continuity, identity, legibility and visible failure modes.
- **Test frame:** specific “if this is wrong, revise X” acceptance checks.

**For physical photography:** distinguish preproduction choices from
on-location measured settings. Provide alternatives for budget/time/location
constraints and a scout/lighting test plan where useful.

**For generative imagery:** convert the shot card to a concise model-ready
prompt emphasizing visual causality. Put negative constraints in a dedicated
field only when the chosen model supports it. Do not claim that a prompt
controls image pixels, true optics, or exposure metadata deterministically.

### 6. Critique and iterate

Assess the actual photograph/result against the *intended emotional beat*:
1. Where does the eye go in the first two seconds?
2. Is the person/object read clearly at expected viewing size?
3. Does the light plausibly explain the highlights and shadow direction?
4. Are background lines, depth and subject/blocking coherent?
5. Is the color/texture consistent across shots or source material?
6. Would a crop/move of camera/light improve the intention more than more adjectives?

Revise **one controlling variable at a time**. Avoid “add everything” prompts.
If source images have not been provided, call critique **anticipated risks**,
not observations from a nonexistent output.

## Deliverable rules

- **Brief request:** give one director's thesis, 1–3 shot cards, a lighting plan,
  one copyable prompt if appropriate, and 3 test-frame checks.
- **Shot list/photo series:** add a look bible and continuity matrix.
- **Critique:** name observed issues with supporting features and specific
  changes to camera, blocking or light. Separate fact from aesthetic judgment.
- **Technical set planning:** include a simple camera/subject/light layout,
  scouting assumptions and alternatives. Optional script below produces a
  schematic top-down SVG, **not** a real lighting simulation.
- **Only a final prompt:** output the prompt directly plus material exclusions.

Use [references/photographic-treatments.md](photographic-treatments.md) for examples inspired by the Reel,
[references/camera-lighting.md](photographic-camera-lighting.md) for physically responsible technique,
[references/shot-card-template.md](photographic-shot-card.md) for copyable output templates, and
`examples/night-studies.json` for a compact machine-readable brief.

**External handoff recipe:** the following command belongs to the pinned `photographic-art-direction/` source. No `shotboard.py` adapter is bundled in Pulse. Positions are conceptual 0–100, not measured coordinates; existing output collisions are refused unless `--force` is explicitly selected after inspection.

## Helper for production handoff

`python scripts/shotboard.py examples/night-studies.json --out /tmp/night-shots`

Generates `shot-sheet.md` plus one **schematic** overhead lighting/blocking SVG
per shot, using JSON positions in a 0–100 conceptual space. This makes the
art director's intent reviewable and can help an agent iterate on positioning.
The tool validates input and does **not** analyze photos, calculate physical
lighting or infer real coordinates. Run with `--check` to validate only.

## Relationship to existing visual skills

- [cinematic-composition](cinematic-composition.md): quick 4-pattern cinematic framing.
- [geometric-composition-director](geometric-composition-director.md): geometric overlays / placement references.
- [cinematic-prompt-direction](cinematic-prompt-direction.md): concise generative-image/video language.
- **This skill:** narrative → photographic treatment → camera/light/subject
  decisions → repeatable photography production, image-series continuity,
  artistic critique and shot handoff.
- [rhythmic-architectural-motion](rhythmic-architectural-motion.md) and [code-animated-explainer](code-animated-explainer.md): temporal
  animation/montage, downstream when required.

Do **not** combine all skills by default; use the smallest set needed.

## Quality gate before delivery

- [ ] The emotional message and first-read subject are unmistakable.
- [ ] Chosen composition helps the subject, not a gratuitous grid.
- [ ] Camera/viewpoint and projected depth are visually coherent.
- [ ] Light sources and shadows have a believable causal explanation.
- [ ] Story-appropriate texture and wardrobe/set are specified.
- [ ] Invariants across a series or edit are clear.
- [ ] Physical camera facts are not conflated with AI-model prompt wishes.
- [ ] The claimed source observations are restricted to what the Reel shows.
