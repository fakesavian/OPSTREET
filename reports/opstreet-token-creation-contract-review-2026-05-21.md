# OPSTREET Token Creation Contract Review — 2026-05-21

## Scope
Reviewed and hardened the OP_NET token creation / bonding-curve generation path for pump.fun-style launch flow: generated OP20 token, generated bonding curve, dependency/toolchain constraints, Windows AssemblyScript compiler invocation, and focused template tests.

## Changes Made
- Pinned generated token and bonding-curve package dependencies to a compile-safe BTC Vision/Noble graph:
  - `@btc-vision/assemblyscript`: `0.29.2`
  - `@btc-vision/opnet-transform`: `1.2.0`
  - `@assemblyscript/loader`: `0.28.9`
  - overrides: `opnet@1.7.16`, `@btc-vision/transaction@1.7.19`, `@btc-vision/bitcoin@6.4.11`, `@noble/curves@1.9.7`, `@noble/hashes@1.8.0`
- Removed stale `abort=index/abort` AS config alias; generated entry already exports the required abort handler.
- Fixed Windows generated-contract compiler invocation by returning an absolute local `asc.cmd` path.
- Fixed generated OP20 template so `Address` is imported when full supply is minted to the bonding curve contract.
- Fixed bonding-curve template against BTC runtime 1.10 APIs:
  - `StoredAddress(pointer)` constructor usage.
  - `StoredU256(pointer, subPointer)` with empty subpointer.
  - `CallResult.success` + `CallResult.data.read*()` usage.
  - concrete `BondingCurveEvent extends NetEvent` wrapper instead of instantiating abstract `NetEvent`.
- Ensured `createPool(address,address)` fallback selector is deterministic (`0xe3433615`) instead of silently baking `0x00000000`.
- Added focused template regression tests covering the above failure modes.

## Verification
- `corepack.cmd pnpm --filter @opfun/opnet build && corepack.cmd pnpm --filter @opfun/opnet test`
  - PASS: 17/17 tests.
- `corepack.cmd pnpm --filter @opfun/opnet typecheck && corepack.cmd pnpm --filter @opfun/opnet lint`
  - PASS.
- Focused generated launch artifact compile verifier:
  - PASS: token WASM compiled.
  - PASS: bonding-curve WASM compiled.
  - Result status: `COMPILED`.

## Files Changed
- `packages/opnet/src/deployer.ts`
- `packages/opnet/src/templates/contract-entry.ts`
- `packages/opnet/src/templates/bonding-curve-entry.ts`
- `packages/opnet/src/templates/bonding-curve.ts`
- `packages/opnet/src/templates/op20-fixed.ts`
- `packages/opnet/test/contract-template.test.mjs`

## Known Repo State / Safety
- Did not commit or push.
- Temporary verifier files were removed after verification.
- Pre-existing unrelated dirty files remain untouched under `apps/web/...` and `tools/...`.

## Remaining Risk
- This confirms local generation and AssemblyScript compilation. Live OP_NET deployment still requires funded testnet wallet, mnemonic, RPC access, and actual network deployment test.
- Pump.fun-style lifecycle is now compile-ready, but economic parameters and MotoSwap factory behavior should still be validated on OP_NET testnet before mainnet.
