# Photo-direction output templates

> Retained method from `photographic-art-direction/references/shot-card-template.md` within `pulse:design`. The current Pulse run owns its decisions and evidence. [Local adaptations](visual-direction-adaptation.md) distinguish direction from external standalone recipes.


## Short director's treatment

**Director's thesis:** [Emotion/message in one sentence.]

**Visual hierarchy:** [First read] → [second read] → [context].

**Composition:** [one main choice and why it helps the emotion].

**Camera:** [position/height, distance, crop, perspective, focal look and sensor
context if specified, focus and movement if video].

**Blocking:** [subject posture, orientation, gaze and position against geometry].

**Light:** [motivated source location → key quality → deliberate shadow/fill →
separation/practicals].

**Look:** [palette, weather, surfaces, wardrobe, texture, grade].

**Preserve:** [identity, logo/text, geometry, consistent scene properties].

**Avoid:** [practical failure modes; only consequential restrictions].

**Test frame checklist:** [3–5 observable criteria, not subjective scores].

## Photographic shot card

```markdown
### Shot ID / title
- Role in story:
- Delivery crop / safe space:
- Primary subject and emotional beat:
- First-read point and eye path:
- Composition grammar + reason:
- Camera position / height / angle:
- Lens *look* / optional sensor & focal length:
- Focus plane and DOF intent:
- Foreground, midground, background blocking:
- Main light source, angle and shadow character:
- Fill / separation / visible practicals:
- Color, wardrobe and set dressing:
- Measured-camera settings needed on location: [TBD / measured values]
- Non-negotiable continuity:
- Risks and plan B:
- Acceptance shot / what to inspect:
```

## A compact production-ready generative still prompt

> [Narrative moment and precise physical action] in [named setting/time].
> View from [camera location/height], [shot scale], with [composition
> geometry and first-read subject placement]. [Light source] from [direction]
> creates [contrast and shape]; [visible practicals] motivate [local color].
> [A few tactile material/environment details]. [Subject is sharp / other
> depth elements are intentionally soft as described]. [Palette and mood]
> arise from these choices. [Crop, safe area, and preserve constraints].

**Optional negatives:** only model-supported separate negative input; otherwise
short exclusions in the prompt: “keep existing doorway shape; do not add neon
sources or duplicate people”.

Do not pretend words like “full frame 50 mm f/2 1/125 ISO 800” guarantee
EXIF or literal lens rendering in a generative model.

## Four-shot cohesive series matrix

| Shot | Emotional job | Frame grammar | Shared element | Deliberate variation |
|---|---|---|---|---|
| Establish | Scale and mood | Symmetry | Same palette | Wide frame |
| Discover | Place viewer near subject | Frame within frame | Same protagonist | Foreground darkness |
| Intensify | Visual wonder | Radial | Same light logic | More expressive geometry |
| Resolve | Intimate human detail | Golden flow | Same wardrobe | Closer focus / gesture |

Ask whether captions/logos will be applied later, then reserve intentional
negative space rather than letting complex geometry fight copy.
