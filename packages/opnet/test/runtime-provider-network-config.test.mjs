import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

const runtime = await import("../dist/runtime-provider.js");

test("OP_NET runtime defaults to OP_NET testnet config, not regtest/Wrench", () => {
  assert.equal(runtime.getOpnetNetwork(), "testnet");
  assert.equal(runtime.getOpnetRpcUrl(), "https://testnet.opnet.org");
});

test("OP_NET runtime exposes canonical network config for diagnostics", () => {
  assert.equal(typeof runtime.getOpnetNetworkConfig, "function");

  const config = runtime.getOpnetNetworkConfig();
  assert.deepEqual(config, {
    network: "testnet",
    rpcUrl: "https://testnet.opnet.org",
    timeoutMs: 15_000,
    bitcoinNetworkKey: "testnet",
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

test("OP_NET runtime infers OP_NET testnet network when a testnet RPC URL is explicitly configured", () => {
  assert.deepEqual(readConfigWithEnv({ OPNET_NETWORK: "", OPNET_RPC_URL: "https://testnet.opnet.org" }), {
    network: "testnet",
    rpcUrl: "https://testnet.opnet.org",
    timeoutMs: 15_000,
    bitcoinNetworkKey: "testnet",
  });
});

test("legacy-testnet remains accepted as a backwards-compatible alias for OP_NET testnet", () => {
  assert.deepEqual(readConfigWithEnv({ OPNET_NETWORK: "legacy-testnet", OPNET_RPC_URL: "https://testnet.opnet.org" }), {
    network: "testnet",
    rpcUrl: "https://testnet.opnet.org",
    timeoutMs: 15_000,
    bitcoinNetworkKey: "testnet",
  });
});

test("OP_NET_NETWORK rejects regtest so the site never switches OP_WALLET to Wrench", () => {
  const script = `import('./packages/opnet/dist/runtime-provider.js').then((runtime) => console.log(JSON.stringify(runtime.getOpnetNetworkConfig())));`;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: new URL("../../..", import.meta.url),
    env: { ...process.env, OPNET_NETWORK: "regtest", OPNET_RPC_URL: "https://testnet.opnet.org" },
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported OPNET_NETWORK/);
});

test("OP_NET runtime exposes JSON-RPC endpoint derived from canonical RPC URL", () => {
  assert.equal(typeof runtime.getOpnetJsonRpcUrl, "function");
  assert.equal(runtime.getOpnetJsonRpcUrl(), "https://testnet.opnet.org/api/v1/json-rpc");

  assert.equal(
    readJsonRpcUrlWithEnv({ OPNET_NETWORK: "testnet", OPNET_RPC_URL: "https://testnet.opnet.org" }),
    "https://testnet.opnet.org/api/v1/json-rpc",
  );
  assert.equal(
    readJsonRpcUrlWithEnv({ OPNET_NETWORK: "mainnet", OPNET_RPC_URL: "https://mainnet.opnet.org/api/v1/json-rpc" }),
    "https://mainnet.opnet.org/api/v1/json-rpc",
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

test("OP_NET wallet network config maps only mainnet and OP_NET testnet to wallet names, HRPs, and BTC Vision keys", async () => {
  const network = await import("../dist/network-config.js");

  assert.deepEqual(network.getOpnetWalletNetworkConfig("testnet"), {
    network: "testnet",
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

test("OP_NET wallet compatibility accepts only the configured mainnet/testnet wallet network", async () => {
  const network = await import("../dist/network-config.js");

  assert.equal(network.isWalletNetworkCompatible("testnet", "testnet"), true);
  assert.equal(network.isWalletNetworkCompatible({ network: "testnet" }, "testnet"), true);
  assert.equal(network.isWalletNetworkCompatible("regtest", "testnet"), false);
  assert.equal(network.isWalletNetworkCompatible("wrench", "testnet"), false);
  assert.equal(network.isWalletNetworkCompatible("bitcoin", "mainnet"), true);
  assert.equal(network.isWalletNetworkCompatible("testnet", "mainnet"), false);
});

