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
import {
  generateBondingCurveContract,
} from "./templates/bonding-curve.js";
import type { BondingCurveTemplateVars } from "./templates/bonding-curve.js";
import {
  generateBondingCurveEntry,
  generateBondingCurvePackageJson,
  generateBondingCurveAsconfigJson,
} from "./templates/bonding-curve-entry.js";

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

export interface BondingCurveInput {
  /**
   * Address of the BondingCurve contract (known before token deploy because
   * we pre-compute it from the deploy transaction in a two-step sequence).
   * When undefined, the scaffolder generates placeholder comments instructing
   * the deployer to fill in the curve address after step 1.
   */
  curveAddress?: string;
  /** Override any bonding curve constants (graduation threshold, fees, etc.). */
  curveVars?: Partial<BondingCurveTemplateVars>;
  /** Fee recipient address (from OPNET_FEE_RECIPIENT env var). */
  feeRecipient?: string;
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
  liquidityToken?: "TBTC" | "MOTO" | "PILL";
  liquidityAmount?: string;
  generatedDir: string; // packages/opnet/generated/<projectId>
  /**
   * When set, scaffolds a BondingCurve contract alongside the OP_20 token.
   * The OP_20 token will mint 100% supply to the curve contract address.
   */
  bondingCurve?: BondingCurveInput;
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
  /** Path to the compiled BondingCurve WASM (only set when bondingCurve was requested). */
  curveWasmPath?: string;
  packageDir: string;
  instructions: string;
  error?: string;
}

/**
 * Step 1: scaffold the full deploy package under generated/<projectId>/
 * When input.bondingCurve is set, scaffolds both:
 *   contract/token/ — OP_20 token (mints to curve address)
 *   contract/curve/ — BondingCurve contract
 */
async function scaffoldDeployPackage(input: DeployInput): Promise<void> {
  const className = toClassName(input.name);
  const now = new Date().toISOString();

  if (input.bondingCurve) {
    // ── Bonding curve layout: two contracts ──────────────────────────────
    const tokenDir = path.join(input.generatedDir, "contract", "token");
    const curveDir = path.join(input.generatedDir, "contract", "curve");
    const tokenSrcDir = path.join(tokenDir, "src");
    const curveSrcDir = path.join(curveDir, "src");

    await fs.mkdir(tokenSrcDir, { recursive: true });
    await fs.mkdir(curveSrcDir, { recursive: true });

    const curveAddress = input.bondingCurve.curveAddress;
    const atomicSupply = computeAtomicSupply(input.maxSupply, input.decimals);

    // Token contract: mints 100% supply to curve address
    const tokenSource = generateOP20Contract({
      name: input.name,
      ticker: input.ticker,
      decimals: input.decimals,
      maxSupplyHuman: input.maxSupply,
      iconUrl: input.iconUrl,
      mintTarget: curveAddress ?? "deployer",
    });
    await fs.writeFile(path.join(tokenSrcDir, `${input.ticker}.ts`), tokenSource, "utf8");
    await fs.writeFile(
      path.join(tokenSrcDir, "index.ts"),
      generateContractEntry({ className, ticker: input.ticker }),
      "utf8",
    );
    await fs.writeFile(
      path.join(tokenDir, "package.json"),
      generateContractPackageJson({ slug: input.slug + "-token", name: input.name, ticker: input.ticker }),
      "utf8",
    );
    await fs.writeFile(
      path.join(tokenDir, "asconfig.json"),
      generateAsconfigJson({ ticker: input.ticker }),
      "utf8",
    );

    // Curve contract: BondingCurve with baked-in constants
    const curveVars: BondingCurveTemplateVars = {
      name: input.name,
      ticker: input.ticker,
      maxSupplyAtomic: atomicSupply,
      ...input.bondingCurve.curveVars,
    };
    const curveSource = await generateBondingCurveContract(curveVars);
    await fs.writeFile(path.join(curveSrcDir, "BondingCurve.ts"), curveSource, "utf8");
    await fs.writeFile(path.join(curveSrcDir, "index.ts"), generateBondingCurveEntry(), "utf8");
    await fs.writeFile(
      path.join(curveDir, "package.json"),
      generateBondingCurvePackageJson({ slug: input.slug + "-curve", name: input.name }),
      "utf8",
    );
    await fs.writeFile(
      path.join(curveDir, "asconfig.json"),
      generateBondingCurveAsconfigJson(),
      "utf8",
    );

    // Bonding curve deploy script
    const deployTs = generateDeployScript({
      name: input.name,
      ticker: input.ticker,
      buildHash: input.buildHash,
      generatedAt: now,
      liquidityToken: input.liquidityToken,
      liquidityAmount: input.liquidityAmount,
      bondingCurve: {
        feeRecipient: input.bondingCurve.feeRecipient ?? "",
        curveAddress,
      },
    });
    await fs.writeFile(path.join(input.generatedDir, "deploy.ts"), deployTs, "utf8");
  } else {
    // ── Standard single-contract layout ─────────────────────────────────
    const contractDir = path.join(input.generatedDir, "contract");
    const contractSrcDir = path.join(contractDir, "src");

    await fs.mkdir(contractSrcDir, { recursive: true });

    const contractSource = generateOP20Contract({
      name: input.name,
      ticker: input.ticker,
      decimals: input.decimals,
      maxSupplyHuman: input.maxSupply,
      iconUrl: input.iconUrl,
    });
    await fs.writeFile(path.join(contractSrcDir, `${input.ticker}.ts`), contractSource, "utf8");
    await fs.writeFile(
      path.join(contractSrcDir, "index.ts"),
      generateContractEntry({ className, ticker: input.ticker }),
      "utf8",
    );
    await fs.writeFile(
      path.join(contractDir, "package.json"),
      generateContractPackageJson({ slug: input.slug, name: input.name, ticker: input.ticker }),
      "utf8",
    );
    await fs.writeFile(
      path.join(contractDir, "asconfig.json"),
      generateAsconfigJson({ ticker: input.ticker }),
      "utf8",
    );

    const deployTs = generateDeployScript({
      name: input.name,
      ticker: input.ticker,
      buildHash: input.buildHash,
      generatedAt: now,
      liquidityToken: input.liquidityToken,
      liquidityAmount: input.liquidityAmount,
    });
    await fs.writeFile(path.join(input.generatedDir, "deploy.ts"), deployTs, "utf8");
  }

  // Deploy package.json and README are always at root of generatedDir
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
    liquidityToken: input.liquidityToken,
    liquidityAmount: input.liquidityAmount,
  });
  await fs.writeFile(path.join(input.generatedDir, "DEPLOY.md"), readme, "utf8");
}

