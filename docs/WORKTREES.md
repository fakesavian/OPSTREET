# Git Worktrees — Isolation Guide

Git worktrees let you check out multiple branches simultaneously in separate
directories. Use them when you need to:

- Test a risky refactor without touching your current working tree.
- Run the old main branch + new feature branch side-by-side.
- Reproduce a bug on a specific commit while keeping your active work intact.

---

## Quick Start

```bash
# Create a worktree for a new feature branch
git worktree add ../opfun-feature-xyz -b feature/xyz

# Or check out an existing branch
git worktree add ../opfun-hotfix-abc hotfix/abc

# List active worktrees
git worktree list

# Remove a worktree when done (cleans up the directory link)
git worktree remove ../opfun-feature-xyz
```

Each worktree shares the `.git` directory (history, refs, stash) but has its
own working tree and index — edits in one worktree do **not** affect others.

---

## Monorepo Notes

Because this repo uses pnpm workspaces, each worktree needs its own install:

```bash
cd ../opfun-feature-xyz
pnpm install
pnpm db:migrate   # SQLite is per-worktree if you use a local .env DATABASE_URL
pnpm dev
```

Tip: Use a different port per worktree to avoid conflicts:

```bash
# .env.local in the worktree
PORT=3002
```

---

## Claude Code Integration

When using Claude Code in a worktree session:

1. Open Claude Code from the worktree directory:
   ```bash
   cd ../opfun-feature-xyz
   claude
   ```
2. Claude's context is scoped to that directory — no cross-contamination.
3. Commits in the worktree land on the worktree's branch only.

---

## Cleanup Checklist

- [ ] `git worktree remove <path>` once the branch is merged.
- [ ] `git branch -d <branch>` if the branch is no longer needed.
- [ ] `git worktree prune` to remove stale entries after manual directory deletion.
