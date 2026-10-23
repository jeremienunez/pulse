# Prompt examples and model-aware checks

> Retained method from `cinematic-prompt-direction/references/prompt-examples.md` within `pulse:design`. The current Pulse run owns its decisions and evidence. [Local adaptations](visual-direction-adaptation.md) distinguish direction from external standalone recipes.


The examples below demonstrate the principles in the Reel. They are newly
written examples, **not quotations** of its prompts or claims about the
exact images appearing in the video.

## 1. Still portrait: vague -> directed

### Vague
> A beautiful cinematic ultra-realistic portrait, 4K, perfect lighting.

### Directed
> Evening city bus, passenger in a worn olive jacket seated by a rain-streaked
> window, looking down at a phone just outside frame. Tight medium shot from
> the adjacent seat at eye level; passenger on the right third, reflections
> receding to the left. Cool streetlights sweep across the glass and a single
> warm overhead cabin fixture lights the side of the face. Natural under-eye
> texture, softly wrinkled fabric, restrained contrast, distant traffic bokeh;
> slight background motion blur but tack-sharp eyes. Vertical 9:16.

**Optional negative field** (only where supported):
`waxy skin, HDR halos, oversaturated reflections, unrealistically perfect
symmetry, duplicated fingers, floating phone, garish lens flare`

**Check:** Does the eye remain readable at thumbnail size? Are warm/cool lights
plausible? Is the moving background blurred without smearing the face?

## 2. Fashion still: stylized, not generic “photoreal”

**Brief:** Deliberately editorial atmosphere, black tailoring, crimson room.

**Prompt**
> A person in a dark tailored suit pauses by a half-open doorway in a narrow
> crimson backstage corridor. Medium-wide shot from waist height, slightly
> off-center with dark doorway edges framing the shoulders. One overhead
> tungsten practical cuts a narrow highlight across the cheek and lapel;
> the rear wall falls to deep maroon shadow. Visible fabric weave, tiny scuff
> marks on polished floor, restrained film grain. Quiet tension, one cinematic
> moment, horizontal 16:9; avoid symmetrical fashion-catalog posing.

**Optional negative:** `glowing eyes, artificial red neon outline, immaculate
plastic skin, mirrored background objects, distracting graphic effects`

**Check:** Does the light explain the red/black separation? Is the subject
silhouette clean? Does the imperfection support the atmosphere?

## 3. Six-second video: one plausible shot

**Prompt**
> One continuous six-second shot, 9:16. Night bus during light rain.
> Opening (0–1 s): medium close-up at seated eye level of a passenger
> watching city lights through a streaked window; a dim overhead fixture
> illuminates the shoulder. Action (1–5 s): the passenger notices a phone
> vibration, looks down, and reaches toward the device in their lap.
> Camera: very subtle handheld drift from the aisle-side seat, no dolly
> or fast pans. Moving streetlights smear gently across the window while
> the face and hands remain legible. Ending (5–6 s): hold on the
> passenger's reaction, same face, jacket, seat and background.
> Realistic exposure shifts as the bus passes streetlights; no hard cuts.

**Optional negative:** `face morphing, extra hands, flicker, sudden zoom,
time jumps, moving window geometry, impossible camera teleportation`

**Check:** One continuous take? Single natural gesture? Background motion
consistent with a moving bus? Subject identity stable?

## 4. Prompt audit checklist

Use this comparison before submitting to a model:

| Weak prompt trait | Operational replacement |
|---|---|
| Only “cinematic / 8K / perfect” | Specific subject, moment, viewpoint and light |
| “Dramatic lighting” | Named source, direction, hardness and shadow falloff |
| “Realistic” | Material texture, plausible exposure, select environmental detail |
| “Handheld + sharp everything” | Subtle camera drift with a readable focal subject |
| 20 contradictory stylizations | One core visual decision plus restrained texture |
| Long indiscriminate negative list | 3–8 relevant failures in dedicated field if available |
| “Camera flies everywhere” | Measured movement path from one opening frame to one ending frame |

## 5. Tool compatibility

- **Image generator with separate negative field:** send the prompt and negative
  line separately. Set resolution/aspect through supported settings.
- **Generator with only one prompt:** write the positive desired visual first,
  then short plain-language exclusions; if the model ignores exclusions,
  rewrite the desired positive composition instead.
- **Video model:** prioritize one continuous action and stable visual invariants;
  include start/middle/end and motion speed/direction. Only include sound
  when supported and requested.
- **Image/video editing:** clearly name what changes **and** what must remain.
  Prefer references when supported to preserve identity, wardrobe, geography.
