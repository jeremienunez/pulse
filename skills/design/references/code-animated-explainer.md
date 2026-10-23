---
name: code-animated-explainer
description: >
  Create narrated explainer videos by generating or preparing layered still
  illustrations and animating each layer deterministically with code. Use for
  paper-cut collage motion, documentary/history explainers, educational shorts,
  voiceover-synchronized 2D animation, parallax, torn-paper transitions,
  kinetic titles, and reproducible MP4 export without generative video models.
  Supports Higgsfield MCP for optional illustration generation, plus a local
  Python/Pillow/FFmpeg renderer. Do not use for unrelated videos or still images.
---

# Code-Animated Explainer Studio

> Retained method from `code-animated-explainer/SKILL.md` within `pulse:design`. The current Pulse run owns its decisions and evidence. [Local adaptations](visual-direction-adaptation.md) distinguish direction from external standalone recipes.

> Reel observations below are attributed to the supplied pack’s analysis (2026-10-19); this integration has not independently viewed those Reels.


## What this skill does

Turn a story into a **voiceover-aligned, layered-motion explainer** using
repeatable, frame-based animation code. Image generation can create **still
assets**; movement, timing, transitions, and compositing are defined and
rendered by code. Never conflate image generation with AI video generation.

**Source:** This skill is an original implementation inspired by
https://www.instagram.com/reel/DeqYLWrRyf1/ (approximately 63 seconds,
analysed 2026-10-19). The Reel *presents* this sequence: save visual style
references; upload them to Claude with an idea; generate scenes using
Higgsfield MCP; invoke a custom `/motion-studio` skill; animate image elements
piece by piece in code, synchronized to narration. The sample is vintage
paper collage with torn-paper wipes and surreal Egyptian illustrations.

The original `/motion-studio` implementation, its exact prompts, code, and
rendering framework are not disclosed in the Reel. **Do not claim** this
package is the creator's skill, uses the same software, or can exactly
reproduce their project. This is a practical, original alternative.

## Activate when

- A user asks for code-driven animated explainers, a Remotion-like workflow,
  a motion-studio skill, or explainer shorts made from layered illustrations.
- A user wants a paper collage / editorial cutout aesthetic, with animated
  foreground and background pieces, paper rips, typography and voiceover sync.
- A user wants to convert images, narration, and a storyboard into deterministic
  frame-by-frame motion, **without** using text-to-video or image-to-video.
- A user wants to plan or debug a scene/layer timeline, caption cues, or
  handoff to an agent that renders with Pillow, FFmpeg, Canvas, or Remotion.

For one static shot, use [cinematic-composition](cinematic-composition.md) and/or
[cinematic-prompt-direction](cinematic-prompt-direction.md) if available. For beat-driven architectural
repetition, use [rhythmic-architectural-motion](rhythmic-architectural-motion.md) if available. They are optional.

## Inputs and defaults

- **Narrative:** topic, audience, hook, factual source constraints, tone,
  script or voiceover audio. If a real-world claim is important, fact-check
  it before illustrating it. Label speculative narration as speculation.
- **Visual style:** user-owned/licensed reference images or written style
  traits; palette, paper stock, halftone/grain, cutout edges, fonts.
- **Deliverable:** aspect ratio, approximate length, frame rate, output MP4.
  Typical draft: 9:16, 24 fps, 720x1280 (final may use 1080x1920).
- **Tool access:** optional still generator or Higgsfield MCP, a renderer
  such as this package's Python/Pillow/FFmpeg workflow, and sound assets.
- **Narration timing:** timestamped phrases/words if already available;
  otherwise author rough cues and confirm against the actual voice track.
- **Preservation:** which subjects, text, identity, visual motifs and brand
  rules must remain consistent. Never fabricate access to reference artwork.

Ask one focused question only if an essential input is truly missing;
otherwise state assumptions. Do **not** generate paid media assets without
considering tool cost, required approval and user intent.

## Core creative workflow

