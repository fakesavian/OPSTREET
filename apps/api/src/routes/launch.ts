/**
 * Wallet-native async launch pipeline.
 *
 * Replaces the admin-only deploy flow with a user-wallet-driven sequence:
 *   1. POST /projects/:id/launch-build    — scaffold + compile artifact
 *   2. GET  /projects/:id/launch-status   — poll current launch state
 *   3. POST /projects/:id/deploy-submit   — record signed deploy tx from wallet
 *   4. POST /projects/:id/pool-submit     — record signed pool creation tx from wallet
 *
 * The watcher confirms deploy + pool txs on-chain and advances the state.
 * Backend never custodies deploy keys — all signing happens in the user's wallet.
 */

import type { FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyWalletToken } from "../middleware/verifyWalletToken.js";
import { assertLaunchTransition } from "../launchMachine.js";
import { deployContract } from "@opfun/opnet";
import type { LaunchStatus } from "@opfun/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.resolve(__dirname, "../../../../packages/opnet/generated");

const BOB_TIMEOUT_MS = 60_000;
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms),
    ),
  ]);
}

const DeploySubmitSchema = z.object({
  deployTx: z.string().min(8, "deployTx must be at least 8 characters"),
  contractAddress: z.string().min(10, "contractAddress must be at least 10 characters"),
  buildHash: z.string().optional(),
});

