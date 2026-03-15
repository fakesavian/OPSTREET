# Codex Repo Instructions

- Do not use `rg` or `rg --files` in this repository.
- Use PowerShell-native commands instead:
  - `Get-ChildItem` for file discovery
  - `Select-String` for text search
  - `Get-Content` for quick file reads
- Prefer setting explicit paths in commands because the Codex shell may not start in the repository root on this machine.
