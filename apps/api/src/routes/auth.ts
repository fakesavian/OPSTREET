import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { Verifier } from "bip322-js";
import type { WalletSession } from "../middleware/verifyWalletToken.js";
import { verifyWalletToken } from "../middleware/verifyWalletToken.js";
import type { AchievementProgress } from "@prisma/client";
import { prisma } from "../db.js";

const BADGES = [
  {
    id: "early-adopter",
    name: "Early Adopter",
    description: "Connected your wallet to OpStreet",
    emoji: "\u{1F331}",
    check: (_p: AchievementProgress) => true,
  },
  {
    id: "first-launch",
    name: "First Launch",
    description: "Created your first token project",
    emoji: "\u{1F680}",
    check: (p: AchievementProgress) => p.tokensCreated >= 1,
  },
  {
    id: "rocket-launcher",
    name: "Rocket Launcher",
    description: "Launched 5 token projects",
    emoji: "\u{1F525}",
    check: (p: AchievementProgress) => p.tokensCreated >= 5,
  },
  {
    id: "vocal-supporter",
    name: "Vocal Supporter",
    description: "Posted 5 callouts on the trading floor",
    emoji: "\u{1F4E2}",
    check: (p: AchievementProgress) => p.calloutsCount >= 5,
  },
  {
    id: "floor-veteran",
    name: "Floor Veteran",
    description: "Posted 25 callouts on the trading floor",
    emoji: "\u{1F3C6}",
    check: (p: AchievementProgress) => p.calloutsCount >= 25,
  },
];

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 min
const DEV_AUTH_SESSION =
  process.env["DEV_AUTH_HEADER_FALLBACK"] === "true" ||
  process.env["NODE_ENV"] !== "production";

const DOMAIN = process.env["AUTH_DOMAIN"] ?? "opstreet.xyz";

function buildMessage(nonce: string, expiresAt: Date): string {
  return [
    "OpStreet testnet authentication",
    "",
    `Domain: ${DOMAIN}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt.toISOString()}`,
  ].join("\n");
}

// ── Bech32 address conversion (opt1 → tb1 for BIP-322 verification) ──────

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i]!;
  }
  return chk;
}

function bech32CreateChecksum(hrp: string, data: number[], isBech32m: boolean): number[] {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const polymod = bech32Polymod(values) ^ (isBech32m ? 0x2bc830a3 : 1);
  const ret: number[] = [];
  for (let i = 0; i < 6; i++) ret.push((polymod >> (5 * (5 - i))) & 31);
  return ret;
}

function bech32Decode(str: string): { hrp: string; data: number[]; isBech32m: boolean } | null {
  const pos = str.lastIndexOf("1");
  if (pos < 1 || pos + 7 > str.length || str.length > 90) return null;
  const hrp = str.slice(0, pos).toLowerCase();
  const dataChars = str.slice(pos + 1).toLowerCase();
  const data: number[] = [];
  for (const ch of dataChars) {
    const idx = BECH32_CHARSET.indexOf(ch);
    if (idx === -1) return null;
    data.push(idx);
  }
  const values = [...bech32HrpExpand(hrp), ...data];
  const polymod = bech32Polymod(values);
  const isBech32m = polymod === 0x2bc830a3;
  if (polymod !== 1 && !isBech32m) return null;
  return { hrp, data: data.slice(0, -6), isBech32m };
}

function bech32Encode(hrp: string, data: number[], isBech32m: boolean): string {
  const checksum = bech32CreateChecksum(hrp, data, isBech32m);
  return hrp + "1" + [...data, ...checksum].map((d) => BECH32_CHARSET[d]).join("");
}