const PoolSubmitSchema = z.object({
  poolTx: z.string().min(8, "poolTx must be at least 8 characters"),
  poolAddress: z.string().min(10, "poolAddress must be at least 10 characters"),
  poolBaseToken: z.string().min(2).optional(),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function currentLaunchStatus(project: { launchStatus: string | null }): LaunchStatus {
  return (project.launchStatus as LaunchStatus) ?? "DRAFT";
}

async function setLaunchStatus(
  projectId: string,
  from: LaunchStatus,
  to: LaunchStatus,
  data: Record<string, unknown> = {},
): Promise<void> {
  assertLaunchTransition(from, to);
  await prisma.project.update({
    where: { id: projectId },
    data: { launchStatus: to, ...data },
  });
}

async function failLaunch(projectId: string, from: LaunchStatus, error: string): Promise<void> {
  try {
    assertLaunchTransition(from, "FAILED");
  } catch {
    // Already in a terminal state — just record the error
    await prisma.project.update({
      where: { id: projectId },
      data: { launchError: error },
    });
    return;
  }
  await prisma.project.update({
    where: { id: projectId },
    data: { launchStatus: "FAILED", launchError: error },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeProject(p: any) {
  return {
    ...p,
    links: (() => {
      try { return JSON.parse(p.linksJson as string); } catch { return {}; }
    })(),
    riskCard: (() => {
      try { return p.riskCardJson ? JSON.parse(p.riskCardJson as string) : null; } catch { return null; }
    })(),
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

export async function launchRoutes(app: FastifyInstance) {

  // ─── 1. POST /projects/:id/launch-build ───────────────────────────────────
  // Kicks off the build pipeline: scaffold + compile the OP-20 artifact.
  // Requires authenticated wallet + project in READY status.
  // launchStatus: DRAFT → BUILDING → AWAITING_WALLET_DEPLOY
  app.post<{ Params: { id: string } }>(
    "/projects/:id/launch-build",
    { preHandler: [verifyWalletToken] },
    async (request, reply) => {
      const sessionWallet = request.walletSession?.walletAddress;
      if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });

      const project = await prisma.project.findUnique({ where: { id: request.params.id } });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      // Project must have passed audit (READY or LAUNCHED status)
      if (project.status !== "READY" && project.status !== "LAUNCHED" && project.status !== "DEPLOY_PACKAGE_READY") {
        return reply.status(409).send({
          error: `Cannot build from project status '${project.status}'. Run checks first.`,
        });
      }

      const current = currentLaunchStatus(project);

      // Allow rebuild from DRAFT or FAILED
      if (current !== "DRAFT" && current !== "FAILED") {
        return reply.status(409).send({
          error: `Cannot start build from launch status '${current}'.`,
          hint: current === "AWAITING_WALLET_DEPLOY"
            ? "Build already complete — sign and submit the deploy transaction."
            : undefined,
        });
      }

      // Reset to DRAFT first if retrying from FAILED
      if (current === "FAILED") {
        await setLaunchStatus(project.id, "FAILED", "DRAFT", { launchError: null });
      }

      // Transition DRAFT → BUILDING
      await setLaunchStatus(project.id, "DRAFT", "BUILDING", { launchError: null });

      // Return 202 immediately — build runs async
      reply.status(202).send({
        message: "Build started",
        projectId: project.id,
        launchStatus: "BUILDING",
      });

      // Run build in background
      runBuild(project, app).catch((err: unknown) => {
        app.log.error(err, `launch-build failed for project ${project.id}`);
      });
    },
  );

  // ─── 2. GET /projects/:id/launch-status ───────────────────────────────────
  // Returns the current launch state + all relevant fields.
  app.get<{ Params: { id: string } }>(
    "/projects/:id/launch-status",
    async (request, reply) => {
      const project = await prisma.project.findUnique({
        where: { id: request.params.id },
        include: {
          checkRuns: { orderBy: { createdAt: "desc" }, take: 5, where: { type: "DEPLOY" } },
        },
      });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      return reply.send({
        projectId: project.id,
        ticker: project.ticker,
        status: project.status,
        launchStatus: project.launchStatus ?? "DRAFT",
        launchError: project.launchError ?? null,
        contractAddress: project.contractAddress ?? null,
        deployTx: project.deployTx ?? null,
        buildHash: project.buildHash ?? null,
        poolAddress: project.poolAddress ?? null,
        poolBaseToken: project.poolBaseToken ?? null,
        poolTx: project.poolTx ?? null,
        liveAt: project.liveAt?.toISOString() ?? null,
        checkRuns: project.checkRuns,
      });
    },
  );

  // ─── 3. POST /projects/:id/deploy-submit ──────────────────────────────────
  // User's wallet signed and submitted the deploy tx. Record it.
  // launchStatus: AWAITING_WALLET_DEPLOY → DEPLOY_SUBMITTED
  app.post<{ Params: { id: string } }>(
    "/projects/:id/deploy-submit",
    { preHandler: [verifyWalletToken] },
    async (request, reply) => {
      const sessionWallet = request.walletSession?.walletAddress;
      if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });

      const parsed = DeploySubmitSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
      }

      const project = await prisma.project.findUnique({ where: { id: request.params.id } });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      const current = currentLaunchStatus(project);
      if (current !== "AWAITING_WALLET_DEPLOY") {
        return reply.status(409).send({
          error: `Cannot submit deploy from launch status '${current}'.`,
          hint: current === "DRAFT" || current === "FAILED"
            ? "Start a build first with POST /projects/:id/launch-build."
            : undefined,
        });
      }

      try {
        await setLaunchStatus(project.id, "AWAITING_WALLET_DEPLOY", "DEPLOY_SUBMITTED", {
          deployTx: parsed.data.deployTx,
          contractAddress: parsed.data.contractAddress,
          ...(parsed.data.buildHash ? { buildHash: parsed.data.buildHash } : {}),
        });
      } catch (err) {
        return reply.status(409).send({
          error: err instanceof Error ? err.message : "Transition failed",
        });
      }

      await prisma.checkRun.create({
        data: {
          projectId: project.id,
          type: "DEPLOY",
          status: "PENDING",
          outputJson: JSON.stringify({
            deployTx: parsed.data.deployTx,
            contractAddress: parsed.data.contractAddress,
            submittedBy: sessionWallet,
            submittedAt: new Date().toISOString(),
          }),
        },
      });

      const updated = await prisma.project.findUnique({ where: { id: project.id } });
      return reply.status(201).send(serializeProject(updated));
    },
  );

  // ─── 3b. GET /projects/:id/pool-params ─────────────────────────────────────
  // Returns parameters needed to create a Motoswap pool for this token.
  app.get<{ Params: { id: string } }>(
    "/projects/:id/pool-params",
    { preHandler: [verifyWalletToken] },
    async (request, reply) => {
      const project = await prisma.project.findUnique({ where: { id: request.params.id } });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      const current = currentLaunchStatus(project);
      if (current !== "AWAITING_POOL_CREATE") {
        return reply.status(409).send({
          error: `Pool creation not available in launch status '${current}'.`,
        });
      }

      if (!project.contractAddress) {
        return reply.status(409).send({ error: "Contract not deployed yet." });
      }

      const factoryAddress = process.env["MOTOSWAP_FACTORY_ADDRESS"] ?? "";
      const routerAddress = process.env["MOTOSWAP_ROUTER_ADDRESS"] ?? "";

      if (!factoryAddress) {
        return reply.status(503).send({ error: "MOTOSWAP_FACTORY_ADDRESS not configured." });
      }

      return reply.send({
        projectId: project.id,
        ticker: project.ticker,
        contractAddress: project.contractAddress,
        factoryAddress,
        routerAddress,
        liquidityToken: project.liquidityToken ?? "MOTO",
        liquidityAmount: project.liquidityAmount ?? "0",
        instructions: [
          "Use the Motoswap Factory contract to call createPair(tokenA, tokenB).",
          "Then call addLiquidity on the Router with your desired amounts.",
          "Submit the pool transaction ID and pool address via POST /projects/:id/pool-submit.",
        ],
      });
    },
  );

  // ─── 3c. POST /projects/:id/pool-create ─────────────────────────────────────
  // Prepares a pool creation interaction buffer for wallet signing.
  // Returns the offline buffer hex that the frontend passes to the wallet.
  app.post<{ Params: { id: string } }>(
    "/projects/:id/pool-create",
    { preHandler: [verifyWalletToken] },
    async (request, reply) => {
      const sessionWallet = request.walletSession?.walletAddress;
      if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });

      const project = await prisma.project.findUnique({ where: { id: request.params.id } });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      const current = currentLaunchStatus(project);
      if (current !== "AWAITING_POOL_CREATE") {
        return reply.status(409).send({
          error: `Pool creation not available in launch status '${current}'.`,
        });
      }

      if (!project.contractAddress) {
        return reply.status(409).send({ error: "Contract not deployed yet." });
      }

      const baseTokenAddress = process.env["WBTC_CONTRACT_ADDRESS"] ?? "";
      if (!baseTokenAddress) {
        return reply.status(503).send({ error: "WBTC_CONTRACT_ADDRESS not configured for pool base token." });
      }

      try {
        const { preparePoolCreation } = await import("@opfun/opnet");
        const intent = await preparePoolCreation(
          sessionWallet,
          baseTokenAddress,
          project.contractAddress,
        );

        return reply.send({
          projectId: project.id,
          ticker: project.ticker,
          poolAddress: intent.poolAddress,
          factoryAddress: intent.factoryAddress,
          interaction: intent.interaction,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("already exists")) {
          return reply.status(409).send({ error: message });
        }
        return reply.status(502).send({
          error: "Pool creation simulation failed",
          detail: message,
        });
      }
    },
  );

  // ─── 3d. POST /projects/:id/pool-broadcast ────────────────────────────────
  // Receives the wallet-signed pool creation tx and broadcasts it.
  // Transitions: AWAITING_POOL_CREATE → POOL_SUBMITTED
  app.post<{ Params: { id: string } }>(
    "/projects/:id/pool-broadcast",
    { preHandler: [verifyWalletToken] },
    async (request, reply) => {
      const sessionWallet = request.walletSession?.walletAddress;
      if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });

      const body = request.body as {
        interactionTransactionRaw?: string;
        fundingTransactionRaw?: string;
        poolAddress?: string;
      };

      if (!body.interactionTransactionRaw) {
        return reply.status(400).send({ error: "interactionTransactionRaw is required." });
      }
      if (!body.poolAddress) {
        return reply.status(400).send({ error: "poolAddress is required." });
      }

      const project = await prisma.project.findUnique({ where: { id: request.params.id } });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      const current = currentLaunchStatus(project);
      if (current !== "AWAITING_POOL_CREATE") {
        return reply.status(409).send({
          error: `Pool broadcast not available in launch status '${current}'.`,
        });
      }

      try {
        const { broadcastSignedInteraction } = await import("@opfun/opnet");
        const result = await broadcastSignedInteraction({
          interactionTransactionRaw: body.interactionTransactionRaw,
          fundingTransactionRaw: body.fundingTransactionRaw ?? null,
        });

        if (!result.success || !result.txId) {
          return reply.status(502).send({
            error: "Pool creation broadcast failed",
            detail: result.error ?? "No transaction ID returned.",
          });
        }

        // Record pool submission and transition state
        await setLaunchStatus(project.id, "AWAITING_POOL_CREATE", "POOL_SUBMITTED", {
          poolTx: result.txId,
          poolAddress: body.poolAddress,
          poolBaseToken: project.liquidityToken ?? "MOTO",
        });

        const updated = await prisma.project.findUnique({ where: { id: project.id } });
        return reply.status(201).send(serializeProject(updated));
      } catch (err) {
        return reply.status(502).send({
          error: "Pool broadcast failed",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // ─── 4. POST /projects/:id/pool-submit ────────────────────────────────────
  // User's wallet signed and submitted the pool/liquidity creation tx.
  // launchStatus: AWAITING_POOL_CREATE → POOL_SUBMITTED
  app.post<{ Params: { id: string } }>(
    "/projects/:id/pool-submit",
    { preHandler: [verifyWalletToken] },
    async (request, reply) => {
      const sessionWallet = request.walletSession?.walletAddress;
      if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });

      const parsed = PoolSubmitSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
      }

      const project = await prisma.project.findUnique({ where: { id: request.params.id } });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      const current = currentLaunchStatus(project);
      if (current !== "AWAITING_POOL_CREATE") {
        return reply.status(409).send({
          error: `Cannot submit pool from launch status '${current}'.`,
          hint: current === "DEPLOY_CONFIRMED"
            ? "Transition to AWAITING_POOL_CREATE first."
            : undefined,
        });
      }

      try {
        await setLaunchStatus(project.id, "AWAITING_POOL_CREATE", "POOL_SUBMITTED", {
          poolTx: parsed.data.poolTx,
          poolAddress: parsed.data.poolAddress,
          poolBaseToken: parsed.data.poolBaseToken ?? project.liquidityToken ?? "MOTO",
        });
      } catch (err) {
        return reply.status(409).send({
          error: err instanceof Error ? err.message : "Transition failed",
        });
      }

      const updated = await prisma.project.findUnique({ where: { id: project.id } });
      return reply.status(201).send(serializeProject(updated));
    },
  );
  // ─── 5. POST /projects/:id/confirm-deploy-onchain ─────────────────────────
  // Called by the watcher (admin-gated) when deploy tx is confirmed on-chain.
  app.post<{ Params: { id: string } }>(
    "/projects/:id/confirm-deploy-onchain",
    async (request, reply) => {
      const adminSecret = request.headers["x-admin-secret"];
      const expected = process.env["ADMIN_SECRET"] ?? "dev-secret-change-me";
      if (adminSecret !== expected) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const body = request.body as { contractAddress?: string };
      if (!body.contractAddress) {
        return reply.status(400).send({ error: "contractAddress required" });
      }

      const ok = await confirmDeployOnChain(request.params.id, body.contractAddress);
      if (!ok) {
        return reply.status(409).send({ error: "Cannot confirm deploy — check current launch status" });
      }
      return reply.send({ ok: true, launchStatus: "AWAITING_POOL_CREATE" });
    },
  );

  // ─── 6. POST /projects/:id/confirm-pool-onchain ──────────────────────────
  // Called by the watcher (admin-gated) when pool tx is confirmed on-chain.
  app.post<{ Params: { id: string } }>(
    "/projects/:id/confirm-pool-onchain",
    async (request, reply) => {
      const adminSecret = request.headers["x-admin-secret"];
      const expected = process.env["ADMIN_SECRET"] ?? "dev-secret-change-me";
      if (adminSecret !== expected) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const body = request.body as { poolAddress?: string };
      if (!body.poolAddress) {
        return reply.status(400).send({ error: "poolAddress required" });
      }

      const ok = await confirmPoolOnChain(request.params.id, body.poolAddress);
      if (!ok) {
        return reply.status(409).send({ error: "Cannot confirm pool — check current launch status" });
      }
      return reply.send({ ok: true, launchStatus: "LIVE" });
    },
  );

  // ─── 7. POST /projects/:id/pool-snapshot ──────────────────────────────
  // Called by the watcher/indexer to record pool reserve snapshots.
  app.post<{ Params: { id: string } }>(
    "/projects/:id/pool-snapshot",
    async (request, reply) => {
      const adminSecret = request.headers["x-admin-secret"];
      const expected = process.env["ADMIN_SECRET"] ?? "dev-secret-change-me";
      if (adminSecret !== expected) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const body = request.body as {
        reserveBase?: number;
        reserveQuote?: number;
        blockHeight?: number;
      };
      if (typeof body.reserveBase !== "number" || typeof body.reserveQuote !== "number") {
        return reply.status(400).send({ error: "reserveBase and reserveQuote required" });
      }

      const { recordPoolSnapshot } = await import("../services/marketIndexer.js");
      await recordPoolSnapshot(request.params.id, {
        reserveBase: body.reserveBase,
        reserveQuote: body.reserveQuote,
        blockHeight: body.blockHeight ?? 0,
      });

      return reply.send({ ok: true });
    },
  );

  // ─── 8. GET /projects/:id/candles ─────────────────────────────────────
  // Returns live candle data for charting.
  app.get<{ Params: { id: string }; Querystring: { timeframe?: string; limit?: string } }>(
    "/projects/:id/candles",
    async (request, reply) => {
      const { getCandles } = await import("../services/marketIndexer.js");
      const timeframe = request.query.timeframe ?? "1h";
      const limit = Math.min(Math.max(Number(request.query.limit ?? 100), 1), 500);

      const candles = await getCandles(request.params.id, timeframe, limit);
      return reply.send({ projectId: request.params.id, timeframe, candles });
    },
  );

  // ─── 9. GET /projects/:id/market-state ────────────────────────────────
  // Returns current market state for a project.
  app.get<{ Params: { id: string } }>(
    "/projects/:id/market-state",
    async (request, reply) => {
      const state = await prisma.projectMarketState.findUnique({
        where: { projectId: request.params.id },
      });

      if (!state) {
        return reply.send({
          projectId: request.params.id,
          available: false,
          currentPriceSats: 0,
          volume24hSats: 0,
          tradeCount24h: 0,
          reserveBase: 0,
          reserveQuote: 0,
          lastTradeAt: null,
        });
      }

      return reply.send({
        projectId: request.params.id,
        available: state.reserveBase > 0 && state.reserveQuote > 0,
        currentPriceSats: state.currentPriceSats,
        volume24hSats: state.volume24hSats,
        tradeCount24h: state.tradeCount24h,
        reserveBase: state.reserveBase,
        reserveQuote: state.reserveQuote,
        lastTradeAt: state.lastTradeAt?.toISOString() ?? null,
      });
    },
  );

  // 10. GET /trade-submissions/pending
  // Watcher queue of wallet-submitted trades awaiting confirmation and indexing.
  app.get(
    "/trade-submissions/pending",
    async (request, reply) => {
      const adminSecret = request.headers["x-admin-secret"];
      const expected = process.env["ADMIN_SECRET"] ?? "dev-secret-change-me";
      if (adminSecret !== expected) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const limit = Math.min(Math.max(Number((request.query as { limit?: string }).limit ?? 100), 1), 500);
      const { listPendingTradeSubmissions } = await import("../services/marketIndexer.js");
      const items = await listPendingTradeSubmissions(limit);

      return reply.send({
        items: items.map((item) => ({
          ...item,
          submittedAt: item.submittedAt.toISOString(),
        })),
      });
    },
  );

  // 11. POST /projects/:id/trade-submissions/:txId/confirm
  // Watcher confirms a submitted trade only after it has a confirmed live event payload.
  app.post<{ Params: { id: string; txId: string } }>(
    "/projects/:id/trade-submissions/:txId/confirm",
    async (request, reply) => {
      const adminSecret = request.headers["x-admin-secret"];
      const expected = process.env["ADMIN_SECRET"] ?? "dev-secret-change-me";
      if (adminSecret !== expected) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const body = request.body as {
        walletAddress?: string;
        side?: "BUY" | "SELL";
        amountSats?: number;
        tokenAmount?: number;
        blockHeight?: number;
        confirmedAt?: string;
      };

      const queued = await prisma.tradeSubmission.findUnique({
        where: { txId: request.params.txId },
        select: {
          walletAddress: true,
          side: true,
        },
      });

      const walletAddress = body.walletAddress ?? queued?.walletAddress;
      const side = body.side ?? (queued?.side as "BUY" | "SELL" | undefined);
      if (!walletAddress || !side) {
        return reply.status(400).send({ error: "walletAddress and side are required to confirm a trade" });
      }
      if (typeof body.amountSats !== "number" || typeof body.tokenAmount !== "number") {
        return reply.status(400).send({ error: "amountSats and tokenAmount must come from the confirmed live event" });
      }

      const { confirmTradeSubmission } = await import("../services/marketIndexer.js");
      const fillId = await confirmTradeSubmission(request.params.id, {
        txId: request.params.txId,
        walletAddress,
        side,
        amountSats: body.amountSats,
        tokenAmount: body.tokenAmount,
        blockHeight: body.blockHeight ?? 0,
        confirmedAt: body.confirmedAt ? new Date(body.confirmedAt) : new Date(),
      });

      return reply.send({ ok: true, fillId, status: "CONFIRMED" });
    },
  );

  // 12. POST /projects/:id/trade-submissions/:txId/fail
  // Watcher marks a submitted trade as failed after a hard confirmation/indexing error.
  app.post<{ Params: { id: string; txId: string } }>(
    "/projects/:id/trade-submissions/:txId/fail",
    async (request, reply) => {
      const adminSecret = request.headers["x-admin-secret"];
      const expected = process.env["ADMIN_SECRET"] ?? "dev-secret-change-me";
      if (adminSecret !== expected) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const body = request.body as { error?: string };
      const { failTradeSubmission } = await import("../services/marketIndexer.js");
      const ok = await failTradeSubmission(
        request.params.id,
        request.params.txId,
        body.error ?? "Watcher could not confirm or index the live trade",
      );

      if (!ok) {
        return reply.status(404).send({ error: "Trade submission not found" });
      }

      return reply.send({ ok: true, status: "FAILED" });
    },
  );
}

// ── Background build pipeline ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runBuild(project: any, app: FastifyInstance): Promise<void> {
  const projectId = project.id as string;

  try {
    const output = await withTimeout(
      deployContract({
        projectId,
        slug: project.slug as string,
        name: project.name as string,
        ticker: project.ticker as string,
        decimals: project.decimals as number,
        maxSupply: project.maxSupply as string,
        iconUrl: project.iconUrl as string | undefined,
        buildHash: (project.buildHash as string) ?? "",
        liquidityToken: (project as Record<string, unknown>)["liquidityToken"] as
          | "TBTC" | "MOTO" | "PILL" | undefined,
        liquidityAmount: (project as Record<string, unknown>)["liquidityAmount"] as string | undefined,
        generatedDir: path.join(GENERATED_DIR, projectId),
      }),
      BOB_TIMEOUT_MS,
      "deployContract",
    );

    // Re-fetch to confirm we're still in BUILDING
    const fresh = await prisma.project.findUnique({ where: { id: projectId } });
    if (!fresh || fresh.launchStatus !== "BUILDING") {
      app.log.warn(`[launch-build] Project ${projectId} no longer in BUILDING state, skipping update`);
      return;
    }

    if (output.status === "FAILED") {
      await failLaunch(projectId, "BUILDING", output.error ?? "Build failed");
      return;
    }

    // PACKAGE_READY or COMPILED — both mean artifact is ready for wallet deploy
    // Note: we do NOT auto-deploy. The user's wallet must sign.
    await setLaunchStatus(projectId, "BUILDING", "AWAITING_WALLET_DEPLOY", {
      buildHash: output.buildHash,
    });

    await prisma.checkRun.create({
      data: {
        projectId,
        type: "DEPLOY",
        status: output.wasmPath ? "OK" : "WARN",
        outputJson: JSON.stringify({
          deployStatus: output.status,
          wasmPath: output.wasmPath,
          packageDir: output.packageDir,
          compiled: !!output.wasmPath,
        }),
      },
    });

    app.log.info(`[launch-build] Project ${projectId} ready for wallet deploy`);
  } catch (err) {
    app.log.error(err, `[launch-build] Build error for ${projectId}`);

    const fresh = await prisma.project.findUnique({ where: { id: projectId } });
    if (fresh?.launchStatus === "BUILDING") {
      await failLaunch(projectId, "BUILDING", err instanceof Error ? err.message : "Build error");
    }
  }
}

