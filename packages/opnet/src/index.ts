/**
 * OPNet integration wrapper.
 * Milestone 2: scaffold + audit live via Bob MCP.
 * Milestone 3+: deploy via Bob OpnetCli.
 * SAFETY: never pass secrets, private keys, or seed phrases to Bob or this module.
 */

export { BobClient, getBob } from "./bob-client.js";
export { scaffoldContract, type ScaffoldInput, type ScaffoldOutput } from "./scaffolder.js";
export { auditContract, type AuditOutput, type AuditIssue } from "./auditor.js";
export {
  generateOP20Contract,
  type OP20TemplateVars,
} from "./templates/op20-fixed.js";

/** Stub: deploy to testnet (Milestone 3 will call Bob OpnetCli) */
export async function deployToTestnet(_projectId: string): Promise<{
  contractAddress: string;
  deployTx: string;
  network: "testnet";
}> {
  throw new Error("Not implemented until Milestone 3 (requires Bob OpnetCli + funded testnet wallet)");
}
