import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { generateOP20Contract, type OP20TemplateVars } from "./templates/op20-fixed.js";
import { getBob, BobClient } from "./bob-client.js";

export interface ScaffoldInput {
  projectId: string;
  name: string;
  ticker: string;
  decimals: number;
  maxSupply: string;
  iconUrl?: string;
  outputDir: string; // absolute path to packages/opnet/generated/<projectId>
}

export interface ScaffoldOutput {
  contractPath: string;
  contractSource: string;
  buildHash: string;
  bobGuidance: string;
}

/**
 * Scaffold an OP_20 fixed-supply contract for a project.
 * 1. Fetches current OP_20 best-practices from Bob.
 * 2. Generates the contract from the safe-defaults template.
 * 3. Writes files to outputDir.
 * 4. Returns a build hash (SHA-256 of the source).
 */
export async function scaffoldContract(input: ScaffoldInput): Promise<ScaffoldOutput> {
  const bob = getBob();

  // Ask Bob for latest OP_20 guidance (lightweight — TOC only, fast)
  let bobGuidance = "";
  try {
    const result = await bob.callTool("opnet_opnet_dev", {
      doc_name: "docs/btc-runtime/contracts/op20-token.md",
      section: "Best Practices",
    });
    bobGuidance = BobClient.text(result).slice(0, 2000);
  } catch {
    bobGuidance = "Bob guidance unavailable (offline or rate-limited). Template is safe-defaults.";
  }

  const vars: OP20TemplateVars = {
    name: input.name,
    ticker: input.ticker,
    decimals: input.decimals,
    maxSupplyHuman: input.maxSupply,
    iconUrl: input.iconUrl,
  };

  const contractSource = generateOP20Contract(vars);
  const buildHash = crypto.createHash("sha256").update(contractSource).digest("hex");

  // Write output files
  await fs.mkdir(input.outputDir, { recursive: true });

  const contractPath = path.join(input.outputDir, `${input.ticker}.ts`);
  await fs.writeFile(contractPath, contractSource, "utf8");

  const metaPath = path.join(input.outputDir, "meta.json");
  await fs.writeFile(
    metaPath,
    JSON.stringify(
      {
        projectId: input.projectId,
        name: input.name,
        ticker: input.ticker,
        decimals: input.decimals,
        maxSupply: input.maxSupply,
        buildHash,
        generatedAt: new Date().toISOString(),
        network: "testnet",
        safeDefaults: {
          canMint: false,
          canPause: false,
          hasAdminKey: false,
          canUpgrade: false,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  return { contractPath, contractSource, buildHash, bobGuidance };
}
