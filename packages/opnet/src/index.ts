/**
 * OPNet integration wrapper.
 * Milestone 1: stubs only.
 * Milestone 2+: will call Bob (opnet-bob MCP) tools: OpnetDev, OpnetAudit, OpnetCli.
 * SAFETY: never pass secrets, private keys, or seed phrases to these stubs or the MCP server.
 */

export interface ScaffoldResult {
  contractSource: string;
  files: Record<string, string>;
}

export interface AuditResult {
  passed: boolean;
  issues: Array<{ severity: "INFO" | "WARN" | "FAIL"; message: string }>;
  summary: string;
}

export interface DeployResult {
  contractAddress: string;
  deployTx: string;
  buildHash: string;
  network: "testnet";
}

/** Stub: scaffold OP_20 contract (Milestone 2 will call OpnetDev via Bob) */
export async function scaffoldOP20(_opts: {
  name: string;
  ticker: string;
  decimals: number;
  maxSupply: string;
}): Promise<ScaffoldResult> {
  throw new Error("Not implemented until Milestone 2 (requires Bob OpnetDev tool)");
}

/** Stub: run audit (Milestone 2 will call OpnetAudit via Bob) */
export async function auditContract(_projectId: string): Promise<AuditResult> {
  throw new Error("Not implemented until Milestone 2 (requires Bob OpnetAudit tool)");
}

/** Stub: deploy to testnet (Milestone 3 will call OpnetCli via Bob) */
export async function deployToTestnet(_projectId: string): Promise<DeployResult> {
  throw new Error("Not implemented until Milestone 3 (requires Bob OpnetCli tool)");
}
