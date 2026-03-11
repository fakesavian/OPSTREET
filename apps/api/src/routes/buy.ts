import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyWalletToken } from "../middleware/verifyWalletToken.js";
import { getLiveQuote, queueTradeSubmission } from "../services/marketIndexer.js";
import {
  DEFAULT_GAME_PAYMENT_TOKEN,
  GAME_PAYMENT_TOKENS,
  type GamePaymentToken,
} from "@opfun/shared";

type ConfirmBlocks = 1 | 2 | 3;
type OrderMode = "SWAP" | "SEND";

const BuyIntentSchema = z.object({
  walletAddress: z.string().min(10).optional(),
  amountSats: z.number().int().positive().max(100_000_000).optional(),
  paymentToken: z.enum(["PILL", "MOTO"]).optional(),
  paymentAmount: z.number().positive().max(100_000_000).optional(),
  tokenAmount: z.number().positive().max(1_000_000_000).optional(),
  side: z.enum(["BUY", "SELL"]).optional(),
  confirmBlocks: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  maxSlippageBps: z.number().int().min(10).max(4_000).optional(),
  mode: z.enum(["SWAP", "SEND"]).optional(),
});

const BuyConfirmSchema = z.object({
  walletAddress: z.string().min(10).optional(),
  signedPsbt: z.string().min(10).optional(),
  signedTxHex: z.string().min(10).optional(),
  txId: z.string().min(8).optional(),
  reservationId: z.string().min(3).optional(),
  paymentToken: z.enum(["PILL", "MOTO"]).optional(),
  paymentAmount: z.number().positive().optional(),
  tokenAmount: z.number().positive().optional(),
  amountSats: z.number().int().positive().optional(),
  side: z.enum(["BUY", "SELL"]).optional(),
  confirmBlocks: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  maxSlippageBps: z.number().int().min(10).max(4_000).optional(),
  mode: z.enum(["SWAP", "SEND"]).optional(),
});

const PAYMENT_TOKEN_TO_SATS: Record<GamePaymentToken, number> = {
  PILL: Number(process.env["PILL_SATS_RATE"] ?? 70_000),
  MOTO: Number(process.env["MOTO_SATS_RATE"] ?? 65_000),
};

function asSats(paymentToken: GamePaymentToken, paymentAmount: number): number {
  return Math.max(1, Math.round(paymentAmount * PAYMENT_TOKEN_TO_SATS[paymentToken]));
}

function asPaymentAmount(paymentToken: GamePaymentToken, sats: number): number {
  const raw = sats / PAYMENT_TOKEN_TO_SATS[paymentToken];
  return Math.max(0, Math.round(raw * 100_000_000) / 100_000_000);
}

function reorgFee(confirmBlocks: ConfirmBlocks): number {
  if (confirmBlocks === 1) return 2_000;
  if (confirmBlocks === 2) return 5_000;
  return 8_000;
}

function confirmationLabel(confirmBlocks: ConfirmBlocks): string {
  if (confirmBlocks === 1) return "Fast";
  if (confirmBlocks === 2) return "Recommended";
  return "Safe";
}

async function tryBroadcastOnchain(
  signedPayload: string,
  isPsbt: boolean,
): Promise<{ txId: string; method: string } | null> {
  try {
    const { broadcastTransaction } = await import("@opfun/opnet");
    const result = await broadcastTransaction(signedPayload, isPsbt);
    if (result.success && result.txId) {
      return { txId: result.txId, method: "opnet-provider" };
    }
    return null;
  } catch {
    return null;
  }
}