### 1 — Script first: voice leads the edit

Draft a 15–60-second short as a series of compact spoken beats. Each beat
should contain **one visual idea** and a short phrase that justifies an
animation event (entrance, reveal, pointing gesture, paper rip, title).
Keep exact written script separate from proposed scene illustrations.

Create a cue sheet with `start`, `end`, `spoken_text`, `visual_reveal` and
`scene_id`. Narration and cue timestamps must start on the same timeline.
If a supplied audio track exists, listen/inspect the real timings or use a
suitable transcription/forced alignment tool, then correct cues by hand.
The built-in renderer does **not** detect speech, transcribe, or force-align.

### 2 — Extract a *visual system*, not a copyrighted image template

Analyze a reference for general compositional properties:
- background stock (beige paper, warm grey newsprint, hand-tinted photo);
- cutout silhouette grammar and edge roughness;
- limited color palette, print noise and shadow depth;
- parallax depth planes and motion cadence;
- titles (type hierarchy, placement, readability).

Create a scene-style bible and keep it consistent across shots.
Prefer original characters and scenes rather than copying distinctive
artist imagery, logos or source watermarks. Do not infer rights from
public availability of Pinterest images.

### 3 — Storyboard scenes, then decompose into layers

For each shot, produce:

1. **Narrative purpose** and one primary visual metaphor.
2. **Background plate** that stays stable (paper, sky, landscape, room).
3. **Midground object layers** (architecture, planets, furniture).
4. **Foreground cutouts** (hands, faces, props, foliage) with transparent PNGs.
5. **Motion directions** (slide, settle, pivot, orbit, scale, reveal, pan).
6. **Voice cue times**, narration text, caption safe areas and transition.

Each moving subject MUST exist on its own alpha layer or be segmented from
an image. A flattened still **cannot** independently animate its characters,
objects and background unless masks or new layers are prepared. Do not
claim that a still generator natively produces separate transparent layers.

See [references/asset-and-art-direction.md](explainer-asset-direction.md) for asset prompts and masks.

### 4 — Generate or prepare still images (optional Higgsfield MCP)

If a still generator is connected and the user wants image assets:
- Inspect model capabilities, output dimensions, reference-media support,
  alpha/transparency availability and credit cost **before** generation.
- Prepare a separate prompt for each plate, object or character cutout.
- Batch independent assets only when the connected tool supports it.
  The pack’s 2026-10-19 example cites up to 6 independent image requests
  per Higgsfield batch; verify the connected tool’s current batch limit,
  supported catalog, cost and job/result workflows before using that example.
- Use confirmed output/download assets, remove backgrounds or mask as
  needed, then save under a scene-specific assets directory.
- If no generation is needed, use user's licensed stills or code-drawn assets.

Never invoke an AI **video** model for the primary frame animation if the
user specifically requests the code-driven approach illustrated here.
Still-image generation does not contradict that requirement.

### 5 — Animate with a deterministic timeline

Animate illustration layers using explicit keyframes:
- **Position:** scene-normalized x/y + movement dx/dy.
- **Scale:** reveal with a restrained ease, often 0.85→1.0.
- **Rotation:** pivot a hand, note, planet or cutout in degrees.
- **Opacity:** reveal elements as the narrator names them.
- **Depth:** separate foreground/background motion for parallax.
- **Camera:** gentle push-in or hold, represented independently from
  object motion; titles stay pinned as readable overlays.
- **Transition:** move from one scene to the next with a timed torn-paper
  wipe; avoid arbitrary fast cuts that overpower comprehension.

The supplied `scripts/render.py` implements these effects using **Python,
Pillow, and FFmpeg**. It rasterizes a composed frame for every timeline frame
and encodes to H.264 MP4; AI video inference is not used. Review its
project contract in [references/project-format.md](../../visual-assets/references/explainer-project-format.md).

### 6 — Synchronize to the spoken story

