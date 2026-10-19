# Deterministic code quality

Pulse checks the actual Git index, including partial or alternate staging. Code quality is a deterministic policy over that snapshot, a declared comparison baseline and identified native tools. It is not a SOLID/Clean certificate or an automatic refactoring engine.

The Pulse source hook and CI keep their existing technical checks. When the indexed source includes `pulse-quality.config.json`, they also run its code policy. Other repositories use an explicit code scope; they do not run Pulse's internal workflow tests:

```bash
node /path/to/pulse/scripts/pulse-quality.mjs --scope code --repo-root /path/to/project --profile commit --toolchain-root /path/to/prepared-tools
node /path/to/pulse/scripts/pulse-quality.mjs --scope code --repo-root /path/to/project --profile ci --toolchain-root /path/to/prepared-tools --json
```

Stage policy and intended source first. Unstaged repairs cannot conceal an indexed violation. The verifier does not fix files, stage code or create a project commit. Receipts are under the target worktree's Git directory, `pulse-quality/<tree>-<run-id>/result.json`, with raw tool logs. Explicit baseline export is a separate write operation.

## Rules and profiles

| Profile | Checks | Scope and limits |
| --- | --- | --- |
| `metrics` | Tokei code/comment/blank census; optional Lizard function signals | Broad language coverage; lexical counters do not establish a complete AST |
| `javascript` | Maintained TS/ESLint AST, LOC, parameters, control complexity, nesting, naming, public contracts, local ownership/import graph | Fixed Pulse probes, not a claim to run every project ESLint rule; type resolution is separate |
| `python` | Standard `ast`/`tokenize` facts, Ruff diagnostics, class/public-surface signals | Native naming/lint; no implicit typecheck or complete layer graph |
| `rust` | Lexical metrics separately; Cargo/Clippy offline and locked in CI | Requires prepared native context; no automatic toolchain install; compiler failures retain partial diagnostics without a complete-analysis claim |
| `frontend` | Declared token sources, literal/unknown/name/definition-owner checks, CSS/SCSS with native parsers, static JSX styles | No full cascade, arbitrary JS evaluation or complete Tailwind semantics; dynamic styles remain explicit review/incomplete coverage |
| `native` | Fresh JSON/SARIF 2.1.0 reports from declared local project analyzers | Any language can bind a native tool; a preset family is not proof that its SDK/tool is installed |

Go, .NET/C#, JVM/Java, C/C++, PHP, Ruby, Swift, Kotlin, Dart, Shell and other families use the same binding contract. Required missing tools or unsupported checks return unavailable, not a false pass. `patterns` lets a new language select its files without editing the core language-extension table. Existing project lint/type/architecture commands remain project-owned; binding them is explicit, rather than claiming the fixed Pulse probes replace their configuration.

A class/type is useful when it owns coherent state, invariants, identity or a resource lifecycle. Shared pure transformations can remain functions. New exported functions/types/classes, utility catch-alls, static-only classes, clones and unused exports produce focused review signals. Neither one consumer nor two matching blocks mandates extraction.

File naming supports role-pattern overrides independently of a language parser. Token allowed values can be a common list or a property-to-list mapping.

Initial budgets are configurable: function 50/80 lines, class 250/400, file 400/600, control complexity 10/15, nesting 3/4, parameters 4/6 (warning/strict). LOC alone warns by default. `strictBudgets` enables named hard budgets after corpus calibration. Each strict metric requires qualified coverage for the selected source, independently of whether the `metrics` profile is enabled. Python's built-in AST covers function/class lines, parameters and public methods; configurable strict complexity/nesting requires a project binding. A binding declares a qualified budget as `capabilities: ["size/complexity"]` (or another named budget), with its own native thresholds and positive/negative qualification. Scheduled CI-only checks remain visibly deferred in commit mode. The AST-control-v1 metric is an explicit simple control/boolean-branch measure, not a promise to equal every linter's complexity algorithm. Tokens and dependency-boundary violations are factual policy checks; useful abstractions and LSP still need review and actual contract tests.

## Project policy

`pulse-quality.config.json` and `pulse-quality.baseline.json` are tracked files, outside ignored `.pulse`. [Policy schema](../scripts/code-quality/policy.schema.json) describes the format; the loader additionally checks cross-field constraints and known rule overrides.

```json
{
  "schema_version": "1.0",
  "mode": "enforce-new",
  "profiles": ["metrics", "javascript", "frontend"],
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.css"],
  "exclude": [],
  "strictBudgets": [],
  "naming": {"typescript": {"files": "kebab", "symbols": true, "overrides": [{"patterns": ["src/ui/**/*.tsx"], "files": "pascal"}]}},
  "ownership": {
    "required": true,
    "zones": [
      {"id": "ui", "patterns": ["src/ui/**"], "allows": ["ports", "shared"], "io": false},
      {"id": "ports", "patterns": ["src/ports/**"], "allows": ["shared"]},
      {"id": "shared", "patterns": ["src/shared/**"], "allows": [], "io": false},
      {"id": "adapters", "patterns": ["src/adapters/**"], "allows": ["ports", "shared"]}
    ]
  },
  "tokens": {
    "files": ["src/design/tokens.css"],
    "include": ["src/ui/**", "src/design/tokens.css"],
    "properties": ["color", "background-color", "padding", "gap", "font-size", "border-radius"],
    "namePattern": "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    "allowedValues": ["0", "auto", "inherit", "currentColor"],
    "requiredDynamic": false
  },
  "baseline": "pulse-quality.baseline.json"
}
```

