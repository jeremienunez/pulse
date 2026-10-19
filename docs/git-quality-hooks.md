# Git quality checks — Pulse repository pilot

The project owns one set of executable quality profiles in `scripts/lib/pulse-quality-profile.mjs`. Both the optional pre-commit adapter and CI invoke `scripts/pulse-quality.mjs`.

## Profiles

```bash
node scripts/pulse-quality.mjs --profile commit
node scripts/pulse-quality.mjs --profile ci --json
```

Both profiles check indexed `.env*` paths at every directory depth, with an exact `.env.example` exception, then syntax-check JavaScript files and run static contracts, Markdown link checks and core ICM/onboarding/governance/helper tests. `ci` adds package construction, distribution and evidence suites. The profiles execute their tests without model calls or authenticated coding CLIs. Native App Server and Bubblewrap integration suites remain explicit separate checks.

The environment-file rule is a filename policy. It does not claim to identify every secret. Structural checks and passing tests do not grant human approval of semantics or merge.

## Candidate identity

The verifier captures the active Git index using `git write-tree`, including an index supplied through `GIT_INDEX_FILE`. It reads regular-file blobs directly using `git ls-tree` and `git cat-file`. Git export attributes, text conversion and smudge filters do not rewrite the candidate bytes.

Checks run in a disposable copy with its own Git index, configuration and candidate commit identity. The source object store is a read-only alternate for that temporary repository. This supports existing package tests that require a commit identity, without committing in the source repository. Git context variables from the hook are removed before running checks.

The verifier leaves staged content, unstaged edits and untracked files in place. A working-copy repair does not hide a broken indexed file; an unindexed edit does not contaminate the checked candidate. It checks the source index again before publishing a passing receipt. An index change requires another verification. Runtime verifier edits must be staged before using that new verifier version.

This pilot supports regular tracked files and executable modes. A symlink, submodule, unmerged index, unsupported path or unavailable required tool produces an explicit non-passing result. Ignored external dependencies and the host runtime are not hermetic inputs; this is a reproducible source candidate, not a general execution sandbox.

## Receipts

Every executed profile writes a unique directory under the current worktree's Git directory:

```text
<git-dir>/pulse-quality/<tree>-<run-id>/
  result.json
  0000.log
  ...
```

The receipt records the exact Git tree, profile, each invoked command and arguments, its exit code/status, timestamps and logs. The CLI exits `0` for passed, `1` for a failed check or changed index, and `2` for unavailable verification. Candidate-construction or CLI-usage errors are reported before a receipt can be created. A required missing executable, timeout or empty command list cannot qualify a candidate. Temporary candidate files are removed after completion; receipts remain in Git metadata.

## Explicit installation

Run from a Pulse source checkout:

```bash
node scripts/install-git-hooks.mjs --dry-run
node scripts/install-git-hooks.mjs
```

The installed adapter calls `node scripts/pulse-quality.mjs --profile commit`. The installer is idempotent and does not change global Git configuration. It refuses a foreign `core.hooksPath`, foreign or edited pre-commit bytes, symlinked hook destinations, or existing default Git hooks that would be sidelined. Compose existing hook managers explicitly rather than replacing them.

When several worktrees share repository configuration, the installer refuses to change their common hooks path. If the repository owner has already enabled Git's worktree-specific configuration, it writes only the target worktree's `core.hooksPath`. Enabling that shared repository extension is a separate owner action; this installer does not do it automatically.

This feature is an explicit developer tool for the Pulse source repository. It does not add agent session hooks, change the ICM gates, or install a framework into downstream projects. A future project integration should reuse its own existing quality command and tools through the same contract.

## CI and limits

The workflow calls the `ci` profile on a clean checkout, where the active index represents the checked-out commit. The required check policy for a protected branch is configured separately on GitHub. A local Git hook can be bypassed using `--no-verify`; it does not enforce remote merge policy by itself.

Tests cover real indexed blobs, partial and alternate indexes, binary data, unusual filenames, index changes, unavailable checks and installation preservation. Installer tests exercise real commits using a controlled project entrypoint. The final full-profile check is executed separately from the unit tests, avoiding recursive execution of its own suite.

## Deterministic code policy

A tracked `pulse-quality.config.json` extends the shared entrypoint with the [code quality layer](code-quality.md): code metrics, native conventions, import/owner boundaries, baseline comparison and frontend token contracts. LOC alone warns unless the project opts into a strict budget. Snapshot-pure checks run locally; build-bound checks are explicitly CI-only and require a prepared environment. This adds no provider/model call, automatic tool install, refactor or baseline rewrite to the hook.

The Pulse pilot uses a reviewed baseline from its pre-feature tree. Other repositories explicitly select `--scope code`, own their policy and native bindings, and prepare their own tools. Passing a syntax/import/token policy does not certify SOLID or the usefulness of a class. Receipts and the CLI keep incomplete and advisory coverage visible.
