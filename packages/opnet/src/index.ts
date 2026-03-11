/**
 * OPNet integration wrapper.
 * M1: stubs | M2: scaffold + audit | M3: compile + deploy
 * SAFETY: never pass secrets, private keys, or seed phrases to Bob or this module.
 * Target: OPNet testnet only.
 */

export { BobClient, getBob } from "./bob-client.js";
export { scaffoldContract, type ScaffoldInput, type ScaffoldOutput } from "./scaffolder.js";
export { auditContract, type AuditOutput, type AuditIssue } from "./auditor.js";
export {
  generateOP20Contract,
  type OP20TemplateVars,
} from "./templates/op20-fixed.js";
export {
  deployContract,
  type DeployInput,
  type DeployOutput,
  type DeployStatus,
} from "./deployer.js";
export {
  getProvider,
  getRpcProvider,
  closeProvider,
  assertRuntimeConfig,
  getRuntimeContractConfig,
  getLiquidityTokenContractAddress,
  checkProviderHealth,
  fetchLivePoolState,
  fetchLivePoolReserves,
  findPoolAddress,
  preparePoolCreation,
  prepareShopMint,
  fetchTransactionReceipt,
  broadcastTransaction,
  broadcastSignedInteraction,
  checkOp721Ownership,
  checkContractCode,
  readStorageSlot,
  RuntimeConfigError,
  getOpnetRpcUrl,
  getOpnetNetwork,
  MOTOSWAP_FACTORY_ADDRESS,
  MOTOSWAP_ROUTER_ADDRESS,
  SHOP_OP721_COLLECTION_ADDRESS,
  type RuntimeConfigRequirements,
  type RuntimeContractConfig,
  type ProviderHealthResult,
  type LivePoolState,
  type LivePoolReserves,
  type PreparedInteraction,
  type PoolCreationIntent,
  type ShopMintIntent,
  type SignedInteractionPayload,
  type TransactionReceiptResult,
  type BroadcastResult,
  type BroadcastInteractionResult,
} from "./runtime-provider.js";
