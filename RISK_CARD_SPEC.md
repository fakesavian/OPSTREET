# Risk Card Spec (MVP)

**Purpose:** Make risk transparent. No “trust me bro.”

## Data shape (JSON)
Store as `Project.riskCardJson` and render on the project page.

### Required fields
#### 1) Permissions / Admin Controls
- `hasAdminKey` (bool)
- `canMint` (bool)
- `canPause` (bool)
- `canUpgrade` (bool)
- `timelockSeconds` (number | null)
- `owner` (string | null)

#### 2) Token Economics
- `maxSupply` (string/number)
- `decimals` (number)
- `transferRestrictions` (string | null)
- `initialDistributionNotes` (string)

#### 3) Release Integrity
- `buildHash` (string | null) — SHA-256 of generated contract artifacts
- `artifactPaths` (string[])
- `deployedAddress` (string | null)
- `deployTx` (string | null)
- `auditSummary` (object) — from OpnetAudit/checks

#### 4) Risk Score
- `riskScore` (0–100)
- `riskLevel` (LOW | MEDIUM | HIGH | CRITICAL)
- `reasons` (string[]) — human-readable “why”

## Scoring rubric (simple MVP)
Start at 0 and add points:
- +40 if `canMint`
- +25 if `hasAdminKey`
- +25 if `canUpgrade`
- +15 if `canPause`
- +15 if timelock missing AND any privileged control is true
- +10 if buildHash missing
- +10 if audit has high severity findings
Cap at 100.

**Risk level:**
- 0–19 LOW
- 20–39 MEDIUM
- 40–69 HIGH
- 70–100 CRITICAL
