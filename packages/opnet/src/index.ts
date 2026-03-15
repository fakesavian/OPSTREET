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
  type BondingCurveInput,
} from "./deployer.js";
export {
  generateBondingCurveContract,
  type BondingCurveTemplateVars,
} from "./templates/bonding-curve.js";
export {
  getProvider,
  getRpcProvider,
  closeProvider,
  assertRuntimeConfig,
  getRuntimeContractConfig,
  getRuntimeDiagnostics,
  getLiquidityTokenContractAddress,
  checkProviderHealth,
  fetchLivePoolState,
  fetchLivePoolReserves,
  findPoolAddress,
  preparePoolCreation,
  prepareShopMint,
  prepareCurveInitialization,
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
  OPNET_FEE_RECIPIENT,
  type RuntimeConfigRequirements,
  type RuntimeContractConfig,
  type RuntimeAddressDiagnostic,
  type RuntimeDiagnostics,
  type ProviderHealthResult,
  type LivePoolState,
  type LivePoolReserves,
  type PreparedInteraction,
  type PoolCreationIntent,
  type ShopMintIntent,
  type CurveInitIntent,
  type SignedInteractionPayload,
  type TransactionReceiptResult,
  type BroadcastResult,
  type BroadcastInteractionResult,
} from "./runtime-provider.js";
