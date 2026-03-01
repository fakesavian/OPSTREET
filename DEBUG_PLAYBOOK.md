# Systematic Debugging Playbook

If something breaks, follow this exact sequence.

## 1) Reproduce
- What command/action triggers it?
- Copy the exact error output.
- Confirm it fails twice the same way.

## 2) Isolate
- Identify the smallest scope:
  - web only?
  - api only?
  - db migration?
  - watcher loop?
- Disable unrelated services.

## 3) Hypothesis
Write 1–3 plausible root causes (not 20).
Example: “Prisma client not generated”, “env var missing”, “port collision”.

## 4) Test
For each hypothesis:
- run a targeted command
- change one thing
- re-run the repro step

## 5) Fix
- Apply minimal fix.
- Add guardrails (better error message, fallback, docs).

## 6) Regression check
Run:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (or smoke)
- manual flow: create → view project

## Escalation rule
If the SAME error occurs 3 times after attempts, escalate to the Debug Agent with:
- command + output
- files touched
- what you tried
