---
name: worktree-isolation
description: Use before multi-file or high-risk implementation when the current Git checkout is dirty, shared, or not demonstrably isolated. Detect and reuse harness-managed isolation first, otherwise establish a guarded worktree without disturbing user state.
metadata:
  version: '1.0'
  dependencies: []
---

# Worktree Isolation

Protect unrelated user work before implementation. Inspect first, prefer isolation already owned by the harness, and use manual Git worktrees only as a guarded fallback.

This skill establishes a safe workspace and baseline, then returns control to `pulse:executing`. It does not implement the feature, own cleanup, or replace Pulse gates.

## Non-Negotiable Safety

- Never stash, reset, clean, overwrite, or move unrelated user changes.
- Never treat a missing worktree directory as permission to work in a dirty checkout.
- Never create nested isolation when the current workspace is already isolated.
- Never use a project-local worktree path until Git proves that path ignored.
- Never silently edit or commit `.gitignore` outside the approved work scope.
- Never continue feature implementation after a failing pre-change baseline.
- If isolation fails, stop and report the exact blocker. Do not fall back silently to dirty work.

## 1. Inspect Without Mutation

Read repository instructions first. Then capture the boundary and state:

```bash
git rev-parse --show-toplevel
git rev-parse --path-format=absolute --git-dir
git rev-parse --path-format=absolute --git-common-dir
git rev-parse --show-superproject-working-tree
git branch --show-current
git status --short
git worktree list --porcelain
```

Also inspect the active harness/tool surface for an explicit isolation primitive or marker. Do not invent a native capability that is not visible.

Classify the result:

| Observation | Decision |
|---|---|
| Harness marks the current path as its isolated workspace | Reuse it; the harness owns path, branch, and cleanup semantics. |
| Git directory differs from common directory and no superproject is reported | Reuse the linked worktree. |
| HEAD is detached inside an externally managed isolated workspace | Reuse it and report detached ownership; do not seize branch ownership. |
| A superproject path is reported | This is a submodule boundary, not proof of linked-worktree isolation. Resolve the task's correct repository boundary first. |
| Normal checkout, dirty/shared, no isolation marker | Establish isolation before implementation. |

When a submodule is in scope, preserve and report both submodule and superproject state. Create or reuse isolation only at the repository boundary that owns the requested files.

## 2. Prefer a Visible Native Isolation Primitive

If the harness exposes a native worktree/isolation action, use it. Let the harness choose the path and manage cleanup. Do not also call `git worktree add`.

After entry, repeat the non-mutating inspection and confirm the resulting workspace is distinct or explicitly harness-managed. Then continue to setup and baseline.

If native isolation fails, report the failure. Do not work in the dirty checkout as a fallback.

## 3. Guard the Manual Git Fallback

Use manual Git only when no native primitive is visible and workspace isolation is already authorized by the implementation request or user.

### Choose an explicit location

Apply this order:

1. explicit user or repository instruction;
2. an existing project-local `.worktrees/` or `worktrees/` convention, but only if ignored;
3. an explicit external sibling location outside the repository.

For a project-local candidate, prove ignore behavior before creation:

```bash
git check-ignore -q .worktrees/
git check-ignore -q worktrees/
```

Use only the directory whose check succeeds. If neither succeeds, do not create either directory. Choose an explicit external location or request a separately scoped approval to change ignore rules.

Never substitute “I will avoid staging it” for ignore verification.

### Validate branch and path

Choose task-specific names and resolve the full target path before mutation. Confirm:

- the target path does not already contain unrelated data;
- the branch name is not already owned by another worktree;
- `git worktree list --porcelain` shows no collision;
- current user changes remain untouched.

Then create the isolated branch/worktree:

```bash
git worktree add "<full-target-path>" -b "<task-branch>"
```

Enter the new path and repeat repository-root, branch, status, and worktree inspection. On collision, permission denial, sandbox denial, or ambiguous ownership, stop and report. Do not switch to working in place.

## 4. Run Repository-Declared Setup

Inside the isolated workspace:

1. re-read the applicable repository instructions;
2. use the documented package manager and lockfile mode;
3. install only project-declared dependencies;
4. do not upgrade dependencies or regenerate lockfiles unless that is approved work;
5. record the exact setup command and result.

If no setup is declared or needed, record that instead of inventing one.

## 5. Establish the Pre-Change Baseline

Run the repository's prescribed lowest-sufficient test/build/lint command before feature edits. Record the command, exit status, and concise result.

If it passes, report:

```text
Isolation: <harness-managed | linked worktree | manual worktree>
Path: <full path>
Branch state: <branch | detached/external>
User state: preserved
Setup: <command/result | not required>
Baseline: <command/result>
Ready for: <approved bead/work item>
```

If it fails:

1. stop before feature implementation;
2. preserve the exact failure output;
3. report that the baseline predates the feature change;
4. request or route a separately tracked investigation.

Do not repair the baseline inside the feature bead or relabel it as an expected feature failure.

## Stop Conditions

Stop and surface the boundary when:

- the task's repository boundary is ambiguous;
- user/repository path preferences conflict;
- a project-local path is not ignored;
- native or manual isolation is denied;
- branch/path ownership collides;
- setup would change undeclared dependencies or lockfiles;
- the pre-change baseline fails.

In every stop condition, unrelated user state stays untouched.

## Provenance

Adapted from Superpowers 5.1.3 `using-git-worktrees`. Pulse retains detect-first, native-first, submodule, ignore, setup, and baseline safeguards while removing product-specific global paths, unauthorized ignore commits, and dirty-checkout fallback behavior.
