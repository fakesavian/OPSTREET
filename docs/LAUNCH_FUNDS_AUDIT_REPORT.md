# Launch Funds Audit Report

**Date:** 2026-03-09
**Status:** Diagnostic complete — no OPFun bug, wallet-side issue confirmed

---

## 1. Reported Errors

Two distinct errors observed during token creation attempts:

| Error message | Source |
|---|---|
| "Insufficient funds: need 650555 sats but only have 238625 sats" | OP_WALLET extension (not OPFun code) |
| "Invalid recipient address. Are you on the right network?" | OP_WALLET extension (screenshot: `tokencreationerror.PNG`) |

**Neither string exists in the OPFun codebase.** Both originate from the OP_WALLET browser extension during `sendBitcoin()` execution.

---

## 2. Code Path Trace

### Token creation flow

1. User fills form in `apps/web/src/app/create/page.tsx`
2. On submit (`page.tsx:78-131`), sats amount is computed:
   ```
   amountSats = Math.round(liquidityUnits * LIQUIDITY_TOKEN_TO_SATS[token])
   ```
   Constants (`page.tsx:16-20`):
   - TBTC = 100,000,000 sats/unit
   - MOTO = 65,000 sats/unit
   - PILL = 70,000 sats/unit
3. Calls `submitOpnetLiquidityFundingWithWallet()` (`wallet.ts`) with `{ toAddress, amountSats, memo }`
4. `submitOpnetLiquidityFundingWithWallet` builds a `sendOpts` object (`wallet.ts:733-740`):
   ```ts
   { to: addr, amount: payload.amountSats, feeRate: 5, memo: "...", signer: null, mldsaSigner: null }
   ```
5. Tries multiple call patterns against OP_WALLET targets (`wallet.ts:742-773`):
   - Direct `sendBitcoin(sendOpts)` calls
   - Request-style `request({ method: "sendBitcoin", params: sendOpts })` calls
6. OP_WALLET internally validates UTXOs and address — errors thrown here

### Where errors surface

- Errors caught at `wallet.ts:786-790`, passed through `normalizeWalletError()` (`wallet.ts:485-503`)
- Fatal errors re-thrown immediately (`wallet.ts:789`)
- Non-fatal errors collected; first user-actionable error thrown at `wallet.ts:794-798`
- Caught in `page.tsx:121-127`, displayed to user

---

## 3. The "Insufficient funds" Math

User reported: "need 650,555 sats but only have 238,625 sats"

- 10 MOTO × 65,000 = 650,000 sats + ~555 sats wallet fee estimate = **650,555 sats** ✓
- 238,625 sats = user's **Taproot (p2tr) confirmed balance** in OP_WALLET
- Wallet UI may show total across all address types (Legacy, SegWit, Taproot), but `sendBitcoin` only spends from the active Taproot address

The screenshot shows a different attempt with **1000 MOTO** (= 65M sats), which hit the address error instead.

---

## 4. Root Causes

### 4a. No pre-flight balance check in OPFun

- `apps/web/src/lib/wallet.ts` — no `getBalance()`, `getUTXOs()`, or any spendable balance query
- `apps/web/src/app/create/page.tsx` — zero balance validation before calling `sendBitcoin`
- The app blindly sends the funding request to the wallet, relying entirely on wallet-side validation
- Result: users see raw wallet error messages instead of a friendly pre-check

### 4b. normalizeWalletError gap

`normalizeWalletError()` (`wallet.ts:485-503`) handles these patterns:
- ✅ Duplicate wallet / MLDSA conflict
- ✅ User rejected / denied / cancelled
- ✅ Not connected / unauthorized
- ✅ Invalid address / recipient
- ✅ Internal `Cannot use 'in' operator`
- ❌ **"Insufficient funds" — NOT matched**

Because it's not matched, it's also not matched by `isFatalWalletError()` (`wallet.ts:506-510`), so the code continues trying other call methods. All fail. The raw wallet message eventually surfaces.

### 4c. UTXO / address type mismatch (wallet-side)

- OP_WALLET shows aggregate balance across all address types in its UI
- `sendBitcoin` only selects UTXOs from the active Taproot (p2tr) address
- Users see a higher balance in the wallet popup than what's actually spendable for the transaction
- This is an OP_WALLET UX issue, not an OPFun bug

### 4d. Address validation (wallet-side)

- "Invalid recipient address" occurs when `LIQUIDITY_VAULT_ADDRESS` doesn't match the wallet's active network
- OPFun adds helpful context at `page.tsx:123-124`: appends "Open OP_WALLET and verify you are on OP_NET Testnet (Signet)"
- Root cause: env var `NEXT_PUBLIC_LIQUIDITY_VAULT_ADDRESS` may be set to a mainnet/different-network address

---

## 5. Recommendations

### P0 — Add "Insufficient funds" to normalizeWalletError

```ts
// wallet.ts normalizeWalletError(), add before the return:
if (/insufficient.*funds?|not enough.*balance/i.test(msg)) {
  return "Insufficient funds in your Taproot address. OP_WALLET only spends confirmed Taproot UTXOs — check that your tBTC is on your Taproot (p2tr) address, not Legacy or SegWit.";
}
```

Also add the pattern to `isFatalWalletError()` so it stops retrying immediately.

### P1 — Pre-flight balance estimate in the Review step

Before calling `sendBitcoin`, query the wallet for available balance (if API exists) or at minimum display the required sats amount prominently:

```
Required: 650,555 sats (10 MOTO × 65,000 + ~555 fee)
```

This sets user expectations before the wallet popup appears.

### P2 — Validate LIQUIDITY_VAULT_ADDRESS at build/startup

Add a startup check that `NEXT_PUBLIC_LIQUIDITY_VAULT_ADDRESS` is set and looks like a valid Taproot address for the configured network. Fail fast with a clear error instead of letting users hit "Invalid recipient address" at submit time.

### P3 — Document UTXO address type caveat

Add a help tooltip or FAQ entry on the create page explaining that OP_WALLET's displayed balance may include non-Taproot UTXOs that cannot be used for OPNet transactions. Advise users to consolidate funds to their Taproot address.

---

## 6. Files Referenced

| File | Lines | Purpose |
|---|---|---|
| `apps/web/src/app/create/page.tsx` | 16-20, 78-131 | Token creation form, sats calculation, submit handler |
| `apps/web/src/lib/wallet.ts` | 485-503 | `normalizeWalletError()` — error pattern matching |
| `apps/web/src/lib/wallet.ts` | 506-510 | `isFatalWalletError()` — retry-stop check |
| `apps/web/src/lib/wallet.ts` | 720-798 | `submitOpnetLiquidityFundingWithWallet()` — sendBitcoin flow |

---

## 7. Conclusion

**No bug in OPFun code.** Both errors originate from the OP_WALLET extension. However, OPFun should:
1. Normalize the "Insufficient funds" error message (missing pattern in `normalizeWalletError`)
2. Show required sats before wallet interaction
3. Validate the vault address at startup

The user's immediate fix: ensure tBTC is on their **Taproot address** (not Legacy/SegWit) and that OP_WALLET is set to **OP_NET Testnet (Signet)**.
