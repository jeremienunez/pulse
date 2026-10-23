# JSON project input contract — `scripts/render.py`

> Retained method from `code-animated-explainer/references/project-format.md` within `pulse:visual-assets`. The current Pulse run owns its decisions and evidence. [Local adaptations](../../design/references/visual-direction-adaptation.md) distinguish direction from external standalone recipes.


The renderer is a deterministic 2D compositor. It reads a JSON file and local
PNG/JPG stills, draws the timeline at the specified FPS with Pillow, and
encodes H.264 via FFmpeg. There is **no AI video inference** and no
transcript-to-audio forced alignment.

## Top-level structure

```json
{
  "width": 360,
  "height": 640,
  "fps": 15,
  "audio": {
    "voiceover": "audio/narration.wav",
    "music": "audio/music.wav",
    "voice_gain": 1.0,
    "music_gain": 0.16
  },
  "scenes": [
    {
      "id": "opening",
      "start": 0.0,
      "end": 3.0,
      "background": "#E1D3AE",
      "background_image": "assets/paper-base.jpg",
      "transition": {"type": "paper-tear", "duration": 0.35, "direction": "down"},
      "camera": [
        {"t": 0, "scale": 1.0, "dx": 0, "dy": 0},
        {"t": 3, "scale": 1.04, "dx": -0.01, "dy": 0, "ease": "ease-in-out"}
      ],
      "layers": [
        {
          "src": "assets/moon.png", "x": 0.54, "y": 0.25,
          "width": 0.50, "z": 1,
          "keyframes": [
            {"t": 0, "dy": -0.15, "opacity": 0, "scale": 0.8},
            {"t": 0.6, "dy": 0, "opacity": 1, "scale": 1, "ease": "ease-out"}
          ]
        }
      ],
      "captions": [
        {"start": 0.3, "end": 2.7, "text": "A visitor from the sky", "y": 0.82, "size": 26}
      ]
    }
  ]
}
```

**All asset/audio paths resolve relative to the JSON file's directory.**
Missing `audio` is valid for silent drafts. Scene intervals use **seconds on
the global timeline**: scene 2 must begin when scene 1 ends. Layers and
camera keyframes use **scene-relative** times. Captions use **global** times.

## Top-level fields

- `width`, `height` — even pixel dimensions at least 16 for H.264 yuv420p.
- `fps` — integer from 1 to 60; 24 or 30 recommended for final output.
- `scenes` — at least one shot; sorted, gapless, start at 0, end > start.
- `audio` — optional object, paths for `voiceover`, `music`, and gains in the inclusive range 0–2.

The renderer checks for missing assets and invalid time spans before render.
With `ffprobe` available, narration is rejected only when its duration is
more than the visual end plus 0.15 seconds. That tolerance is not a guarantee
that the final word is never cut; inspect the actual mux and intended ending.

## Scene fields

- `id`, `start`, `end`, `background` — required.
- `background_image` — optional local image, resized proportionally until it
  covers the frame, then center-cropped. Aspect ratio is preserved; edges may
  be removed (e.g. the sides of a landscape plate used in portrait). Prepare
  a plate for the intended ratio and inspect the crop and subject-safe area.
- `layers` — optional array of independently animated PNG/JPGs.
- `captions` — optional array of text overlays; they remain screen-aligned.
- `camera` — optional keyframe array to zoom and pan the *artwork*.
- `transition` — optional object: `type="paper-tear"` and `duration`
  in seconds (first scene transition ignored), direction `down` or `up`;
  duration must be no longer than new scene duration.

## Layer fields

- `src` — local path to PNG/JPG image.
- `x`, `y` — normalized *center* coordinates on scene canvas: 0..1 lies in-frame; the validator
  accepts −2..3 to permit off-frame positions.
- `width` — width as canvas fraction; image height follows aspect ratio.
- `z` — stacking order; higher draws last.
- `keyframes` — optional list of scene-local keyframe objects:
  `t` (seconds), `dx`, `dy` (normalized canvas offsets), `scale`,
  `rotate` (degrees), `opacity` (0..1), and `ease` (`linear`,
  `ease-in`, `ease-out`, `ease-in-out`, `hold`). An omitted property holds its
  previous value. Defaults: 0, 0, 1, 0, 1 respectively.

Keyframe coordinates refer to *one layer*, not a 3D camera. Rotation is
about the image center. The compositing model is ideal for intentionally
2D graphic cutouts, not true skeletal animation or physically correct depth.

## Caption fields

- `start`, `end` — global times when the caption is drawn.
- `text` — title or subtitle; automatic line wrap.
- `y` — normalized center-ish vertical anchor for first line (default 0.82).
- `size` — literal pixel font size (default 28); adjust it explicitly for the
  output resolution. There is no automatic resolution scaling.
- `color` — any Pillow-supported color, default near-black.
- `font` — optional installed font path/name; the default request is `DejaVuSerif.ttf`, then the loader tries
  `DejaVuSans.ttf`, then Pillow’s default font. No font files are bundled.

## Practical limitations

- This sample engine has no rotoscoping, 3D geometry, skeletal rigs, optical
  flow, particle dynamics, or automatic text/speech alignment. Bring in
  Remotion, Blender, After Effects or compositing if needed.
- Wipes are stylized irregular procedural masks; the script does not simulate
  physically torn fibrous paper.
- Music and narration are mixed at fixed gain. For professional sound,
  perform loudness normalization and ducking in an audio editor.
- Prompt engineering for still assets does not guarantee transparent PNGs.

## External runtime boundaries

This is the contract of the pinned standalone source, not an installed Pulse
renderer. It rejects more than 100,000 frames, accepts no explicit maximum
pixel dimensions, and gives its FFmpeg subprocesses no deadline. A future
admission must bound pixels, time, files and fresh output paths; it cannot
borrow the frame limit as a memory or duration budget. Renderer and beatmap
output paths can overwrite files. Beatmap accepts a positive real fps, whereas
this renderer requires an integer from 1 to 60: choose a compatible timeline
explicitly. No ASR, forced alignment, segmentation or lip-sync is supplied.
