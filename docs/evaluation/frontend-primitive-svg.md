# Primitive: optional local raster to SVG

Primitive reconstructs a permitted PNG/JPEG with geometric shapes. It is useful for image treatments and visual variants. The agent still chooses the intention, references and input; pixel error is not a creativity or UX score. Semantic illustration remains a separate creative operation.

## Availability and build

This capability supports Linux amd64 and needs an explicitly configured static Primitive binary, Bubblewrap and Python 3 with its standard XML parser. Nothing is downloaded by the runtime. The package contains the adapter and [build lock](frontend-primitive-svg/build-lock.json), not Go, a binary, caches or local images.

The source is [fogleman/primitive](https://github.com/fogleman/primitive), MIT, commit `0373c216458be1c4b40655b796a3aefedf8b7d23`. Build in a new local directory outside Pulse, preserving the upstream Go source. Use the lock's official Go archive and verify its size and SHA-256 before extraction. Address the resulting `go/bin/go` by its absolute path. Do not change the global PATH.

Create this module file inside the pinned source copy:

```go
module github.com/fogleman/primitive

go 1.27.1

require (
    github.com/fogleman/gg v1.3.0
    github.com/golang/freetype v0.0.0-20170609003504-e2365dfdc4a0
    github.com/nfnt/resize v0.0.0-20180221191011-83c6a9932646
    golang.org/x/image v0.23.0
    golang.org/x/text v0.21.0
)
```

For each Go command set `GOENV=off`, `GOTOOLCHAIN=local`, `CGO_ENABLED=0`, `GOOS=linux`, `GOARCH=amd64`, empty `GOFLAGS` and private `GOPATH`, `GOCACHE`, `GOMODCACHE`. Download with `GOPROXY=https://proxy.golang.org`, `GOSUMDB=sum.golang.org`, and no private-module exceptions. Run `go mod download all`, compare `go.sum` with the lock, `go mod verify`, then `go build -mod=readonly -trimpath -buildvcs=false -o <new-absolute-binary-path> .`. Record `go version -m`, the source hashes and the actual executable SHA-256. Check its ELF has no interpreter. The selected metadata graph also includes the fixed x/text tooling requirements x/mod, x/sync and x/tools; they are not part of Primitive's compiled packages.

Keep a build manifest with `kind=pulse-primitive-local-build`, `schema_version=1.0`, `source_commit`, `toolchain.version="go version go1.27.1 linux/amd64"`, `compiled_modules` from the lock, `cgo_enabled=false` and `binary={path,sha256,statically_linked:true}`. Its file is separate from the executable. A profile explicitly binds both:

```json
{
  "kind": "pulse-primitive-local-profile",
  "schema_version": "1.0",
  "primitive": {
    "path": "<absolute resolved binary path>",
    "sha256": "sha256:<actual binary digest>",
    "source_commit": "0373c216458be1c4b40655b796a3aefedf8b7d23",
    "build_manifest": {"path": "<absolute manifest path>", "sha256": "sha256:<manifest digest>"}
  },
  "bubblewrap": {"path": "<absolute resolved bwrap path>", "sha256": "sha256:<digest>", "version": "<observed version>"},
  "python": {"path": "<absolute resolved python3 path>", "sha256": "sha256:<digest>", "version": "<observed version>"}
}
```

The manifest is a trusted operator build record; it does not authenticate an arbitrary downloaded executable. `inspect` reads and hashes this configuration without starting executables:

```sh
node scripts/pulse-primitive-svg.mjs inspect --profile /absolute/profile.json
```

Missing capabilities return `unavailable`; malformed or changed configuration returns `invalid`. No implicit executable discovery or fallback occurs.

## Admitted conversion

Use a fresh, approved single-worker Stage 04 owner and its creative session. Create and hash the job JSON, then reserve one tool unit with the existing `creative record` command. The job's identity matches the reservation. An actual creative variant uses a visual/product-ux brief and generation/correction after research admission; a mechanical capability probe uses global/inspection. A probe does not score creative directions or update skills.

```json
{
  "kind": "pulse-primitive-svg-job",
  "schema_version": "1.0",
  "operation_id": "approximation-1",
  "brief_id": "global",
  "purpose": "capability-probe",
  "profile_sha256": "sha256:<profile file digest>",
  "input": {"path": "global/input.png", "sha256": "sha256:<image digest>", "media_type": "image/png", "rights_basis": "Original local asset"},
  "params": {"shapes": 24, "mode": 1, "alpha": 128, "workers": 2, "resize": 256, "output_size": 1024}
}
```

All fields are required; unknown fields are refused. Materialize defaults before reservation: shapes 80, mode 1, alpha 128, workers 2, resize 256, output_size 1024. Limits are 200 shapes, two workers, 256px research resize, 1024px output, repeat zero and a 60-second subprocess deadline. Input is at most 10 MiB, each side at most 4096px. SVG is at most 1 MiB and each process log at most 64 KiB.

```sh
node scripts/pulse-primitive-svg.mjs run --session /absolute/creative-session --reservation reservation-id --profile /absolute/profile.json
```

The new job directory `<brief>/primitive/<operation>/` is claimed exclusively before launch. A second call never reruns that attempt. Snapshots and controlled argv bind the input, executable and parameters. The binary runs in Bubblewrap with no network or HOME, a read-only input/binary, and private writable output. The XML checker accepts only the geometric SVG exported by the pinned program. It refuses scripts, external resources, CSS, animation, DTD/entities and malformed geometry. The public output name is created exclusively after successful conversion and validation.

Review `result.json` and the proposed `finish-event.json`, then record the latter with the existing creative journal. All attempts remain counted. A pending interrupted attempt must be classified by the owner; do not delete its directory to retry. An SVG becomes creative evidence only after a separately admitted rendered inspection. Conversion is nondeterministic: retain the actual output hash and describe approximation losses.

## Verification

`node --test scripts/test-pulse-primitive-svg.mjs` exercises admission, identity, bounds, no-overwrite, repeat prevention, subprocess errors/timeouts/log limits and hostile SVG. Controlled executable fixtures prove contract guards only. A real pinned-binary conversion and an independent rendered inspection are required for a native capability claim. Distribution verification runs `scripts/test-build-plugin-dist.mjs` against an extracted package.
