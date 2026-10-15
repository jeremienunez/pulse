# Local Threading SVG

This adapter uses the pinned [Threading application](https://github.com/piellardj/image-stylization-threading/tree/ef93733b28248340958c5843b5d882e6f4f5fef1). The operator supplies its source outside the Pulse checkout/package. The [source lock](threading-source-lock.json) binds 20 files. The runner performs no fetch, build or installation. Its availability inspection reads files and capabilities without launching the engine.

```sh
node scripts/pulse-threading-svg.mjs inspect --profile /absolute/profile.json
node scripts/pulse-threading-svg.mjs run --session /absolute/creative --reservation ID --profile /absolute/profile.json
```

The initial environment is Linux x64, Node24.15.0 with native WebSocket, Chrome155.0.8059.79 and a hashed Python executable. The profile is closed: `kind=pulse-threading-local-profile`, `schema_version=1.0`, `platform`, `arch`, `source={root,source_commit,lock_sha256}`, `chrome={path,sha256,version}`, `python={path,sha256,version}`. Paths are absolute, normalized and free of symlinks. The source root is external; executable digests are operator profile metadata, with actual runtime versions also recorded. An environment change needs qualification before use.

The current owner admits one tool unit with an immutable JSON request. Job fields are exactly `kind=pulse-threading-svg-job`, `schema_version=1.0`, `operation_id`, `brief_id`, `purpose`, `profile_sha256`, `input`, `params`, `deadline_ms`. `capability-probe` uses global/inspection; `creative-variant` uses an admitted visual generation/correction phase. The owner keeps research, actual selection and counters.

`input={path,sha256,media_type,rights_basis}` uses a safe path within the brief. Accept PNG/JPEG only, at most2MiB, sides64–1024, area at most1048576 and aspect1/4–4. Permission is required. Chrome must acknowledge the exact image hash, decoding/dimensions, a new upload epoch and a completed fresh calculation.

| Parameter | Initial contract |
| --- | --- |
| shape | 0 rectangle or1 ellipse |
| pegs | 150–350, step10 |
| lines | 500–2500, step500 |
| opacity | integer1–5 |
| thickness | 0.25,0.5,0.75,1 |
| display_pegs | boolean |
| quality / mode | fixed1 /0 monochrome |
| invert_colors / blur | fixed false /0 |
| show_indicators | true |

Deadline1–60000ms covers snapshots, Chrome, CDP, calculation, export and checker, within the owner's remaining active budget. Logs are64KiB each, CDP proof1MiB, message8MiB, capture4MiB and SVG1MiB; cleanup gets at most one extra second. The browser has a private profile/context/process group and its normal sandbox. Page requests are restricted to the exact local locked sources and controlled data/blob uses; this is not a general network-confinement claim.

The export binds a unique download GUID to the owned frame/blob origin, expected filename, completed event and actual file bytes. The separate checker accepts only the native advanced monochrome grammar, including its exact fixed `line { mix-blend-mode: difference; }` style. It rejects active/raster/general CSS or foreign geometry. The adapter preserves native bytes; it does not sanitize or rebuild an SVG.

Each admitted operation claims `<brief>/threading/<operation>`. An existing attempt cannot be overwritten or replayed. The result and `finish-event.json` propose an owner receipt; the runner never settles it. Interrupted/uncertain work keeps its identity, candidate and pending action. Success requires confirmed process/WS/server cleanup and deadline. `output.svg` is published only after the checker and cleanup pass. `promotion_eligible` stays false.

Upstream tie-breaking uses `Math.random`; preserve the actual output hash without promising universal determinism. The program is GPL-3.0, supplied externally; that licence does not grant rights to the input image. Synthetic transport tests are explicitly fixtures and establish no native export. See the [evaluation protocol](../../../docs/evaluation/frontend-threading-svg.md) for native evidence and limits.
