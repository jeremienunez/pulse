---
name: cinematic-prompt-direction
description: >
  Turn vague AI image/video requests into deliberately art-directed shots: specify
  subject/action, framing, camera viewpoint, light sources, environment, grounded
  physical texture, intentional imperfections, and useful negative constraints.
  Use for text-to-image, text-to-video, image/video edits, cinematic prompt
  rewrites, shot prompts, or visual critique. Do not activate for unrelated writing.
---

# Cinematic Prompt Direction

> Retained method from `cinematic-prompt-direction/SKILL.md` within `pulse:design`. The current Pulse run owns its decisions and evidence. [Local adaptations](visual-direction-adaptation.md) distinguish direction from external standalone recipes.

> Reel observations below are attributed to the supplied pack’s analysis (2026-10-19); this integration has not independently viewed those Reels.


## Purpose

Write prompts like a **director's shot brief**, not a shopping list of aesthetic adjectives.
The output should specify a coherent, filmable visual moment with clear subject priority,
camera placement, motivated light, believable texture, and scene-specific exclusions.

**Source basis:** The Instagram Reel https://www.instagram.com/reel/DaITrQ5tGFm/
(approximately 33 seconds; analyzed 2026-10-19) argues for three improvements:
(1) direct the shot by specifying camera angle, lighting, and environment;
(2) favor believable imperfections, e.g. motion blur and handheld feel;
(3) say what to avoid, e.g. oversaturation or artificially perfect symmetry.
The procedures, templates, and checks below are an **original operational extension**
of those principles, not a transcript or a claim about the creator's workflow.

## When to use

- A user asks to make an image/video prompt more cinematic or visually distinctive.
- A request says only “4K, photorealistic, cinematic, beautiful, perfect” and needs specificity.
- A user wants a particular mood, film look, camera movement, or intentionally imperfect realism.
- A user supplies an image/video to reinterpret, extend, or edit while retaining important details.
- A user wants to critique why generated visuals feel generic, sterile, overprocessed, or synthetic.

When a broader composition strategy is needed, use [cinematic-composition](cinematic-composition.md) **if available**
to choose diagonal, axial balance, frame-within-frame, or rule of thirds. This skill
then expresses that composition as actionable camera and lighting instructions.
Neither skill is dependent on the other.

## Intake: establish the shot

Determine, or infer conservatively, these variables:

| Variable | Question | Example |
|---|---|---|
| Story beat | What is happening in this instant? | A passenger notices a familiar face outside a bus |
| Main subject | What must be most readable? | Passenger's eyes and phone reflection |
| Medium | Still, video, or edit? | One 6-second video shot |
| Frame | Aspect ratio and crop/safe areas? | 9:16, leave lower quarter clear for captions |
| Setting | Where, when, atmosphere? | City bus at dusk in light rain |
| Camera | How close, how high, which angle? | Seated eye level, medium close-up, profile three-quarter |
| Light | Which real or motivated sources? | Cold streetlight through glass plus dim cabin practicals |
| Texture | Which imperfections support realism? | Mild camera shake, rain streaks, moving background blur |
| Preserve | What may **not** change? | Face, garment color, window layout in source |
| Avoid | Which model failure modes matter? | Plastic skin, over-sharpening, duplicate limbs |

Ask at most one targeted question if a truly essential attribute is missing;
otherwise make and label a sensible assumption. Never pretend to have viewed
an attachment or reference that is inaccessible.

## Working method

### 1. Replace empty style labels with observable decisions

Do not rely on “cinematic, 8K, hyperrealistic, masterpiece, flawless, trending”.
Translate each wish into visible evidence:

- “Cinematic” → intentional focal hierarchy, camera perspective, motivated lighting,
  deliberate depth and framing.
- “Realistic” → physically plausible shadows, material response, incidental detail,
  measured texture, and consistent lighting.
- “Moody” → specific contrast relationship, color temperature, weather, and exposure.
- “Dynamic” → explicit subject motion, camera motion, parallax, or timing.

Resolution terms can be included when the generator supports an output setting,
but **do not** mistake “4K” in prompt text for control over rendered resolution.

### 2. Direct the frame

Specify, in order of importance:

1. **Subject and action** — a precise moment, gesture, gaze, or interaction.
2. **Viewpoint** — camera height, distance, high/low/eye-level angle, framing
   (extreme close-up, close-up, medium, wide) and approximate perspective.
3. **Spatial organization** — subject placement, sight lines, negative space,
   foreground occlusion, depth layers, architectural geometry. Use one dominant
   compositional intention, not conflicting rules.
4. **Light** — source, direction, quality (soft/hard), practicals, exposure/contrast,
   and motivated color. Avoid inconsistent multiple “key” lights.
5. **Setting and materials** — a few concrete details viewers can actually see.
6. **Intentional texture** — only imperfections that plausibly follow from the scene.

