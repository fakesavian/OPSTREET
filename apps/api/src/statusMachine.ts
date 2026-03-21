/**
 * S3 — Status transition validation.
 *
 * Single source of truth for all Project status transitions.
 * Both HTTP route handlers and background async functions must go through
 * `assertCanTransition` before writing a new status to the DB.
 */

export const ALLOWED_TRANSITIONS: Readonly<Record<string, string[]>> = {
  DRAFT: ["CHECKING"],
  CHECKING: ["READY", "FLAGGED", "DEPLOY_PACKAGE_READY", "DRAFT"],
  READY: ["CHECKING", "LAUNCHED", "GRADUATED"],
  // DEPLOY_PACKAGE_READY: package generated but not yet auto-deployed; same exits as READY
  DEPLOY_PACKAGE_READY: ["CHECKING", "LAUNCHED"],
  FLAGGED: ["CHECKING"],
  LAUNCHED: ["FLAGGED", "GRADUATED"],
  GRADUATED: [],
};

/** Returns true if the transition is allowed. */
export function canTransition(from: string, to: string): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Throws a tagged Error (statusCode: 409) if the transition is not allowed.
 * Catch in route handlers: `if (err.statusCode === 409) return reply.status(409).send(...)`.
 */
export function assertCanTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    const err = new Error(`Invalid status transition: ${from} → ${to}`) as Error & {
      statusCode: number;
    };
    err.statusCode = 409;
    throw err;
  }
}
