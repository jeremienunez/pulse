# Camera, exposure, perspective and lighting: responsible heuristics

> Retained method from `photographic-art-direction/references/camera-lighting.md` within `pulse:design`. The current Pulse run owns its decisions and evidence. [Local adaptations](visual-direction-adaptation.md) distinguish direction from external standalone recipes.


These are **planning heuristics**, not fixed settings for every location.
Scout, meter and test the scene; a textual prompt to an image model is only
an approximation of physical camera behavior.

## Camera position is more important than claiming a lens number

- **Perspective** is fundamentally driven by camera position relative to
  objects. Changing focal length alone on a fixed camera generally changes
  angle of view and crop, not object perspective.
- **Shot scale** is camera distance + subject size + framing; do not
  substitute “85 mm” as a generic synonym for intimacy.
- **Lens equivalence** depends on sensor format. Focal lengths below are
  expressed as rough **full-frame-equivalent field-of-view looks**, not
  prescriptions:

| Look | Approx. FF-equivalent range | Useful for | Risk |
|---|---:|---|---|
| Wide context | 24–35 mm | Architecture + human relationship | Near-subject distortion when camera too close |
| Natural space | 40–60 mm | Portrait within environment | Could lose environmental cues |
| Tight selective | 70–105 mm | Face/gesture isolation from farther away | Restricted space, background context loss |

A wide-angle view is sometimes the correct look for a large symmetric street;
controlled radial architecture may need it too. Lens choice should support
camera position and location rather than chase “cinematic lens” trends.

## Depth of field and subject separation

Choose **focus intent**, e.g. “eyes sharp, neon soft but recognizable,”
instead of “extreme bokeh everywhere.” Aperture, focal length, subject-camera
distance, background distance, sensor format and focus point all matter.

Real shoot plan:
- Focus subject priority before optimizing abstract bokeh shapes.
- Keep environmental landmarks recognizable when composition depends on them.
- Night scenes may need a slower aperture/shutter/ISO trade-off, a tripod,
  supplemental light, or a change in framing.

AI prompt plan: state the intended visible distinction (readable face,
soft distant practicals) and inspect output. **Do not promise** an exact
f-stop look merely because `f/1.8` appears in text.

## Exposure and subject movement

- Freeze movement: faster shutter often required, but the required speed
  depends on actual subject velocity, focal length, stabilization and distance.
- Show motion: slower shutter with deliberate camera support or tracking.
- Night urban photography: prioritize whether important practicals should
  hold detail or bloom; accept deep shadows when supported by the story.
- Fireworks: highlights can be vastly brighter than the night sky;
  use a practical exposure test and consider compositing/multiple exposures
  if the project permits. Do not invent an exact exposure recipe.

## Motivated light design

| Role | Planning question | Typical treatment |
|---|---|---|
| Key | What lights the focal subject? | Streetlamp, doorway, window, overhead practical, softbox used as motivated source |
| Fill | How much shadow detail survives? | Bounce, existing spill, or no fill for silhouette |
| Back/rim | Is separation from background required? | Doorway daylight, practical fixture, wall bounce |
| Practical | Is the light source visible in frame? | Lamp, neon tube, corridor lights, lantern |
| Negative fill | Where should the scene be darker? | Flag/black material absorbing spill |

**Hard light** casts defined shadows; **soft light** produces broader transitions,
with softness depending on source angular size from the subject. Color temperature
pairings (roughly tungsten-warm vs daylight-cool) are creative guides, not
measurements of the actual illuminants.

### Example: dark passage / bright exterior

- Position the model near but inside the aperture.
- Camera further inside the passage; exterior establishes key silhouette.
- Hold exterior texture rather than clipping everything to white.
- Optional controlled side bounce adds facial readability only if the story
  calls for identity, not anonymity.
- If the figure disappears, first move the figure into a readable part of
  the bright aperture; don't reflexively add artificial front light.

### Example: central city street at night

- Find the geometric axis by scouting from the camera position.
- Existing lamps motivate light, reflections and street texture.
- Keep people in the street alive and slightly asymmetric; a rigid mirrored
  crowd generally feels fake.
- Control highlights on wet pavements and preserve shadow depth.

## Consistency for campaigns / multi-shot series

Write a **look bible** (not a single adjective):
- Palette: 3–5 dominant material/color families.
- Shadow floor: how dark is permitted without losing hero subject.
- Practical language: which in-world sources are repeatedly visible.
- Subject: identity/wardrobe/gesture consistency if required.
- Texture/grain: clean editorial, restrained grain or deliberate tactile finish.
- Depth: baseline camera distance/subject scale and recurrence of foreground.
- Crop policy: negative space for brand text and platform safe areas.
- Exceptions: one intentional escalation/contrast between shots.

## Production caveat

Drawn light positions (such as the included SVG helper) are communication
symbols only: they are **not** photometric simulations, floor plans, equipment
clearance calculations or physical world coordinates. Safety and power rigging
are handled by qualified crew on location.