- Prefer genuine phrase or word timings aligned to the actual narration.
- Give each important word one visual consequence: entering cutout,
  spotlight, scaling detail, revealing a caption, or changing to a new scene.
- Put the reveal on/just after its spoken cue, allowing visual latency and
  ease duration; do not claim syllable-level sync if cues are estimates.
- Short animated words may use fast ease (0.15–0.3 sec); large cutouts
  benefit from slower easing (0.35–0.9 sec).
- Make the final beat intelligible even with music muted. Add on-screen
  captions where helpful and allow enough display time to read them.

Audio is combined via FFmpeg after visual rendering. Volume mixing is
basic, not studio mastering. Do not substitute music beat sync for voice
alignment; narration determines narrative timing.

### 7 — Render, inspect and iterate

1. Verify project JSON schema, asset paths, alpha masks, timing and audio.
2. Render a short low-resolution preview (example runs without voiceover).
3. Review cuts, edges, visual hierarchy, timings, flicker, captions and text.
4. Fix **one major problem** per review pass (asset quality, projection,
   motion, audio cues, typography).
5. Render final resolution, check FFmpeg output and optional narration.
6. Deliver both the MP4 **and** editable project/assets when requested.

**Standalone reference quickstart** (from the externally supplied
`code-animated-explainer/` source, after separate runtime inspection and
admission; importing this method installs and runs none of these commands):

```bash
python -m pip install Pillow
python scripts/make_demo_assets.py
python scripts/render.py examples/demo-project.json --dry-run
python scripts/render.py examples/demo-project.json --output demo.mp4
```

Requires `ffmpeg` on PATH; `ffprobe` required when mixing narration. The
included demo illustrates code animation without needing paid generators.

## Required response/output for an agent using this skill

For a substantial project, provide these outputs before initiating charged
asset generation or long renders:

1. **Narrative outline and script** (call out fact vs fiction).
2. **Style bible** — concise palette, texture, cutout and typography rules.
3. **Scene table** — narration cue, visual metaphor, assets, transition.
4. **Asset manifest** — image generation/preparation plan for each layer,
   including alpha/masking and licensing notes.
5. **Timeline** — keyframe project JSON or implementation code; timing provenance.
6. **Review criteria** — readability, render stability, audio, consistency.

If asked *only* for a skill or instructions, deliver the skill files rather
than generating external assets or silently starting a billed workflow.
If the user asks for only a prompt, provide a copyable prompt and essential
constraints. If the user asks for a finished video, confirm audio/assets
and use the enabled generation/render tools; don't claim an unrendered video
has been exported.

## Acceptance checks

- [ ] Story beats, timings and spoken text correspond to real narration
      rather than imagined word-level timing.
- [ ] Every independently animated element is its own cutout/alpha layer.
- [ ] Typography remains readable during motion and outside unsafe margins.
- [ ] Wipe has clear entry/exit and does not obscure important text.
- [ ] Original layers stay consistent across frames; no identity morphing.
- [ ] Transitions and moves are keyed deterministically at the target fps.
- [ ] The pipeline does not use an AI video generator for animation.
- [ ] Generated/third-party assets are permitted for use and correctly credited
      where required; no imitation of source watermark.
- [ ] Image generation costs and limitations are represented accurately.

## References

- [references/asset-and-art-direction.md](explainer-asset-direction.md): image prep, detailed still prompts,
  style bibles and separation requirements.
- [references/project-format.md](../../visual-assets/references/explainer-project-format.md): exact renderer input format, keyframes,
  audio options and limits.
- [references/production-playbook.md](../../visual-assets/references/explainer-production.md): narration alignment, scene planning,
  QA, other implementation options and examples.
- `examples/demo-project.json`: runnable two-scene paper-collage sample.
- `scripts/make_demo_assets.py`: generates original placeholder cutout images.
- `scripts/render.py`: reference code-based MP4 compositor, simple narration/music mux;
  archive tests are preserved, not reported as executed by this integration.
