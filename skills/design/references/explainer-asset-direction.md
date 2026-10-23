# Style bible and layered still-asset preparation

> Retained method from `code-animated-explainer/references/asset-and-art-direction.md` within `pulse:design`. The current Pulse run owns its decisions and evidence. [Local adaptations](visual-direction-adaptation.md) distinguish direction from external standalone recipes.


## Reference-image intake

Describe reusable, high-level properties, not a demand for exact copies:

- **Paper:** aged ivory stock, irregular deckled borders, fine ink grain,
  subtle registration shift and natural scanned-surface texture.
- **Palette:** warm parchment (#E1D3AE), dark ink (#282A27), muted teal
  (#446D70), antique gold (#B08A45), restrained crimson accent (#8E4240).
- **Depth:** flat cutouts arranged on two or three clear planes; sparse soft
  cast shadows to indicate overlap without turning the work into 3D.
- **Print grammar:** antique engravings, found-object shapes, silhouettes,
  halftone bands, restrained grain, limited bold captions.
- **Transitions:** left/right/up/down torn-paper reveals, paper-strip slide;
  do not apply the same effect to every element.
  This is the creative vocabulary. The supplied reference `render.py` accepts
  only `up`/`down`; horizontal wipes need another renderer or a separately
  reviewed extension.

The Reel uses ancient Egyptian imagery and surreal juxtapositions, but the
same grammar can support science, history, economics, geography or fiction.

## Prepare assets as independent layers

A useful minimum per scene is:

| Item | Typical file | Background | Special requirement |
|---|---|---|---|
| Main paper base | `paper-base.jpg` | Opaque | Consistent texture and grade across scenes |
| Setting / plate | `city-or-landscape.png` | May be opaque | Avoid baked-in movable subjects |
| Cutout main subject | `subject.png` | Transparent | Full silhouette, safe motion margin |
| Foreground element | `foreground.png` | Transparent | Clean alpha, no white box |
| Motif 1 / 2 | `planet.png`, `symbol.png` | Transparent | Can pivot/scale without seams |
| Dust/ink overlay | `paper-grain.png` | Semi-transparent | Optional; limit contrast |

**Important:** Image-generation platforms may supply a single flattened image
rather than true layers or alpha. Build masked cutouts yourself (with image
editing, segmentation, or separately generated isolated objects). Inspect
feathered edges on contrasting backgrounds before rendering.

## Original example: astronomy explainer

Make an original vintage-paper explainer about the history of observing
comets. Two frames require separate assets:

### Scene 1: A celestial visitor

**Background-plate prompt:**

> Vertical vintage textbook illustration, flat parchment background with
> muted teal night-sky paper silhouette over desert hills, discreet stipple
> textures, room near top for a headline, broad clean negative space near
> bottom for subtitles, antique print registration, restrained warm ink.
> Environment only, NO people or comet, NO text, 9:16.

**Comet cutout prompt:**

> Isolated antique engraved comet with sweeping ivory tail, hand-tinted
> muted gold and teal, vintage woodcut ink outlines, centered on a plain
> removable background with complete silhouette and no cast shadow,
> collectible ephemera aesthetic, no lettering. Preserve the whole object.

**Observer cutout prompt:**

> Single astronomer silhouette in long coat looking upward through a small
> hand telescope, 19th-century paper engraving shape, ink-black with warm
> ivory hatched highlights, full body in frame, isolated for alpha-matting,
> no environment, no text, no additional people.

### Scene 2: Tracing an orbit

**Background:** parchment celestial map, light dotted arcs, no comet.

**Independent layers:** small sun disc, orbit ellipse graphic, same comet
cutout, pointer label; each cropped without accidental surrounding artifacts.

**Animate:** orbit reveals as narrator says “path”; comet follows a curved
path over 0.9 s; text rises into view on its voice cue. Camera remains stable
and typography is pinned to screen coordinates.

## For a generator with style-reference media

- Supply **only** assets user has rights to use; do not assume Pinterest
  references are free to redistribute or edit.
- Confirm that the selected image model supports reference media and
  requested ratio/alpha; do not invent model feature availability.
- Generate plates and foreground objects in independent jobs, then inspect.
- If alpha is unavailable, segment the object after generation.
- Export local paths as `examples/assets/scene-01/subject.png` etc. The
  code renderer consumes files; it does not pull assets from private URLs.

## Layering and motion pitfalls

- Flat background with an embedded subject: **cannot** separate layers
  without additional masking. Do that work explicitly.
- Missing head/limb in a generated cutout: leave more margin and re-generate.
- Halftone texture flickering: use a static overlay instead of regenerating
  a different image every frame.
- Excessive parallax: a flat paper illustration should move like stacked
  sheets, not like a real 3D photogrammetry scene.
- Tiny title fonts: validate on the final target device, including 9:16
  UI overlays.
