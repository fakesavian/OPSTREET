/**
 * OPFun deployer — Milestone 3.
 * Scaffolds a complete deploy package and (optionally) runs compile + deploy.
 * SAFETY: reads OPNET_MNEMONIC from env only — never accepts secrets from callers.
 * Target: OPNet testnet ONLY.
 */

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  generateContractEntry,
  generateContractPackageJson,
  generateAsconfigJson,
} from "./templates/contract-entry.js";
import {
  generateDeployScript,
  generateDeployPackageJson,
  generateDeployReadme,
} from "./templates/deploy-script.js";
import { generateOP20Contract } from "./templates/op20-fixed.js";

// Derive class name from token name (must match scaffolder logic)
function toClassName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("")
      .replace(/^[^a-zA-Z]/, "T") + "Token"
  );
}

export interface DeployInput {
  projectId: string;
  slug: string;
  name: string;
  ticker: string;
  decimals: number;
  maxSupply: string;
  iconUrl?: string;
  buildHash: string;
  generatedDir: string; // packages/opnet/generated/<projectId>
}

export type DeployStatus =
  | "PACKAGE_READY"   // scaffold done, WASM not compiled (no toolchain)
  | "COMPILED"        // WASM compiled, no wallet configured
  | "LAUNCHED"        // deployed to testnet
  | "FAILED";

export interface DeployOutput {
  status: DeployStatus;
  contractAddress?: string;
  deployTx?: string;
  buildHash: string;
  wasmPath?: string;
  packageDir: string;
  instructions: string;
  error?: string;
}

/**
 * Step 1: scaffold the full deploy package under generated/<projectId>/
 */
async function scaffoldDeployPackage(input: DeployInput): Promise<void> {
  const className = toClassName(input.name);
  const contractDir = path.join(input.generatedDir, "contract");
  const contractSrcDir = path.join(contractDir, "src");

  await fs.mkdir(contractSrcDir, { recursive: true });

  // Write the AS contract (may already exist from M2 scaffold, overwrite is fine)
  const contractSource = generateOP20Contract({
    name: input.name,
    ticker: input.ticker,
    decimals: input.decimals,
    maxSupplyHuman: input.maxSupply,
    iconUrl: input.iconUrl,
  });
  await fs.writeFile(path.join(contractSrcDir, `${input.ticker}.ts`), contractSource, "utf8");

  // Write the AS entry point
  const entrySource = generateContractEntry({ className, ticker: input.ticker });
  await fs.writeFile(path.join(contractSrcDir, "index.ts"), entrySource, "utf8");

  // package.json
  const pkgJson = generateContractPackageJson({
    slug: input.slug,
    name: input.name,
    ticker: input.ticker,
  });
  await fs.writeFile(path.join(contractDir, "package.json"), pkgJson, "utf8");

  // asconfig.json
  const asconfig = generateAsconfigJson({ ticker: input.ticker });
  await fs.writeFile(path.join(contractDir, "asconfig.json"), asconfig, "utf8");

  // Deploy script files (at root of generatedDir)
  const now = new Date().toISOString();
  const deployTs = generateDeployScript({
    name: input.name,
    ticker: input.ticker,
    buildHash: input.buildHash,
    generatedAt: now,
  });
  await fs.writeFile(path.join(input.generatedDir, "deploy.ts"), deployTs, "utf8");

  const deployPkg = generateDeployPackageJson({
    slug: input.slug,
    name: input.name,
    ticker: input.ticker,
  });
  await fs.writeFile(path.join(input.generatedDir, "package.json"), deployPkg, "utf8");

  const readme = generateDeployReadme({
    name: input.name,
    ticker: input.ticker,
    slug: input.slug,
    buildHash: input.buildHash,
    generatedAt: now,
    projectId: input.projectId,
  });
  await fs.writeFile(path.join(input.generatedDir, "DEPLOY.md"), readme, "utf8");
}

/**
 * Step 2: try to compile the AssemblyScript contract.
 * Returns the path to the WASM if successful, null otherwise.
 */