/** Convert human supply string to atomic units string (multiply by 10^decimals). */
function computeAtomicSupply(humanSupply: string, decimals: number): string {
  return (BigInt(humanSupply) * BigInt(10) ** BigInt(decimals)).toString();
}

function readAscVersion(ascCommand: string, cwd?: string): string | null {
  try {
    const raw = execSync(`${ascCommand} --version`, {
      cwd,
      timeout: 10_000,
      stdio: ["ignore", "pipe", "pipe"],
    }).toString("utf8").trim();
    return raw || null;
  } catch {
    return null;
  }
}

function resolveAscCommand(contractDir: string): string | null {
  const fromEnv = process.env["ASC_BIN"]?.trim();
  if (fromEnv) return fromEnv;

  const localAsc = process.platform === "win32"
    ? path.join(contractDir, "node_modules", ".bin", "asc.cmd")
    : path.join(contractDir, "node_modules", ".bin", "asc");

  if (existsSync(localAsc)) {
    return `"${localAsc}"`;
  }

  return "npx asc";
}

/**
 * Step 2: try to compile the AssemblyScript contract(s).
 * For bonding curve deployments, compiles token then curve in sequence.
 * Returns { wasmPath, curveWasmPath } — null paths indicate compile failure.
 */
function tryCompile(input: DeployInput): { wasmPath: string | null; curveWasmPath: string | null } {
  const isBondingCurve = !!input.bondingCurve;
  const tokenContractDir = isBondingCurve
    ? path.join(input.generatedDir, "contract", "token")
    : path.join(input.generatedDir, "contract");
  const curveContractDir = path.join(input.generatedDir, "contract", "curve");

  const tokenWasm = compileSingleContract(input, tokenContractDir, `${input.ticker}.wasm`);
  const curveWasm = isBondingCurve
    ? compileSingleContract(input, curveContractDir, "BondingCurve.wasm")
    : null;

  return { wasmPath: tokenWasm, curveWasmPath: curveWasm };
}

function compileSingleContract(input: DeployInput, contractDir: string, wasmName: string): string | null {
  const wasmPath = path.join(contractDir, "build", wasmName);
  const requiredAscPrefix = process.env["ASC_VERSION_PREFIX"]?.trim() || "0.29";

  // Already compiled?
  if (existsSync(wasmPath)) return wasmPath;

  try {
    console.log("[deployer] Installing AS contract deps...");
    execSync("npm install --prefer-online", {
      cwd: contractDir,
      timeout: 120_000,
      stdio: "inherit",
    });

    const ascCommand = resolveAscCommand(contractDir);
    if (!ascCommand) return null;

    const ascVersion = readAscVersion(ascCommand, contractDir);
    if (!ascVersion) {
      console.warn("[deployer] asc not available. Set ASC_BIN or install @btc-vision/assemblyscript.");
      return null;
    }

    if (!ascVersion.includes(requiredAscPrefix)) {
      console.warn(
        `[deployer] asc version mismatch. required~${requiredAscPrefix}, got="${ascVersion}". Set ASC_BIN to a compatible binary.`,
      );
      return null;
    }

    console.log(`[deployer] Compiling AssemblyScript contract with asc ${ascVersion}...`);
    execSync(`${ascCommand} src/index.ts --config asconfig.json --target release`, {
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

    // Try to compile (returns { wasmPath, curveWasmPath })
    const { wasmPath, curveWasmPath } = tryCompile(input);

    // For bonding curve: require both WASMs to advance past PACKAGE_READY
    const tokenReady = !!wasmPath;
    const curveReady = !input.bondingCurve || !!curveWasmPath;

    if (!tokenReady || !curveReady) {
      return {
        status: "PACKAGE_READY",
        buildHash: input.buildHash,
        packageDir,
        wasmPath: wasmPath ?? undefined,
        curveWasmPath: curveWasmPath ?? undefined,
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
        wasmPath: wasmPath ?? undefined,
        curveWasmPath: curveWasmPath ?? undefined,
        instructions: buildInstructions(input, "done", deployed.contractAddress),
      };
    }

    return {
      status: "COMPILED",
      buildHash: input.buildHash,
      packageDir,
      wasmPath: wasmPath ?? undefined,
      curveWasmPath: curveWasmPath ?? undefined,
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
      `       cd ${dir}/contract && npm install`,
      `       # optional: export ASC_BIN=/absolute/path/to/asc`,
      `       # optional: export ASC_VERSION_PREFIX=0.29`,
      `       npm run build`,
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
