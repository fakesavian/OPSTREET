/**
 * Launch state machine — tracks the on-chain lifecycle of a token.
 *
 * Separate from the project status machine (statusMachine.ts) which
 * tracks auditing/safety checks. LaunchStatus tracks the actual
 * deployment and pool creation pipeline.
 */

import type { LaunchStatus } from "@opfun/shared";

const ALLOWED_LAUNCH_TRANSITIONS: Readonly<Record<LaunchStatus, LaunchStatus[]>> = {
  DRAFT:                 ["BUILDING", "FAILED"],
  BUILDING:              ["AWAITING_WALLET_DEPLOY", "FAILED"],
  AWAITING_WALLET_DEPLOY: ["DEPLOY_SUBMITTED", "FAILED"],
  DEPLOY_SUBMITTED:      ["DEPLOY_CONFIRMED", "FAILED"],
  DEPLOY_CONFIRMED:      ["AWAITING_POOL_CREATE", "FAILED"],
  AWAITING_POOL_CREATE:  ["POOL_SUBMITTED", "FAILED"],
  POOL_SUBMITTED:        ["LIVE", "FAILED"],
  LIVE:                  [],
  FAILED:                ["DRAFT"], // allow retry from scratch
};

export function canLaunchTransition(from: LaunchStatus, to: LaunchStatus): boolean {
  return (ALLOWED_LAUNCH_TRANSITIONS[from] ?? []).includes(to);
}

export function assertLaunchTransition(from: LaunchStatus, to: LaunchStatus): void {
  if (!canLaunchTransition(from, to)) {
    const err = new Error(`Invalid launch transition: ${from} → ${to}`) as Error & {
      statusCode: number;
    };
    err.statusCode = 409;
    throw err;
  }
}

/** All LaunchStatus values that represent a terminal-ish failure. */
export function isLaunchFailed(status: LaunchStatus): boolean {
  return status === "FAILED";
}

/** Whether the project has completed the full launch pipeline. */
export function isLive(status: LaunchStatus): boolean {
  return status === "LIVE";
}
