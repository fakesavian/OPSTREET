import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveCompiledTokenWasmPath, resolveLaunchBuildOutcome, tokenWasmCandidates } from "../src/launchBuildOutcome.js";

test("PACKAGE_READY without compiled WASM does not advance to wallet deploy", () => {
  const outcome = resolveLaunchBuildOutcome({
    status: "PACKAGE_READY",
    buildHash: "hash-1",
    packageDir: "/tmp/pkg",
    instructions: "compile manually",
  });

  assert.equal(outcome.kind, "buildNotReady");
  assert.match(outcome.error, /Compiled contract WASM is not available yet/i);
});

test("COMPILED still requires a concrete token WASM path before wallet signing", () => {
  const outcome = resolveLaunchBuildOutcome({
    status: "COMPILED",
    buildHash: "hash-2",
    packageDir: "/tmp/pkg",
    instructions: "deploy",
  });

  assert.equal(outcome.kind, "buildNotReady");
  assert.match(outcome.error, /Retry the build before signing deploy/i);
});

test("COMPILED with token WASM is wallet deploy ready", () => {
  const outcome = resolveLaunchBuildOutcome({
    status: "COMPILED",
    buildHash: "hash-3",
    packageDir: "/tmp/pkg",
    wasmPath: "/tmp/pkg/contract/build/TOKEN.wasm",
    instructions: "deploy",
  });

  assert.deepEqual(outcome, {
    kind: "walletDeployReady",
    buildHash: "hash-3",
    wasmPath: "/tmp/pkg/contract/build/TOKEN.wasm",
    curveWasmPath: undefined,
  });
});


test("bonding curve deploy intent looks in contract/token/build before legacy contract/build", () => {
  const candidates = tokenWasmCandidates("/generated", "project-1", "OPX", "BONDING_CURVE");

  assert.equal(candidates[0], path.join("/generated", "project-1", "contract", "token", "build", "OPX.wasm"));
  assert.equal(candidates[1], path.join("/generated", "project-1", "contract", "build", "OPX.wasm"));
});

test("resolveCompiledTokenWasmPath finds the bonding curve token artifact", () => {
  const root = mkdtempSync(path.join(tmpdir(), "opstreet-wasm-"));
  const wasm = path.join(root, "project-2", "contract", "token", "build", "OPX.wasm");
  mkdirSync(path.dirname(wasm), { recursive: true });
  writeFileSync(wasm, "00", "utf8");

  assert.equal(resolveCompiledTokenWasmPath(root, "project-2", "OPX", "BONDING_CURVE"), wasm);
});
