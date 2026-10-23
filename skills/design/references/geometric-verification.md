# Geometry and verification notes

> Retained method from `geometric-composition-director/references/geometry-and-verification.md` within `pulse:design`. The current Pulse run owns its decisions and evidence. [Local adaptations](visual-direction-adaptation.md) distinguish direction from external standalone recipes.


## Coordinates and phi

For a frame of width W and height H, normalized x,y are the pixel positions
x/W and y/H. The golden ratio is

  φ = (1 + sqrt(5)) / 2 ≈ 1.6180339887

It follows that 1/φ ≈ 0.618 and 1/φ² ≈ 0.382.

A **golden-section grid** contains x≈0.382W, 0.618W and/or
y≈0.382H, 0.618H. These crossings are *possible* places for a focal
object, not obligations. The specific source Reel shows a spiral overlay
and a subject near a visually indicated focal area; its exact geometry
has not been independently measured.

A **logarithmic golden spiral** satisfies r(θ + π/2)=φ × r(θ). One
parametrization is r(θ)=r0×exp((ln φ)/(π/2)×θ), drawing with θ increasing
outward. A **Fibonacci spiral** is conventionally approximated by quarter
circle arcs through successively sized Fibonacci squares; these are
related visual constructions, not mathematically identical. The helper
script renders the smooth logarithmic version and labels it as such.

A 9:16 vertical composition does not magically become a golden rectangle.
Placing the focal point at a golden-section intersection is reasonable
without asserting that the *frame* itself has a 1.618 aspect ratio.

## Thirds

Gridlines at x=W/3, 2W/3 and y=H/3, 2H/3 are exact in the planning
canvas. In filmed imagery the viewer's eye may prefer an offset from
the guide due to gaze, gesture, focus, color or text position.

## Center and circular framing

The center point is (W/2,H/2). A central doorway can form a strong axis
even if silhouettes to either side differ. For circular framing, the
script shows a nominal circle around a focus. In the actual image, an
ellipse/perspective opening, round window or soft pool of light may be
more convincing than a mathematically perfect circle. Do not include
an artificial graphic ring in a photoreal final scene unless asked.

## Scale

An object of known height standing in the same spatial plane is a
rough scale cue; a person standing closer to camera is not automatically
comparable to a distant building in pixels. To *measure* physical scale,
account for perspective, focal length, distance and possibly calibration.
This skill can make a visually legible **perceived** scale contrast, but
its guides do not certify metric size.

## Triangle

A triangle of interest uses three perceivable anchors—people, faces,
lighting accents, objects, hands, edges. The helper's three positions are
placeholders; an agent or designer should move them to concrete objects
in the frame and adjust the hierarchy if the scene is too crowded.

## Real-world review procedure

1. Open the image with and without the overlay.
2. Identify actual focal elements independently of the geometry.
3. If the main subject does not coincide with a guide, decide whether
   the mismatch genuinely harms the story. If not, leave it alone.
4. Check headroom, limb crop, depth, perspective, tangent edges and
   room for subtitles or site text.
5. Review at thumbnail size and again in the intended display aspect.
6. Do not use “composition score 95%” or “golden ratio verified” unless
   a defensible measurement method and relevant geometry were supplied.