export async function buyRoutes(app: FastifyInstance) {
  // ── POST /projects/:id/buy-intent ───────────────────────────────────────
  // Returns a live quote from pool reserves. Wallet-signed trading only.
  app.post("/projects/:id/buy-intent", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = BuyIntentSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const sessionWallet = request.walletSession?.walletAddress;
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });
    if (parsed.data.walletAddress && parsed.data.walletAddress !== sessionWallet) {
      return reply.status(400).send({ error: "walletAddress mismatch with authenticated session." });
    }

    const walletAddress = sessionWallet;
    const paymentToken = parsed.data.paymentToken ?? DEFAULT_GAME_PAYMENT_TOKEN;
    const confirmBlocks = (parsed.data.confirmBlocks ?? 2) as ConfirmBlocks;
    const maxSlippageBps = parsed.data.maxSlippageBps ?? 4_000;
    const mode = (parsed.data.mode ?? "SWAP") as OrderMode;
    const side = (parsed.data.side ?? "BUY") as "BUY" | "SELL";

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return reply.status(404).send({ error: "Project not found" });

    if (project.launchStatus !== "LIVE") {
      return reply.status(409).send({
        error: "Pool not live yet",
        message: "This token does not have a live pool. Trading is unavailable until the pool is confirmed on-chain.",
        launchStatus: project.launchStatus ?? "DRAFT",
      });
    }

    // Get live quote from pool reserves
    let amountSats = parsed.data.amountSats ?? 0;
    let paymentAmount = parsed.data.paymentAmount ?? 0;

    if (side === "BUY") {
      if (!parsed.data.paymentAmount && !parsed.data.amountSats) {
        return reply.status(400).send({ error: "paymentAmount or amountSats is required for buy" });
      }
      if (parsed.data.paymentAmount) {
        amountSats = asSats(paymentToken, parsed.data.paymentAmount);
      } else {
        paymentAmount = asPaymentAmount(paymentToken, amountSats);
      }
    } else {
      if (!parsed.data.tokenAmount && !parsed.data.amountSats) {
        return reply.status(400).send({ error: "tokenAmount or amountSats is required for sell" });
      }
      if (parsed.data.amountSats) {
        amountSats = parsed.data.amountSats;
      }
    }

    const inputAmount = side === "BUY" ? amountSats : (parsed.data.tokenAmount ?? 0);
    const liveQuote = await getLiveQuote(id, side, inputAmount);

    if (!liveQuote) {
      return reply.status(503).send({
        error: "Quote unavailable",
        message: "Live pool reserves are unavailable and the indexed fallback is missing or stale.",
      });
    }

    const tokenAmount = side === "BUY" ? liveQuote.outputAmount : inputAmount;
    const outputSats = side === "SELL" ? liveQuote.outputAmount : amountSats;

    if (side === "SELL") {
      amountSats = outputSats;
      paymentAmount = asPaymentAmount(paymentToken, amountSats);
    }

    const networkFeeSats = Math.max(1_200, Math.round(amountSats * (mode === "SEND" ? 0.004 : 0.003)));
    const reorgProtectionFeeSats = reorgFee(confirmBlocks);
    const feeEstimateSats = networkFeeSats + reorgProtectionFeeSats;
    const totalRequiredSats = side === "BUY" ? amountSats + feeEstimateSats : Math.max(0, amountSats - feeEstimateSats);

    return reply.send({
      status: "LIVE_QUOTE",
      message:
        liveQuote.source === "live"
          ? "Live pool quote from on-chain reserves."
          : "Quote from recent indexed pool reserves.",
      quoteSource: liveQuote.source,
      snapshotAgeMs: liveQuote.snapshotAgeMs ?? null,

      projectId: project.id,
      ticker: project.ticker,
      contractAddress: project.contractAddress ?? null,
      market: {
        defaultPaymentToken: DEFAULT_GAME_PAYMENT_TOKEN,
        paymentToken,
        availablePaymentTokens: Object.values(GAME_PAYMENT_TOKENS),
      },

      quote: {
        side,
        mode,
        currentPriceSats: liveQuote.priceSats,
        priceImpactBps: liveQuote.priceImpactBps,
        effectivePriceSats: liveQuote.effectivePriceSats,
        paymentToken,
        paymentTokenContract: GAME_PAYMENT_TOKENS[paymentToken].contractAddress,
        paymentTokenToSats: PAYMENT_TOKEN_TO_SATS[paymentToken],
        requestedPaymentAmount: paymentAmount,
        requestedSats: amountSats,
        tokenAmount,
        estimatedTokenAmount: side === "BUY" ? tokenAmount : 0,
        estimatedPaymentAmount: side === "SELL" ? paymentAmount : 0,
        confirmBlocks,
        reorgProtectionLevel: confirmationLabel(confirmBlocks),
        reorgProtectionFeeSats,
        executionAfterBlocks: confirmBlocks,
        maxSlippageBps,
        networkFeeSats,
        feeEstimateSats,
        totalRequiredSats,
        slippageBps: maxSlippageBps,
      },

      psbtParams: {
        buyerAddress: walletAddress,
        contractAddress: project.contractAddress,
        paymentToken,
        paymentTokenContract: GAME_PAYMENT_TOKENS[paymentToken].contractAddress,
        paymentAmount,
        tokenAmount,
        amountSats,
        side,
        confirmBlocks,
        maxSlippageBps,
        mode,
        feeRate: 10,
        network: "opnetTestnet",
        utxoRequired: null,
        psbtHex: null,
      },

      instructions: [
        "Sign the swap transaction with your OP_NET wallet.",
        "Submit to broadcast on the testnet.",
        "Track confirmation on OP_SCAN after broadcast.",
      ],
    });
  });

  // ── POST /projects/:id/buy-confirm ──────────────────────────────────────
  // Submit a signed transaction for broadcast. Unsigned placeholder execution is not allowed.
  app.post("/projects/:id/buy-confirm", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = BuyConfirmSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const sessionWallet = request.walletSession?.walletAddress;
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });
    if (parsed.data.walletAddress && parsed.data.walletAddress !== sessionWallet) {
      return reply.status(400).send({ error: "walletAddress mismatch with authenticated session." });
    }

    const walletAddress = sessionWallet;
    const paymentToken = parsed.data.paymentToken ?? DEFAULT_GAME_PAYMENT_TOKEN;
    const confirmBlocks = (parsed.data.confirmBlocks ?? 2) as ConfirmBlocks;
    const maxSlippageBps = parsed.data.maxSlippageBps ?? 4_000;
    const mode = (parsed.data.mode ?? "SWAP") as OrderMode;
    const side = (parsed.data.side ?? "BUY") as "BUY" | "SELL";

    const paymentAmount = parsed.data.paymentAmount ?? 0;
    const amountSats = parsed.data.amountSats ?? 0;
    const tokenAmount = parsed.data.tokenAmount ?? 0;

    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, ticker: true, contractAddress: true, launchStatus: true },
    });
    if (!project) return reply.status(404).send({ error: "Project not found" });

    if (project.launchStatus !== "LIVE") {
      return reply.status(409).send({ error: "Pool not live — cannot confirm trade." });
    }

    // Require a signed transaction payload from the wallet.
    const signedPayload = parsed.data.signedTxHex ?? parsed.data.signedPsbt ?? "";
    if (!parsed.data.txId && !signedPayload) {
      return reply.status(400).send({
        error: "Wallet must provide txId, signedPsbt, or signedTxHex. Placeholder execution is no longer supported.",
      });
    }

    const networkFeeSats = Math.max(1_200, Math.round(amountSats * (mode === "SEND" ? 0.004 : 0.003)));
    const reorgProtectionFeeSats = reorgFee(confirmBlocks);
    const totalFeeSats = networkFeeSats + reorgProtectionFeeSats;

    const rawPayloadJson = signedPayload
      ? JSON.stringify({
          signedPsbt: parsed.data.signedPsbt ?? null,
          signedTxHex: parsed.data.signedTxHex ?? null,
        })
      : null;

    // If wallet already submitted the tx
    if (parsed.data.txId) {
      await queueTradeSubmission(project.id, {
        txId: parsed.data.txId,
        walletAddress,
        side,
        paymentToken,
        paymentAmount,
        amountSats,
        tokenAmount,
        rawPayloadJson,
      });

      return reply.status(201).send({
        status: "BROADCAST_SUBMITTED",
        message: "Transaction submitted. Awaiting on-chain confirmation.",
        projectId: project.id,
        ticker: project.ticker,
        walletAddress,
        side,
        mode,
        paymentToken,
        paymentTokenContract: GAME_PAYMENT_TOKENS[paymentToken].contractAddress,
        paymentAmount,
        tokenAmount,
        amountSats,
        confirmBlocks,
        maxSlippageBps,
        fees: { networkFeeSats, reorgProtectionFeeSats, totalFeeSats },
        txId: parsed.data.txId,
        reservation: {
          reservationId: parsed.data.txId,
          targetBlockOffset: confirmBlocks,
        },
      });
    }

    // Try to broadcast
    const broadcast = await tryBroadcastOnchain(
      signedPayload,
      Boolean(parsed.data.signedPsbt && !parsed.data.signedTxHex),
    );

    if (broadcast) {
      await queueTradeSubmission(project.id, {
        txId: broadcast.txId,
        walletAddress,
        side,
        paymentToken,
        paymentAmount,
        amountSats,
        tokenAmount,
        rawPayloadJson,
      });

      return reply.status(201).send({
        status: "BROADCAST_SUBMITTED",
        message: "Transaction broadcasted to testnet.",
        projectId: project.id,
        ticker: project.ticker,
        walletAddress,
        side,
        mode,
        paymentToken,
        paymentTokenContract: GAME_PAYMENT_TOKENS[paymentToken].contractAddress,
        paymentAmount,
        tokenAmount,
        amountSats,
        confirmBlocks,
        maxSlippageBps,
        fees: { networkFeeSats, reorgProtectionFeeSats, totalFeeSats },
        txId: broadcast.txId,
        broadcastMethod: broadcast.method,
        reservation: {
          reservationId: broadcast.txId,
          targetBlockOffset: confirmBlocks,
        },
      });
    }

    return reply.status(502).send({
      error: "Broadcast failed",
      message: "Signed payload accepted but RPC broadcast failed. Check OPNET_RPC_URL configuration.",
    });
  });
}