Lens numbers and camera terminology are optional descriptors, not guaranteed
physical parameters. If a model supports actual lens/camera controls, configure
them through those controls as well as the prompt.

### 3. Add imperfection with purpose, not random degradation

Choose **zero to three** scene-appropriate details from:

- Subtle handheld micro-movement or natural, nonmechanical framing drift.
- Motion blur on **moving** subjects/background, keeping the key subject readable.
- Modest, context-appropriate grain, slight lens flare, edge softness, practical glow.
- Uneven light falloff, imperfect wardrobe folds, weather traces, lived-in surfaces.
- Slight asymmetry or observational framing when an ultra-polished frame feels sterile.

Imperfection is optional. A product packshot, documentary record, typography-heavy
hero, clean animation, or precision architectural image may require steadiness and
clarity instead. Do not request unwanted anatomical errors, glitches, compression
damage, identity drift, or total subject blur.

### 4. Express negative constraints meaningfully

Rank negative items by the failures that would genuinely spoil the shot:

- **Visual:** no oversaturated neon, plastic skin, HDR halos, aggressive sharpening,
  perfect bilateral symmetry if unnatural for the scene.
- **Structural:** no duplicated props, melted hands, malformed faces, inconsistent
  perspective, floating objects.
- **Temporal (video):** no abrupt camera jumps, subject morphing, frame-to-frame
  outfit changes, background flicker, unnatural acceleration.
- **Editing:** preserve specified identity, count, placement, logos/text, clothing,
  original geometry unless explicitly changed.

If the model has a dedicated **negative prompt** field, supply a compact list there.
Otherwise express important exclusions plainly in the main prompt, preferably
alongside the positive replacement (“natural skin texture, not waxy retouching”).
**Negative prompting is probabilistic; it does not guarantee error removal.**

### 5. For video, add a clear temporal plan

Describe a single achievable shot before adding cuts:

- **Opening state (0–1 s):** subject pose, camera position, point of attention.
- **Development (1–N−1 s):** one main subject action, one main camera move, visible parallax.
- **Ending state (last second):** what changes and what stays consistent.
- **Continuity:** identity, garments, props, shadows, environment, motion direction.
- **Sound:** only if the selected video generator supports audio and the user wants it.

Keep camera and subject motion distinct. A gentle handheld texture is not
equivalent to a tracking shot. Avoid contradictory commands such as “locked-off,
handheld, fast dolly and still camera” unless staged sequentially with timings.

### 6. Emit a lean, production-ready prompt

Prioritize filmable specificity over adjective density. Describe one coherent
scene rather than asking for many disconnected artistic effects. Surface exact
frame/aspect/timing as model parameters **when supported**; do not assume that
prompt words alone change generator settings.

**Still-image pattern**

> [Subject] [specific action] in [place/time]. [Framing, eye level/angle,
> subject placement, layers]. [Motivated light sources and shadows].
> [Two to four observable material/atmosphere details]. [At most three
> intentional imperfections]. [Mood created by those choices].
> [Aspect ratio if supported]. Preserve [constraints].

**Video pattern**

> [Duration, aspect ratio, one shot]. Start: [opening frame].
> Camera: [movement path and speed]. Subject: [action and timing].
> Lighting/environment: [stable, motivated sources]. End: [ending frame].
> Texture: [optional controlled motion blur/handheld]. Continuity:
> [invariants]. Avoid [concrete failure modes].

## Required output

Default response to a **prompt-building** request:

1. **Creative direction** — one sentence explaining the intended visual emotion
   and the decisive creative choice.
2. **Shot specification** — subject/action, frame, angle/distance, layout,
   lighting, environment, and movement if applicable.
3. **Generation prompt** — directly copyable, written in the user's language
   or in the target model's preferred language if specified.
4. **Avoid / negative prompt** — only consequential exclusions; label whether
   to put it in a separate negative-prompt field or append to the main prompt.
5. **Quality checks** — 3–5 observable checks against the actual output.
6. **Variant** — include only if the user asks for alternatives or exploration.

If the user asks **only** for the final prompt, provide the prompt and (if useful)
a brief exclusion line; avoid unnecessary theory. If asked to **critique** a
generated result, compare it to desired outcome before rewriting the prompt.

## Final QA gate

Before delivering, verify:

- [ ] Subject, action, and single visual priority are unmistakable.
- [ ] Camera angle, frame, and composition are mutually compatible.
- [ ] Light sources have a motivated direction; materials behave plausibly.
- [ ] Imperfections make the scene feel observed, not broken.
- [ ] Exclusions are relevant, noncontradictory, and realistically enforceable.
- [ ] Video instructions have consistent time, space, and identity.
- [ ] If editing, preservation requirements are explicit.
- [ ] No invented source observation, tool capability, or guaranteed result.

## Examples and expanded reference

Read [references/prompt-examples.md](cinematic-prompt-examples.md) when the user needs concrete rewritten
prompts, video timing, or an illustration of what *not* to write.