function tryCompile(input: DeployInput): string | null {
  const contractDir = path.join(input.generatedDir, "contract");
  const wasmPath = path.join(contractDir, "build", `${input.ticker}.wasm`);

  // Already compiled?
  if (existsSync(wasmPath)) return wasmPath;

  try {
    // Check if asc is available anywhere
    execSync("npx asc --version", { timeout: 10_000, stdio: "ignore" });
  } catch {
    return null; // asc not available
  }

  try {
    console.log("[deployer] Installing AS contract deps...");
    execSync("npm install --prefer-online", {
      cwd: contractDir,
      timeout: 120_000,
      stdio: "inherit",
    });

    console.log("[deployer] Compiling AssemblyScript contract...");
    execSync("npm run build", {
      cwd: contractDir,
      timeout: 120_000,
      stdio: "inherit",
    });

    return existsSync(wasmPath) ? wasmPath : null;
  } catch (err) {
    console.warn("[deployer] Compile failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Step 3: attempt auto-deploy if OPNET_MNEMONIC is set and WASM exists.
 * Uses the deploy.ts script via ts-node for isolation.
 * Reads deploy-result.json output.
 */
async function tryAutoDeploy(generatedDir: string): Promise<{
  contractAddress: string;
  deployTx: string;
} | null> {
  const mnemonic = process.env["OPNET_MNEMONIC"];
  if (!mnemonic) return null;

  const resultPath = path.join(generatedDir, "deploy-result.json");

  try {
    console.log("[deployer] Auto-deploying to OPNet testnet...");

    // Install deploy deps if needed
    if (!existsSync(path.join(generatedDir, "node_modules"))) {
      execSync("npm install --prefer-online", {
        cwd: generatedDir,
        timeout: 120_000,
        stdio: "inherit",
        env: { ...process.env },
      });
    }

    execSync("npx ts-node deploy.ts", {
      cwd: generatedDir,
      timeout: 120_000,
      stdio: "inherit",
      env: { ...process.env, OPNET_MNEMONIC: mnemonic },
    });

    if (!existsSync(resultPath)) return null;

    const result = JSON.parse(await fs.readFile(resultPath, "utf8")) as {
      contractAddress: string;
      deployTx: string;
    };
    return result;
  } catch (err) {
    console.warn("[deployer] Auto-deploy failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Main deploy pipeline.
 */
export async function deployContract(input: DeployInput): Promise<DeployOutput> {
  const packageDir = input.generatedDir;

  try {
    // Always scaffold
    await scaffoldDeployPackage(input);

    // Try to compile
    const wasmPath = tryCompile(input);

    if (!wasmPath) {
      return {
        status: "PACKAGE_READY",
        buildHash: input.buildHash,
        packageDir,
        wasmPath: undefined,
        instructions: buildInstructions(input, "compile"),
      };
    }

    // Try auto-deploy
    const deployed = await tryAutoDeploy(packageDir);
    if (deployed) {
      return {
        status: "LAUNCHED",
        contractAddress: deployed.contractAddress,
        deployTx: deployed.deployTx,
        buildHash: input.buildHash,
        packageDir,
        wasmPath,
        instructions: buildInstructions(input, "done", deployed.contractAddress),
      };
    }

    return {
      status: "COMPILED",
      buildHash: input.buildHash,
      packageDir,
      wasmPath,
      instructions: buildInstructions(input, "deploy"),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "FAILED",
      buildHash: input.buildHash,
      packageDir,
      error: message,
      instructions: buildInstructions(input, "compile"),
    };
  }
}

function buildInstructions(
  input: DeployInput,
  stage: "compile" | "deploy" | "done",
  contractAddress?: string,
): string {
  const dir = `packages/opnet/generated/${input.projectId}`;
  if (stage === "done") {
    return `Deployed at ${contractAddress}. See DEPLOY.md for details.`;
  }
  if (stage === "compile") {
    return [
      `Deploy package generated at: ${dir}`,
      ``,
      `Next steps:`,
      `  1. Compile the contract:`,
      `       cd ${dir}/contract && npm install && npm run build`,
      `  2. Fund your testnet wallet (get Signet BTC from a faucet)`,
      `  3. Set your mnemonic: export OPNET_MNEMONIC="word1 ... word24"`,
      `  4. Run: cd ${dir} && npm install && npx ts-node deploy.ts`,
      `  5. See: ${dir}/DEPLOY.md for full instructions`,
    ].join("\n");
  }
  return [
    `WASM compiled. Ready to deploy.`,
    ``,
    `Next steps:`,
    `  1. Fund your testnet wallet (get Signet BTC from a faucet)`,
    `  2. Set your mnemonic: export OPNET_MNEMONIC="word1 ... word24"`,
    `  3. Run: cd ${dir} && npm install && npx ts-node deploy.ts`,
    `  4. See: ${dir}/DEPLOY.md for full instructions`,
  ].join("\n");
}
