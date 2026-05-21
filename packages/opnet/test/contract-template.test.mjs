import assert from "node:assert/strict";
import { test } from "node:test";

const { generateContractPackageJson, generateAsconfigJson } = await import("../dist/templates/contract-entry.js");
const { generateOP20Contract } = await import("../dist/templates/op20-fixed.js");
const { generateBondingCurvePackageJson, generateBondingCurveAsconfigJson } = await import("../dist/templates/bonding-curve-entry.js");
const { generateBondingCurveContract } = await import("../dist/templates/bonding-curve.js");

function assertCompileSafePackage(pkg) {
  assert.equal(pkg.devDependencies?.["@btc-vision/assemblyscript"], "0.29.2");
  assert.equal(pkg.devDependencies?.["@btc-vision/opnet-transform"], "1.2.0");
  assert.equal(pkg.devDependencies?.["@assemblyscript/loader"], "0.28.9");
  assert.equal(pkg.overrides?.["@noble/hashes"], "1.8.0");
  assert.equal(pkg.overrides?.["@noble/curves"], "1.9.7");
  assert.equal(pkg.overrides?.["opnet"], "1.7.16");
  assert.equal(pkg.overrides?.["@btc-vision/transaction"], "1.7.19");
  assert.equal(pkg.overrides?.["@btc-vision/bitcoin"], "6.4.11");
}

test("generated token contract pins BTC Vision/Noble compiler graph to a compile-safe set", () => {
  const pkg = JSON.parse(generateContractPackageJson({
    slug: "repro-token",
    name: "Repro Token",
    ticker: "RPRO",
  }));

  assertCompileSafePackage(pkg);
});

test("generated bonding curve contract package uses the same compile-safe dependency graph", () => {
  const pkg = JSON.parse(generateBondingCurvePackageJson({
    slug: "repro-token",
    name: "Repro Token",
  }));

  assertCompileSafePackage(pkg);
});

test("contract asconfig exports start without stale abort alias", () => {
  const config = JSON.parse(generateAsconfigJson({ ticker: "RPRO" }));
  assert.equal(config.options.exportStart, "start");
  assert.equal(config.options.use, undefined);
});

test("bonding curve asconfig exports start without stale abort alias", () => {
  const config = JSON.parse(generateBondingCurveAsconfigJson());
  assert.equal(config.options.exportStart, "start");
  assert.equal(config.options.use, undefined);
});

test("bonding curve token template imports Address when minting supply to curve address", () => {
  const source = generateOP20Contract({
    name: "Curve Token",
    ticker: "CURV",
    decimals: 8,
    maxSupplyHuman: "1000000000",
    mintTarget: "opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds",
  });

  assert.match(source, /\bAddress,?\s*\n/);
  assert.match(source, /Address\.fromString\('opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds'\)/);
});

test("bonding curve selector fallback never bakes zero createPool selector", async () => {
  const source = await generateBondingCurveContract({
    name: "Curve Token",
    ticker: "CURV",
    maxSupplyAtomic: "100000000000000000",
  });

  assert.doesNotMatch(source, /const SELECTOR_CREATE_POOL: u32\s*=\s*0x00000000/);
  assert.match(source, /const SELECTOR_CREATE_POOL: u32\s*=\s*0xe3433615/);
});


test("bonding curve template uses BTC runtime 1.10 storage and call result APIs", async () => {
  const source = await generateBondingCurveContract({
    name: "Curve Token",
    ticker: "CURV",
    maxSupplyAtomic: "100000000000000000",
  });

  assert.match(source, /new StoredAddress\(PTR_TOKEN_ADDRESS\)/);
  assert.match(source, /new StoredU256\(PTR_TOKEN_RESERVE,\s+new Uint8Array\(0\)\)/);
  assert.match(source, /poolResult\.data\.readAddress\(\)/);
  assert.match(source, /!result\.success \|\| !result\.data\.readBoolean\(\)/);
  assert.doesNotMatch(source, /new StoredAddress\(PTR_TOKEN_ADDRESS,\s+burnAddr\)/);
  assert.doesNotMatch(source, /poolResult\.readAddress\(\)/);
  assert.doesNotMatch(source, /result\.readBoolean\(\)/);
});


test("bonding curve template emits concrete NetEvent subclass instances", async () => {
  const source = await generateBondingCurveContract({
    name: "Curve Token",
    ticker: "CURV",
    maxSupplyAtomic: "100000000000000000",
  });

  assert.match(source, /class BondingCurveEvent extends NetEvent/);
  assert.match(source, /new BondingCurveEvent\('Buy', eventData\)/);
  assert.match(source, /new BondingCurveEvent\('Sell', eventData\)/);
  assert.match(source, /new BondingCurveEvent\('Graduated', eventData\)/);
  assert.doesNotMatch(source, /new NetEvent\(/);
});

test("deployer npm install uses a hermetic writable home and cache", async () => {
  const { mkdtempSync, existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { buildHermeticNpmEnv } = await import("../dist/deployer.js");

  const cwd = mkdtempSync(join(tmpdir(), "opnet-npm-env-"));
  const env = buildHermeticNpmEnv(cwd);

  assert.equal(env.HOME, join(cwd, ".npm-home"));
  assert.equal(env.USERPROFILE, join(cwd, ".npm-home"));
  assert.equal(env.npm_config_cache, join(cwd, ".npm-cache"));
  assert.equal(env.npm_config_tmp, join(cwd, ".npm-tmp"));
  assert.equal(env.npm_config_update_notifier, "false");
  assert.equal(env.npm_config_audit, "false");
  assert.equal(env.npm_config_fund, "false");
  assert.ok(existsSync(env.HOME));
  assert.ok(existsSync(env.npm_config_cache));
  assert.ok(existsSync(env.npm_config_tmp));
});