/** Convert opt1p... -> tb1p... for BIP-322 verification. Other addresses pass through. */
function toSigningAddress(address: string): string {
  const lower = address.toLowerCase();
  if (lower.startsWith("tb1") || lower.startsWith("bc1") || lower.startsWith("bcrt1")) return address;
  if (lower.startsWith("opt1")) {
    const decoded = bech32Decode(address);
    if (decoded) return bech32Encode("tb", decoded.data, decoded.isBech32m);
  }
  return address;
}

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/nonce
  // Stateless: nonce is embedded in a short-lived JWT so no DB write is needed.
  // This avoids cold-start DB latency on the very first auth request.
  app.post<{ Body: { walletAddress: string } }>("/auth/nonce", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const { walletAddress } = (request.body ?? {}) as { walletAddress?: string };
    if (!walletAddress || typeof walletAddress !== "string" || walletAddress.length < 10) {
      return reply.status(400).send({ error: "walletAddress required" });
    }

    const nonce = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
    const message = buildMessage(nonce, expiresAt);

    // Sign a compact token containing the nonce + exact expiry ISO string.
    // The verify endpoint decodes this token instead of hitting the DB.
    const nonceToken = app.jwt.sign(
      { n: nonce, e: expiresAt.toISOString(), w: walletAddress },
      { expiresIn: `${Math.ceil(NONCE_TTL_MS / 1000)}s` },
    );

    request.log.info({ event: "nonce_issued", walletAddress }, "Nonce issued");
    return reply.send({ nonce: nonceToken, message, expiresAt: expiresAt.toISOString() });
  });

  // POST /auth/verify
  app.post<{ Body: { walletAddress: string; signature: string; nonce: string } }>(
    "/auth/verify",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { walletAddress, signature, nonce } = (request.body ?? {}) as {
        walletAddress?: string;
        signature?: string;
        nonce?: string;
      };
      if (!walletAddress || !signature || !nonce) {
        return reply.status(400).send({ error: "walletAddress, signature, nonce required" });
      }

      // Decode the stateless nonce JWT (issued by /auth/nonce — no DB lookup needed).
      let noncePayload: { n: string; e: string; w: string } | null = null;
      try {
        noncePayload = app.jwt.verify<{ n: string; e: string; w: string }>(nonce);
      } catch {
        request.log.warn({ event: "auth_fail", reason: "nonce_invalid", walletAddress }, "Auth failed: nonce JWT invalid or expired");
        return reply.status(401).send({ error: "Nonce expired or invalid. Request a new one." });
      }

      if (!noncePayload || new Date(noncePayload.e) < new Date()) {
        request.log.warn({ event: "auth_fail", reason: "nonce_expired", walletAddress }, "Auth failed: nonce expired");
        return reply.status(401).send({ error: "Nonce expired. Request a new one." });
      }

      if (noncePayload.w !== walletAddress) {
        request.log.warn({ event: "auth_fail", reason: "nonce_wallet_mismatch", walletAddress }, "Auth failed: nonce wallet mismatch");
        return reply.status(401).send({ error: "Nonce was issued for a different wallet." });
      }

      // Rebuild the exact message that was presented to the wallet for signing.
      const nonceMessage = buildMessage(noncePayload.n, new Date(noncePayload.e));

      // Verify BIP-322 signature (convert opt1 → tb1 for verification)
      const signingAddress = toSigningAddress(walletAddress);
      let valid = false;
      try {
        valid = Verifier.verifySignature(signingAddress, nonceMessage, signature);
      } catch {
        request.log.warn({ event: "auth_fail", reason: "verify_throw", walletAddress }, "Auth failed: signature verification threw");
        return reply.status(401).send({ error: "Signature verification failed." });
      }
      // DEV_AUTH_HEADER_FALLBACK=true bypasses BIP-322 on testnet deployments where
      // the wallet (e.g. OP_WALLET) cannot produce a verifiable BIP-322 signature.
      // Never set this flag on a production mainnet deployment.
      if (!valid && process.env["DEV_AUTH_HEADER_FALLBACK"] === "true") {
        request.log.warn(
          { event: "auth_dev_fallback", walletAddress },
          "BIP-322 verification failed, allowing fallback session (DEV_AUTH_HEADER_FALLBACK=true).",
        );
        valid = true;
      }

      if (!valid) {
        request.log.warn({ event: "auth_fail", reason: "invalid_sig", walletAddress }, "Auth failed: invalid BIP-322 signature");
        return reply.status(401).send({ error: "Invalid signature." });
      }

      // Stateless nonces are single-use by expiry — no DB delete needed.

      // Issue JWT
      const token = app.jwt.sign(
        { walletAddress, provider: "wallet" },
        { expiresIn: "24h" },
      );

      request.log.info({ event: "auth_success", walletAddress }, "Wallet authenticated successfully");
      // Preferred: HttpOnly cookie. Also return token in body for localStorage fallback.
      // NOTE: localStorage fallback is a known XSS risk — see HARDENING_REPORT.md
      // sameSite=lax in dev (cross-port localhost:3000→3001 needs it), strict in prod.
      const isProduction = process.env["NODE_ENV"] === "production";
      return reply
        .setCookie("opfun_session", token, {
          httpOnly: true,
          sameSite: isProduction ? "strict" : "lax",
          maxAge: 86400,
          path: "/",
          secure: isProduction,
        })
        .send({ walletAddress, expiresIn: 86400 });
    },
  );

  // POST /auth/logout
  app.post("/auth/logout", async (_request, reply) => {
    return reply.clearCookie("opfun_session", { path: "/" }).send({ ok: true });
  });

  // POST /auth/dev-session
  // Test/dev helper to mint a local session when DEV_AUTH_HEADER_FALLBACK=true.
  app.post<{ Body: { walletAddress: string } }>("/auth/dev-session", async (request, reply) => {
    if (!DEV_AUTH_SESSION || process.env["NODE_ENV"] === "production") {
      return reply.status(403).send({ error: "Dev session route disabled." });
    }
    const walletAddress = (request.body as { walletAddress?: string } | undefined)?.walletAddress;
    if (!walletAddress || walletAddress.length < 10) {
      return reply.status(400).send({ error: "walletAddress required" });
    }

    await prisma.userProfile.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress, displayName: walletAddress.slice(0, 8) },
    });

    const token = app.jwt.sign(
      { walletAddress, provider: "wallet" },
      { expiresIn: "24h" },
    );

    return reply
      .setCookie("opfun_session", token, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 86400,
        path: "/",
        secure: false,
      })
      .send({ walletAddress, expiresIn: 86400, dev: true });
  });

  // GET /auth/me/achievements
  app.get(
    "/auth/me/achievements",
    { preHandler: [verifyWalletToken] },
    async (request, reply) => {
      const { walletAddress } = request.walletSession!;

      const progress = await prisma.achievementProgress.findUnique({
        where: { walletAddress },
      });

      const p = progress ?? {
        walletAddress,
        calloutsCount: 0,
        tokensCreated: 0,
        updatedAt: new Date(),
      };

      const badges = BADGES.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        emoji: b.emoji,
        earned: b.check(p as AchievementProgress),
      }));

      return reply.send({
        walletAddress: p.walletAddress,
        calloutsCount: p.calloutsCount,
        tokensCreated: p.tokensCreated,
        badges,
      });
    },
  );

  // GET /auth/me
  app.get("/auth/me", async (request, reply) => {
    try {
      const cookies = request.cookies as Record<string, string | undefined>;
      const token = cookies["opfun_session"];
      if (!token) return reply.status(401).send({ error: "Not authenticated." });
      const payload = request.server.jwt.verify<WalletSession>(token);
      return reply.send({ walletAddress: payload.walletAddress, provider: payload.provider });
    } catch {
      return reply.status(401).send({ error: "Session expired." });
    }
  });
}
