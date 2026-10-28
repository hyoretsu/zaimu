---
name: task-worktree
description: "Local-session workflow for implementing a task in an isolated git worktree and integrating the commits back into the original branch without pushing. Use when starting any implementation task on the user's machine. Skip in cloud/remote sessions, which work directly on the branch they were given."
---

# Task worktree

Local sessions only. Cloud/remote sessions already run in an isolated, ephemeral checkout on a designated branch: skip this skill there.

## Start

1. Record the original branch: `git branch --show-current`.
2. Preserve unrelated staged and working changes; never include unrelated staged files in your commits.
3. Create a worktree outside the repository on persistent disk, never under `/tmp`, `/var/tmp` or another tmpfs (dependencies and build artifacts need real disk):

   ```
   mkdir -p "$HOME/.local/share/worktrees/<repository>"
   git worktree add -b <branch> "$HOME/.local/share/worktrees/<repository>/<task>" HEAD
   ```

   Use a unique `<task>` directory. Existing worktrees may be in use: do not move or remove them.

## Work

Commit coherent increments in the worktree following the commit rules in `AGENTS.md` (explicit paths, hooks never bypassed). Wait and retry on temporary Git locks; never remove a lock owned by an active process.

## Integrate (mandatory before completion)

Never end with completed changes left only on the task branch. Cherry-pick or merge the completed commits into the original branch without pushing.

- Original branch busy (another cherry-pick/merge/rebase, lock, concurrent task): keep the worktree, wait and retry until integration succeeds. Never abort or alter another task's operation.
- Resolve conflicts belonging to this task, rerun applicable checks, and verify all intended changes reached the original branch. For cherry-picked or squashed changes, verify equivalent content, not just ancestry.
- Only an explicit user instruction to stop or leave changes unintegrated overrides this.

## Clean up

After integration, verify the worktree has no staged, unstaged or untracked work and is not used by another process, then `git worktree remove <path>`. Never use `--force` or delete the directory directly. If the directory was already deleted, inspect `git worktree prune --dry-run` first and never prune entries of active or temporarily unavailable worktrees. Confirm the path is gone from `git worktree list`. Branch deletion is separate and must never discard unintegrated commits. If cleanup is blocked, preserve the worktree and report its path and the reason. Do not remove other tasks' worktrees.
