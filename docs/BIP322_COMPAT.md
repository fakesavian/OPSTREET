# BIP-322 Browser Wallet Compatibility Matrix

## Overview

OPFun uses **BIP-322 "simple" signatures** to authenticate Bitcoin wallet addresses. This scheme proves ownership of a Bitcoin address without requiring an on-chain transaction — the wallet signs an arbitrary UTF-8 message, and the server verifies the signature against the claimed address.

The `POST /auth/verify` endpoint calls `bip322-js` `Verifier.verifySignature(address, message, signature)` to validate login attempts. Because wallet implementations vary in how they produce BIP-322 signatures, this document tracks which wallets are compatible and what encoding quirks to expect.

## Compatibility Matrix

| Wallet | Taproot (tb1p / bc1p) | Native SegWit (bc1q / tb1q) | Method | Encoding | Notes |
|--------|----------------------|----------------------------|--------|----------|-------|
| **Unisat** | Supported | Supported | `window.unisat.signMessage(message, "bip322-simple")` | Base64 | Requires version >= 1.2.0; older versions may return ECDSA for P2WPKH |
| **OKX Wallet** | Supported | Supported | `window.okxwallet.bitcoin.signMessage(message, { from: address })` | Base64 | `from` param must match the connected address exactly |
| **Xverse** | Supported | Limited | `request("signMessage", { message, address })` | Base64 | Uses Sats Connect / Bitcoin Connect standard |

### Wallet-Specific Details

#### Unisat Wallet

- **API:** `window.unisat.signMessage(message, "bip322-simple")`
- **Taproot (tb1p/bc1p):** Full BIP-322 simple support.
- **Native SegWit (bc1q/tb1q):** Supported, but versions below 1.2.0 may silently fall back to ECDSA signatures for P2WPKH addresses, which `bip322-js` will reject.
- **Encoding:** Returns a base64-encoded signature string.
- **Version check:** `await window.unisat.getVersion()` — verify `>= 1.2.0`.

#### OKX Wallet

- **API:** `window.okxwallet.bitcoin.signMessage(message, { from: address })`
- **Taproot (tb1p/bc1p):** Full BIP-322 simple support.
- **Native SegWit (bc1q/tb1q):** Supported.
- **Encoding:** Returns a base64-encoded signature string.
- **Gotcha:** The `from` parameter must match the currently connected address exactly (case-sensitive for bech32). If mismatched, OKX returns an opaque error.

#### Xverse Wallet

- **API:** `request("signMessage", { message, address })` (Sats Connect standard)
- **Taproot (tb1p/bc1p):** Supported.
- **Native SegWit (bc1q/tb1q):** Limited — some Xverse versions do not produce valid BIP-322 for P2WPKH; test before relying on this.
- **Encoding:** Base64.
- **Note:** Xverse uses the Bitcoin Connect / Sats Connect protocol. The `request()` function comes from `@sats-connect/core` or the Xverse provider.

## Message Format

OPFun signs a nonce-based login message:

```
OPFun login nonce: <nonce>
```

Rules:
- The message is a plain **UTF-8 string**. Do NOT hex-encode it before passing to `signMessage`.
- The wallet handles UTF-8 encoding internally.
- `bip322-js` `Verifier.verifySignature()` expects the **raw UTF-8 message string** and the **base64 signature**.
- The nonce is a server-generated random string fetched from `GET /auth/nonce`.

## Known Failure Modes

| Error | Cause | User-Facing Message |
|-------|-------|---------------------|
| `User rejected request` | User clicked cancel in the wallet popup | "Signature cancelled -- please try again and approve in your wallet." |
| `Invalid signature` | Wrong address type, encoding mismatch, or wallet returned ECDSA instead of BIP-322 | "Signature verification failed. Ensure your wallet supports BIP-322 simple signatures." |
| `window.unisat is undefined` | Unisat extension not installed | "Unisat wallet not detected. Please install the Unisat extension." |
| `window.okxwallet is undefined` | OKX extension not installed | "OKX wallet not detected. Please install the OKX wallet extension." |
| Network mismatch | Wallet set to mainnet but app expects testnet (or vice versa) | "Please switch your wallet to Bitcoin Testnet4." |
| Timeout / no response | Wallet popup blocked by browser or extension crashed | "Wallet did not respond. Check that popups are allowed and try again." |

## `bip322-js` API Reference

```ts
import { Verifier } from "bip322-js";

// Verify a BIP-322 simple signature
const isValid: boolean = Verifier.verifySignature(
  address,   // string: the wallet address (bc1p..., bc1q..., tb1p..., tb1q...)
  message,   // string: the raw UTF-8 message that was signed
  signature  // string: the base64 signature returned by the wallet
);
// Returns: boolean
```

- Supports both mainnet (`bc1p`, `bc1q`) and testnet (`tb1p`, `tb1q`) address prefixes.
- Throws on malformed input (non-bech32 address, empty signature, etc.).
- Does NOT support legacy (`1...`) or nested SegWit (`3...`) addresses.

## UX Recommendations

1. **Detect the connected wallet** and show wallet-specific instructions (e.g., "Click Approve in your Unisat popup").
2. **On failure:** surface the exact error from the table above plus a "Try again" button. Do not silently swallow errors.
3. **On success:** immediately redirect to the authenticated view. Do not show a "success" screen that requires another click.
4. **Supported wallets tooltip:** add a small info icon next to the "Connect Wallet" button listing Unisat, OKX, and Xverse as supported wallets.
5. **Version warning:** if Unisat is detected and version < 1.2.0, show a banner: "Please update your Unisat wallet to version 1.2.0 or later for reliable login."
6. **Testnet reminder:** if the app is running in testnet mode, show a persistent badge so users know to switch their wallet network.
