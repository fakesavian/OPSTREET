import type { FastifyRequest, FastifyReply } from "fastify";

export interface WalletSession {
  walletAddress: string;
  provider: string;
}

declare module "fastify" {
  interface FastifyRequest {
    walletSession?: WalletSession;
  }
}

const DEV_HEADER_FALLBACK = process.env["DEV_AUTH_HEADER_FALLBACK"] === "true";

export async function verifyWalletToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    let token: string | undefined;

    // 1. Check HttpOnly cookie first
    const cookies = request.cookies as Record<string, string | undefined>;
    token = cookies["opfun_session"];

    if (!token && DEV_HEADER_FALLBACK) {
      // 2. Dev-only fallback: Authorization: Bearer <token> (gated by DEV_AUTH_HEADER_FALLBACK=true)
      const auth = request.headers["authorization"];
      if (typeof auth === "string" && auth.startsWith("Bearer ")) {
        token = auth.slice(7);
      }
    }

    if (!token) {
      return reply.status(401).send({ error: "Authentication required." });
    }

    const payload = request.server.jwt.verify<WalletSession>(token);
    request.walletSession = payload;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired session. Sign in again." });
  }
}
