# Worktrees (Multi-Agent Workflow)

Goal: parallel work without agents overwriting each other.

## Create worktrees
From repo root:

```bash
git worktree add ../opfun-frontend -b feat/frontend
git worktree add ../opfun-backend -b feat/backend
git worktree add ../opfun-security -b feat/security
git worktree add ../opfun-watchtower -b feat/watchtower
git worktree add ../opfun-debug -b chore/debug
```

Each agent works in its own folder.

## Rules
- One file has one owner at a time.
- Keep changes small; commit often.
- Merge via PR or `git merge` back into main when checks pass.

## Remove a worktree
```bash
git worktree remove ../opfun-frontend
git branch -D feat/frontend
```
