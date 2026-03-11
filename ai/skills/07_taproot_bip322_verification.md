# Skill 07 — Taproot BIP‑322 Verification (bip322‑js)

## Purpose
Correctly verify signatures for OP_NET testnet Taproot addresses (`tb1p…`) using **BIP‑322 Schnorr**, not legacy `bitcoinjs-message`.

## Trigger
- Taproot signature verification fails
- Using `bitcoinjs-message` for taproot (will fail)
- Need server-side verification for `signMessage(message, "bip322-simple")`

## Inputs
- Address (tb1p…)
- Message format to sign (must be consistent)
- Signature from wallet

## Outputs
- Server verifies signature with `bip322-js`
- Nonce replay prevented
- Audit log for sign-in events

## Steps
1) **Install server dependency**
   - In `apps/api`:
     - `pnpm --filter api add bip322-js`
   - Ensure it is NOT installed/used in web client bundle.

2) **Standardize message format**
   - Include:
     - game name
     - address
     - nonce
   - Example:
     - `OPFun Sign-In\naddress:<addr>\nnonce:<nonce>`

3) **Verify**
   - Use bip322-js verify function (per library API).
   - Verify against the exact message string the client signed.

4) **Security**
   - Nonce TTL (e.g., 5 minutes)
   - Invalidate nonce after successful verify
   - Rate-limit verify endpoint

5) **Diagnostics**
   - Log failed verifications with reason (no PII beyond address)
   - Return generic error to client.

## Done criteria
- `tb1p…` addresses successfully authenticate with Unisat/OKX bip322-simple.
- Replays fail (nonce already used).

## Common failure modes
- Message mismatch between client/server (whitespace!)
- Using wrong network prefix
- Storing nonce incorrectly

## Rollback plan
- Keep auth optional in local dev but keep BIP-322 verify code ready.
