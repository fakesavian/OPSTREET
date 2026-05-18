import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

const runtime = await import("../dist/runtime-provider.js");

test("OP_NET runtime defaults to docs-aligned regtest config", () => {
  assert.equal(runtime.getOpnetNetwork(), "regtest");
  assert.equal(runtime.getOpnetRpcUrl(), "https://regtest.opnet.org");
});

test("OP_NET runtime exposes canonical network config for diagnostics", () => {
  assert.equal(typeof runtime.getOpnetNetworkConfig, "function");

  const config = runtime.getOpnetNetworkConfig();
  assert.deepEqual(config, {
    network: "regtest",
    rpcUrl: "https://regtest.opnet.org",
    timeoutMs: 15_000,
    bitcoinNetworkKey: "regtest",
  });
});

function readConfigWithEnv(env) {
  const script = `import('./packages/opnet/dist/runtime-provider.js').then((runtime) => console.log(JSON.stringify(runtime.getOpnetNetworkConfig())));`;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: new URL("../../..", import.meta.url),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test("OP_NET runtime infers legacy-testnet network when a legacy testnet RPC URL is explicitly configured", () => {
  assert.deepEqual(readConfigWithEnv({ OPNET_NETWORK: "", OPNET_RPC_URL: "https://testnet.opnet.org" }), {
    network: "legacy-testnet",
    rpcUrl: "https://testnet.opnet.org",
    timeoutMs: 15_000,
    bitcoinNetworkKey: "testnet",
  });
});

test("OP_NET_NETWORK overrides RPC URL inference when explicitly set", () => {
  assert.deepEqual(readConfigWithEnv({ OPNET_NETWORK: "regtest", OPNET_RPC_URL: "https://testnet.opnet.org" }), {
    network: "regtest",
    rpcUrl: "https://testnet.opnet.org",
    timeoutMs: 15_000,
    bitcoinNetworkKey: "regtest",
  });
});

test("OP_NET runtime exposes JSON-RPC endpoint derived from canonical RPC URL", () => {
  assert.equal(typeof runtime.getOpnetJsonRpcUrl, "function");
  assert.equal(runtime.getOpnetJsonRpcUrl(), "https://regtest.opnet.org/api/v1/json-rpc");

  assert.equal(
    readJsonRpcUrlWithEnv({ OPNET_NETWORK: "legacy-testnet", OPNET_RPC_URL: "https://testnet.opnet.org" }),
    "https://testnet.opnet.org/api/v1/json-rpc",
  );
  assert.equal(
    readJsonRpcUrlWithEnv({ OPNET_NETWORK: "regtest", OPNET_RPC_URL: "https://regtest.opnet.org/api/v1/json-rpc" }),
    "https://regtest.opnet.org/api/v1/json-rpc",
  );
});

test("OP_NET mainnet uses the @btc-vision bitcoin network object key", () => {
  assert.deepEqual(readConfigWithEnv({ OPNET_NETWORK: "mainnet", OPNET_RPC_URL: "" }), {
    network: "mainnet",
    rpcUrl: "https://mainnet.opnet.org",
    timeoutMs: 15_000,
    bitcoinNetworkKey: "bitcoin",
  });
});

function readJsonRpcUrlWithEnv(env) {
  const script = `import('./packages/opnet/dist/runtime-provider.js').then((runtime) => console.log(runtime.getOpnetJsonRpcUrl()));`;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: new URL("../../..", import.meta.url),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("OP_NET wallet network config maps canonical networks to wallet names, HRPs, and BTC Vision keys", async () => {
  const network = await import("../dist/network-config.js");

  assert.deepEqual(network.getOpnetWalletNetworkConfig("regtest"), {
    network: "regtest",
    rpcUrl: "https://regtest.opnet.org",
    bitcoinNetworkKey: "regtest",
    walletNetwork: "regtest",
    opnetAddressHrp: "opr",
    bitcoinAddressHrp: "bcrt",
  });

  assert.deepEqual(network.getOpnetWalletNetworkConfig("legacy-testnet"), {
    network: "legacy-testnet",
    rpcUrl: "https://testnet.opnet.org",
    bitcoinNetworkKey: "testnet",
    walletNetwork: "testnet",
    opnetAddressHrp: "opt",
    bitcoinAddressHrp: "tb",
  });

  assert.deepEqual(network.getOpnetWalletNetworkConfig("mainnet"), {
    network: "mainnet",
    rpcUrl: "https://mainnet.opnet.org",
    bitcoinNetworkKey: "bitcoin",
    walletNetwork: "mainnet",
    opnetAddressHrp: "op",
    bitcoinAddressHrp: "bc",
  });
});

test("OP_NET wallet compatibility rejects legacy testnet when regtest is configured", async () => {
  const network = await import("../dist/network-config.js");

  assert.equal(network.isWalletNetworkCompatible("regtest", "regtest"), true);
  assert.equal(network.isWalletNetworkCompatible({ network: "regtest" }, "regtest"), true);
  assert.equal(network.isWalletNetworkCompatible("testnet", "regtest"), false);
  assert.equal(network.isWalletNetworkCompatible("testnet", "legacy-testnet"), true);
  assert.equal(network.isWalletNetworkCompatible("bitcoin", "mainnet"), true);
});