// ── Watcher confirmation helpers (exported for watcher use) ──────────────────

/**
 * Called by the watcher when a deploy tx is confirmed on-chain.
 * Transitions: DEPLOY_SUBMITTED → DEPLOY_CONFIRMED → AWAITING_POOL_CREATE
 */
export async function confirmDeployOnChain(
  projectId: string,
  contractAddress: string,
): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;

  const current = currentLaunchStatus(project);
  if (current !== "DEPLOY_SUBMITTED") return false;

  try {
    await setLaunchStatus(projectId, "DEPLOY_SUBMITTED", "DEPLOY_CONFIRMED", {
      contractAddress,
      status: "LAUNCHED", // also update the legacy ProjectStatus
    });

    // Update risk card integrity
    if (project.riskCardJson) {
      try {
        const riskCard = JSON.parse(project.riskCardJson as string) as {
          releaseIntegrity: { contractMatchesArtifact: boolean | null };
        };
        riskCard.releaseIntegrity.contractMatchesArtifact = true;
        await prisma.project.update({
          where: { id: projectId },
          data: { riskCardJson: JSON.stringify(riskCard) },
        });
      } catch { /* ignore */ }
    }

    // Immediately advance to AWAITING_POOL_CREATE
    await setLaunchStatus(projectId, "DEPLOY_CONFIRMED", "AWAITING_POOL_CREATE");

    return true;
  } catch {
    return false;
  }
}

/**
 * Called by the watcher when a pool creation tx is confirmed on-chain.
 * Transitions: POOL_SUBMITTED → LIVE
 */
export async function confirmPoolOnChain(
  projectId: string,
  poolAddress: string,
): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;

  const current = currentLaunchStatus(project);
  if (current !== "POOL_SUBMITTED") return false;

  try {
    await setLaunchStatus(projectId, "POOL_SUBMITTED", "LIVE", {
      poolAddress,
      liveAt: new Date(),
    });

    // Create pool metadata record
    if (project.poolTx) {
      await prisma.poolMetadata.upsert({
        where: { projectId },
        create: {
          projectId,
          poolAddress,
          baseToken: project.poolBaseToken ?? project.liquidityToken ?? "MOTO",
          quoteToken: project.ticker,
          createdTx: project.poolTx,
        },
        update: {
          poolAddress,
          baseToken: project.poolBaseToken ?? project.liquidityToken ?? "MOTO",
        },
      });
    }

    return true;
  } catch {
    return false;
  }
}
