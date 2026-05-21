import assert from "node:assert/strict";
import { test } from "node:test";

const { generateContractPackageJson } = await import("../dist/templates/contract-entry.js");

test("generated AssemblyScript contract pins @noble/hashes to v1 for BTC Vision compile compatibility", () => {
  const pkg = JSON.parse(generateContractPackageJson({
    slug: "repro-token",
    name: "Repro Token",
    ticker: "RPRO",
  }));

  assert.equal(pkg.overrides?.["@noble/hashes"], "1.8.0");
  assert.equal(pkg.overrides?.["@noble/curves"], undefined);
});