Zones use first matching pattern and explicit allowed edges, not folder depth. `io: false` prohibits specified actual browser globals in the native ESLint scope; a local injected port named `fetch` remains valid. `forbidPackages` adds explicit package restrictions. Dynamic/unresolved edges have their own coverage; required unresolved ownership is unavailable. Python/Rust ownership can delegate to a project binding with `capabilities: ["ownership"]` and the `native` profile.

`rules` overrides known rule IDs or documented native-family wildcards to `off`, `info`, `warning` or `error`. A review signal never becomes a definite architectural violation merely by raising its severity. Rule changes alter the policy digest and require a reviewed baseline update. Exclusions require a reason. A new generated-code comment cannot grant an exemption.

## Baseline and comparison

Observe before enforcement and calibrate the warning volume:

```bash
node /path/to/pulse/scripts/pulse-quality.mjs --scope code --repo-root /path/to/project --profile commit --mode observe --toolchain-root /path/to/prepared-tools
```

Create a new baseline explicitly from the accepted historical reference, never silently from current new defects:

```bash
node /path/to/pulse/scripts/pulse-quality.mjs --scope code --repo-root /path/to/project --profile commit --baseline-from ACCEPTED_COMMIT --export-baseline /path/to/project/pulse-quality.baseline.json --toolchain-root /path/to/prepared-tools
```

`--baseline-from empty` represents a new repository's explicit empty starting point. Export refuses an existing destination. Review and stage the result. Normal checks never rewrite it. The initial Pulse baseline is tied to the pre-feature commit and cannot suppress the quality engine's own new violations.

Baseline identities use rule/language/file/symbol/target/metric/kind/severity, not line numbers or an unrelated body hash. Counts prevent a second identical violation from inheriting one waiver; per-occurrence numeric ceilings reveal worsening at constant count, even if another occurrence still has the same higher maximum. Public explicit JS/TS signatures use native AST tokens without source positions, so a body-only/whitespace edit does not renew that contract review. Inferred behavior/type changes are not certified by this syntax-only signal. Exact exceptions require owner, reason and ISO expiry; evaluation date is recorded (UTC by default, or explicit `--evaluation-date YYYY-MM-DD`).

Exit `0` means the declared policy is satisfied, including visible accepted legacy findings; `1` means new blocking findings; `2` means required verification unavailable. Observation success means analysis completed, not clean code. Zero scheduled/applicable code checks are marked observed. Required, optional, not scheduled, not applicable, excluded and unsupported coverage stay distinct. The CLI prints new warnings/review items and a receipt path rather than a global quality score.

## Prepared tools and offline checks

Checks never install tools or initiate model/provider calls. Prepare the locked Node dependencies outside the source with `npm ci --ignore-scripts --no-audit --no-fund` using the [tool manifest](../scripts/code-quality/tools/package.json) and lockfile. Prepare the exact Python packages and Tokei version in the [toolchain declaration](../scripts/code-quality/toolchain.json). This development toolchain is not bundled as `node_modules` or native binaries in Pulse distributions.

Use `--toolchain-root`, `PULSE_QUALITY_TOOLCHAIN`, or an explicitly created per-worktree preparation record `<git-dir>/pulse-quality/toolchain.json` with `{"schema_version":"1.0","root":"/absolute/prepared/tools"}`. The verifier reads this record and never creates it itself. Runtime source must match its own Git index, or an installed distribution manifest; an external project's alternate index cannot substitute for the runtime index.

AST/lexical checks run on the bare captured snapshot. Typechecking, Clippy and other build-bound work belongs to CI or a declared prepared build context. Cargo checks use installed toolchain paths, offline/locked arguments and a private target directory. A captured Rust toolchain override requires an explicitly prepared `RUSTUP_TOOLCHAIN`; missing or ambiguous installed toolchains fail before invocation. No check runs rustup install/restore. Source dependencies and tool executables are separate inputs; workspace sources escaping the captured root cannot qualify.

Native tools/configurations and build scripts remain trusted executable code, not a general security sandbox. The fixed clone audit explicitly selects lexical mode and cannot inherit semantic/model mode from a project `.jscpd.json`. Bindings must preserve the project's own offline and effect constraints. Actual runtime/tool identities, statuses and raw logs are retained. Linux and Node 24 are the verified host surface for this release; broad language extensibility does not imply every SDK/platform is qualified.

## Binding another analyzer

A binding declares ID, language, optional file patterns, phase, executable/argv and result format. It executes in the captured root without a shell. Example for an already prepared native analyzer:

```json
{
  "profiles": ["metrics", "native"],
  "checks": [{
    "id": "project-architecture",
    "language": "go",
    "patterns": ["src/**/*.go"],
    "profile": "ci",
    "required": true,
    "capabilities": ["ownership"],
    "command": ["/path/to/prepared/analyzer", "--format", "sarif"],
    "format": "sarif"
  }]
}
```

Merge that fragment with the required policy fields. A normalized JSON producer returns `{"success":true,"findings":[]}`. Findings require `ruleId`, `path`, `kind` (`violation|metric|review`), `severity` (`error|warning|info`) and `message`; optional stable symbol/target, finite value and 1-based positions improve comparison. SARIF supports the documented source-result subset, fresh successful invocation, source paths in the captured selection and real diagnostics; foreign paths, failed invocations, invalid/empty envelopes and malformed data fail closed. A historical report alone is not a current analyzer run.

Validate each new binding with positive/negative native cases, empty valid output, bad output, missing tool and schedule tests. JSON/SARIF conformance proves the transport contract, not semantic correctness of every rule. No global hook installation, downstream migration or source repair is part of this command.
