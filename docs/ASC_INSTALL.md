# AssemblyScript Compiler Install and Pipeline Verification

This guide covers installing the AssemblyScript compiler (`asc`) and verifying the full OPFun deploy pipeline from scaffold to testnet deployment.

## Prerequisites

- **Node.js >= 20** (`node --version`)
- **pnpm** (monorepo package manager) (`pnpm --version`)
- **Git**

## Option A: Global Install

```bash
npm install -g assemblyscript
asc --version  # should print: Version 0.27.x or similar
```

The deployer at `packages/opnet/src/deployer.ts` calls `npx asc --version` to check availability. A global install will be found automatically via `PATH`.

## Option B: Local Dev Dependency (Recommended for CI)

Add AssemblyScript as a dev dependency in the opnet package:

```bash
cd packages/opnet
pnpm add -D assemblyscript
```

This adds to `packages/opnet/package.json`:

```json
{
  "devDependencies": {
    "assemblyscript": "^0.27.0"
  }
}
```

The deployer uses `npx asc` which will find the local binary at `./node_modules/.bin/asc`. No code changes needed.

**For CI pipelines**, the local install is preferred because it pins the exact version and does not depend on the global environment.

## Verifying the Full Pipeline

### Step 1: Create a Test Project

```bash
curl -X POST http://localhost:3001/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"TestToken","ticker":"TEST","totalSupply":1000000,"decimals":8}'
```

Note the returned project `id` for subsequent steps.

### Step 2: Scaffold and Run Checks

This requires an authenticated session (auth cookie):

```bash
curl -X POST "http://localhost:3001/projects/<id>/run-checks" \
  -H "Cookie: opfun_session=<jwt>"
```

The deployer will:
1. Scaffold the AssemblyScript contract source under `packages/opnet/generated/<projectId>/contract/`
2. Generate the deploy script at `packages/opnet/generated/<projectId>/deploy.ts`
3. Attempt to compile via `npx asc` (if installed)
4. Attempt auto-deploy (if `OPNET_MNEMONIC` is set)

### Step 3: Check Project Status

```bash
curl "http://localhost:3001/projects/<id>" \
  -H "Cookie: opfun_session=<jwt>"
```

Expected status progression:

| Status | Meaning |
|--------|---------|
| `PACKAGE_READY` | Scaffold complete, but `asc` is not installed -- WASM not compiled |
| `COMPILED` | WASM compiled successfully, but no wallet configured for deploy |
| `LAUNCHED` | Contract deployed to OP_NET testnet |
| `FAILED` | An error occurred during scaffold, compile, or deploy |

### Step 4: Verify WASM Output

If `asc` is installed, check that the compiled WASM exists:

```bash
ls packages/opnet/generated/<projectId>/contract/build/<TICKER>.wasm
```

If this file exists, compilation succeeded.

## Setting Up `OPNET_MNEMONIC`

The mnemonic is required for auto-deploy to OP_NET testnet. The deployer reads it from `process.env.OPNET_MNEMONIC` -- it never accepts secrets from API callers.

1. **Install OP_WALLET** browser extension (or another OP_NET-compatible wallet).
2. **Create a new testnet wallet** (or import an existing one).
3. **Export the 12/24-word mnemonic** from the wallet settings.
4. **Add to `apps/api/.env`:**

```env
OPNET_MNEMONIC="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
```

5. **Fund the wallet with testnet BTC:**
   - Visit the OP_NET faucet (check https://docs.opnet.org for the current faucet URL)
   - Request approximately 0.05 tBTC for your wallet address
   - Wait for confirmation (approximately 10 minutes on testnet)

6. **Restart the API** so it picks up the new env var:

```bash
cd apps/api && pnpm dev
```

**Security note:** Never commit `.env` files containing mnemonics. The `.gitignore` should already exclude `.env`.

## First Real Testnet Deploy

1. Ensure `OPNET_MNEMONIC` is set in `apps/api/.env` and the wallet is funded.
2. Create and check a project (status must reach at least `COMPILED`).
3. Trigger deployment:

```bash
curl -X POST "http://localhost:3001/projects/<id>/confirm-deploy" \
  -H "Cookie: opfun_session=<jwt>" \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"<your-tb1p-address>"}'
```

4. Poll for status:

```bash
curl "http://localhost:3001/projects/<id>" \
  -H "Cookie: opfun_session=<jwt>"
```

Watch for the status to change to `LAUNCHED`.

5. Check the deploy result:

```bash
cat packages/opnet/generated/<projectId>/deploy-result.json
```

Expected output:

```json
{
  "contractAddress": "tb1p...",
  "deployTx": "abcdef1234..."
}
```

## Viewing on OP_SCAN

Once deployed, find your contract on the OP_NET block explorer:

```
https://scan.opnet.org/contract/<contractAddress>
```

(Confirm the exact OP_SCAN URL from the OP_NET documentation -- the above is the expected pattern.)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `asc: command not found` | Run `npm install -g assemblyscript` or add as local dev dependency (Option B) |
| `npx asc --version` times out | Network issue fetching the package; use a local install instead |
| `OPNET_MNEMONIC not set` | Add to `apps/api/.env` and restart the API server |
| Status stays `PACKAGE_READY` | `asc` is not installed -- install it and re-run checks |
| Status stays `COMPILED` | `OPNET_MNEMONIC` is not set or wallet is not funded |
| Deploy fails: insufficient funds | Fund your wallet via the OP_NET faucet, wait for confirmation |
| Deploy fails: network error | Check OP_NET testnet status; retry after a few minutes |
| `npm install` fails in generated dir | Check Node.js version (>= 20 required) and network connectivity |
| `ts-node` not found during deploy | The generated `package.json` includes `ts-node` as a dependency; run `npm install` in the generated directory |
| WASM file missing after build | Check `asc` output for compilation errors; common cause is missing `@btc-vision/btc-runtime` dependency |

## Pipeline Architecture Reference

The deployer (`packages/opnet/src/deployer.ts`) runs a three-stage pipeline:

```
scaffoldDeployPackage()     tryCompile()           tryAutoDeploy()
        |                       |                       |
  Generates AS source     Runs `npx asc`        Runs `npx ts-node deploy.ts`
  + deploy script         via npm run build      with OPNET_MNEMONIC
  + package.json                |                       |
  + asconfig.json          Produces .wasm         Produces deploy-result.json
        |                       |                       |
   PACKAGE_READY            COMPILED                LAUNCHED
```

Each stage is optional and fails gracefully: if `asc` is not installed, the pipeline stops at `PACKAGE_READY`. If `OPNET_MNEMONIC` is not set, it stops at `COMPILED`. The user can always pick up from where the pipeline left off by installing the missing tooling and re-running.
