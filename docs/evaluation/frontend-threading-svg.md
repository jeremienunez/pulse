# Optional local Threading SVG adapter

The adapter drives the pinned browser application to convert a permitted material image into native string-art SVG. It adds no image generator, download service or automatic installation. [Visual-assets routing](../../skills/visual-assets/references/routing.md) selects the method; the existing creative journal admits an actual operation. Primitive retains its own effect, job and grammar.

## Availability

The initial profile requires Linux x64, Node24.15.0 with native WebSocket, installed Chrome155.0.8059.79 and Python standard-library XML support. A normalized absolute profile identifies external source, exact source commit/lock and executable hashes/versions. The [source lock](../../skills/visual-assets/references/threading-source-lock.json) lists20 exact files at upstream commit `ef93733b28248340958c5843b5d882e6f4f5fef1`. Upstream GPL-3.0 code is operator-supplied outside Pulse; its source licence is separately locked. It is not bundled into the plugin.

```text
node scripts/pulse-threading-svg.mjs inspect --profile /absolute/operator/profile.json
```

`inspect` verifies profile, source and executable bytes without executing the engine or programs. A missing/invalid profile is unavailable/invalid, not proof of a successful export. CLI exit status is nonzero unless inspection reports available. No network fetch or installation occurs in the adapter.

## Admitted request

`runThreadingSvg({session,reservation,profile})` requires the current active one-unit tool reservation. A creative variant belongs to a visual/product-UX brief in generation/correction, with current accepted research; a capability probe uses global/inspection and proves only conversion mechanics.

The closed job contains `kind: pulse-threading-svg-job`, version1.0, operation/brief IDs, purpose `creative-variant|capability-probe`, profile digest, input, parameters and deadline. Input is `{path,sha256,media_type,rights_basis}` within the brief. PNG/JPEG must be64–1024 pixels per side, at most1,048,576 pixels and2MiB, aspect1/4–4. Preserve exact permitted bytes and permission evidence separately from the engine licence.

| Control | Initial supported values |
| --- | --- |
| shape | 0 rectangle,1 ellipse |
| pegs | 150–350 by10 |
| lines | 500–2500 by500 |
| opacity | Integer1–5 |
| thickness | 0.25,0.5,0.75,1 |
| display_pegs | Boolean |
| quality / mode | Fixed1 /0 monochrome |
| invert_colors / blur / show_indicators | Fixed false /0 /true |

The1–60,000ms deadline covers snapshots, browser, upload, calculation, export and checking. Logs are bounded to64KiB each, CDP trace1MiB, messages8MiB, capture4MiB and SVG1MiB; cleanup has at most one additional second.

```text
node scripts/pulse-threading-svg.mjs run --session SESSION_ROOT --reservation RESERVED_UUID --profile /absolute/operator/profile.json
```

## Actual export and settlement

Each operation exclusively claims `<brief>/threading/<operation>`; an existing attempt cannot be overwritten or replayed. The driver snapshots exact source/input/profile/checker/adapter/runtime bytes, launches its own normal-sandbox Chrome process group and private context, and uses a loopback endpoint with locked local page resources. It never attaches the user's browser. Page filtering is a bounded transport control, not a claim of general network confinement.

The upload must acknowledge the exact input digest, decode/draw, new upload epoch, effective controls and a newly completed calculation. Initial bootstrap counters alone are insufficient. One export click must yield a unique GUID bound to the owned frame/blob origin, expected filename, completed event and actual downloaded bytes.

The separate checker accepts only native advanced monochrome geometry: the expected1000² viewBox, rect/g/line/circle roles, counts and numeric bounds, plus the exact fixed style `line { mix-blend-mode: difference; }`. It rejects active content, raster, foreign geometry and general CSS. It validates rather than sanitizes or rebuilds the SVG. Publication of exact native bytes requires successful checking, deadline and confirmed process/WS/server cleanup.

`result.json` and `finish-event.json` propose the owner receipt. The runner does not settle it. Root verifies returned artifact hashes and actual outcome, then records the proposed receipt in the existing creative journal. Unknown transport/cleanup retains an uncertain identity; no silent retry is authorized. Upstream tie-breaking uses `Math.random`, so preserve output hashes without universal determinism claims.

## Observed scope and regression checks

The design-expression-assets pilot executed an integrated native1.1 capability probe and a separate creative variant from Met object308015, explicitly marked public domain. The latter produced2,000 lines,210 pegs and106,554 bytes in3.9 seconds with confirmed cleanup; SHA-256 `b177a412ccc8484d37af1dcd885130b5e4df265edb41e695bab2e0d90b4a6d1f`. Root inspected the exact native render and its use in two initial prototypes and the user-requested combination. This proves the observed local path, not all profiles, images or aesthetic outcomes.

```text
node --test scripts/test-pulse-threading-svg.mjs scripts/test-pulse-creative-session.mjs scripts/test-pulse-primitive-svg.mjs scripts/test-build-plugin-dist.mjs
```

Fixtures cover refused admission, wrong profiles/inputs, no-overwrite, malformed/active SVG, bounds, download identity, timeout/cleanup and owner settlement. Injected transports require a fixture session and do not establish a native export. Packaging carries the adapter, checker, guides and lock; engines, profiles, caches, source snapshots and pilot images remain outside distribution. See [evaluation qualifications](design-expression-assets.md).
