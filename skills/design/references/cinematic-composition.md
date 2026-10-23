---
name: cinematic-composition
description: Apply cinematic composition to image generation, image editing, video storyboards, camera moves, visual art direction, and optional web hero imagery. Analyze and select diagonal lines, axial balance, frame-within-frame (tunnel), or rule of thirds; produce actionable framing specifications and checks. Use when a user asks for stronger framing, cinematic imagery, composition critique, shot design, or prompt improvement.
---

# Cinematic Composition

> Retained method from `cinematic-composition/SKILL.md` within `pulse:design`. The current Pulse run owns its decisions and evidence. [Local adaptations](visual-direction-adaptation.md) distinguish direction from external standalone recipes.

> Reel observations below are attributed to the supplied pack’s analysis (2026-10-19); this integration has not independently viewed those Reels.


## Purpose
Transform a vague image or video brief into intentional spatial composition. Ground this skill in four visual devices illustrated in the source Reel: **diagonal**, **symmetry**, **tunnel / frame within a frame**, and **rule of thirds**. The goal is visual clarity, not applying every device at once.

## Activation
Use for visual direction, photo/video generation prompts, storyboards, camera planning, image critique, image editing, or imagery for a site/portfolio. Avoid applying to unrelated text-only tasks.

## Inputs
Obtain or infer: subject, visual objective/emotion, medium (still/video/UI image), frame aspect ratio, intended focal element, environment, and constraints (must-preserve items, safe areas, text overlays, camera motion). If input image exists, analyze it before proposing edits. Mark inferred choices as assumptions when material.

## Composition selection

| Device | Best use | Framing instruction | Watch for |
|---|---|---|---|
| Diagonal | Motion, tension, dynamism, depth | Align a dominant real-world edge, railing, road, shadow, or horizon-like leading line obliquely toward the focal point | Accidental crooked horizon; lines leading off-frame |
| Symmetry / axial balance | Order, monumentality, stillness, duality | Establish central vertical/horizontal axis; balance visual masses left/right, or use near-symmetry deliberately | Confusing bilateral symmetry with mere balanced composition; unwanted sterile look |
| Tunnel / frame within a frame | Focus, discovery, intimacy, passage | Place subject within a natural or architectural opening: door, arch, corridor, window, foreground silhouettes | Frame too dark/thick; subject obscured; cluttered edges |
| Rule of thirds | Naturalistic balance, openness, editorial shots | Place primary subject or horizon near x=1/3 or 2/3 and/or y=1/3 or 2/3; leave useful negative space | Mechanically forcing exact intersections; cropping faces or limbs |

**Source accuracy:** The Reel labels a harbor view "SYMMETRY"; treat its example as *axial visual balance* unless actual mirrored geometry is visible. Do not assert that the image is mathematically symmetrical. Composition guidelines are heuristics, not strict rules.

## Workflow
1. **Read the intent:** Identify what the viewer should notice first and what feeling the frame should evoke.
2. **Audit the scene:** Identify potential lines, symmetry axes, foreground openings, subject positions, backgrounds, distractions, lighting contrast and safe areas.
3. **Choose one dominant device:** Pick whichever best reinforces narrative and available geometry. A secondary device is optional; never stack effects without reason.
4. **Specify camera and spatial layout:** State aspect ratio, viewpoint (height, distance, angle), focal element and normalized approximate subject position (x/y in [0,1]), leading lines or frame edges, headroom and negative space. For moving shots, specify start/end compositions, camera direction and subject tracking.
5. **Handle contrast and hierarchy:** Distinguish subject using luminance, hue, focus, motion, or scale. Do not let graphic guides remain in the final image unless explicitly requested.
6. **Write generation/editing directions:** Preserve subject identity and scene facts if editing an existing image. State what should change and what must remain unchanged.
7. **Validate:** Is the focal point immediate? Does geometry direct attention? Are edges intentional? Is the subject readable at thumbnail size? Is there sufficient text-safe space if required?
8. **Iterate:** If ineffective, change one variable at a time (crop, camera axis, focal position, leading line, depth/foreground), then compare.

## Output contract
For a standard request, deliver:

- **Creative intent:** one concise sentence.
- **Chosen composition:** primary technique and a one-sentence rationale.
- **Frame specification:** aspect ratio; camera height/angle/distance; approximate focal x/y; foreground/midground/background; guiding geometry; negative space.
- **Ready-to-use prompt:** clear natural-language prompt focused on visible spatial relations.
- **Validation checklist:** 3–5 checks specific to the proposed image/shot.

For a sequence, use a shot list with duration, composition, camera motion, subject action, and transition. For critique, score *focal clarity*, *geometry*, *subject separation*, and *edge cleanliness* qualitatively (strong / needs work); do not pretend visual metrics were measured when they were not.

## Prompt pattern
"[Subject/action] in [environment], [time/lighting]. [Chosen technique] composition: [precise spatial relationship of lines/frame/axis/thirds]. Camera [angle/height/lens-like field of view/distance]; focal subject at approximately [normalized x,y]; [foreground, midground, background]; [depth, contrast, negative space]. [Aspect ratio]. Preserve [invariants]. Avoid [specific framing defects]."

## Camera motion guidance
- **Diagonal:** lateral tracking or push-in that maintains the dominant line and carries attention toward subject.
- **Symmetry:** locked-off or measured centered dolly; deliberate deviations can signal a narrative change.
- **Tunnel:** gradual reveal through an opening; keep architectural frame readable as the camera advances.
- **Thirds:** pan or follow while holding the subject near a third and preserving look-room.
- Never promise exact lens, metric distance, physical precision, or camera tracking from a generative video model unless supported by the selected system.

## Examples

**Still / tunnel:** "A lone commuter approaching from a sunlit street, seen from inside a shaded stone archway. Frame-within-frame: the arch creates a dark border around the brighter exterior, commuter centered just right of the opening's midpoint; eye-level camera, deep perspective, crisp silhouette, warm exterior/cool shadow separation, 16:9. Keep the subject unobstructed; no added composition guides."

**Still / diagonal:** "Two parallel escalators in a dim station, railings sweep diagonally from bottom-left toward upper-right, riders moving in opposite directions, primary rider near the diagonal's convergence, low vantage point, controlled leading lines, cinematic contrast, 16:9. Avoid random tilted horizons."

**Video / thirds:** "Five-second elevated night intersection shot; subject traffic occupies the lower-right third; wide city geometry and neon above; slow left-to-right pan maintains visual balance and open space on left, 9:16; steady camera, no abrupt reframing."

**Web portfolio hero:** "Subject on right third, strong directional lines into the focal element, relatively clean left half reserved for title and CTA; on mobile, recrop and re-evaluate subject and typography overlap instead of simply shrinking the desktop frame."

## Provenance
Inspired by an approximately 15-second Instagram Reel titled "THE ART OF COMPOSITION", https://www.instagram.com/reel/DdF8T54z_4c/ (analyzed 2026-10-19). It sequentially demonstrates diagonal escalator lines, a harbor shot labeled symmetry, a person viewed through a tunnel, and a neon intersection with a thirds grid. This skill is an **operational adaptation** of those four visual concepts, not a transcript or attribution of the added procedures to the video's creator.
