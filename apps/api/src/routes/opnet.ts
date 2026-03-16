import type { FastifyInstance } from "fastify";
import { getRuntimeDiagnostics } from "@opfun/opnet";
import {
  fetchBlockStatus,
  fetchTokenPrices,
  fetchBtcUsd,
  fetchAddressBalance,
  type BlockStatusData,
  type PricesData,
} from "../services/opnetProvider.js";
import { prisma } from "../db.js";
import { MARKET_CONFIRMATION_BLOCKS } from "../services/marketIndexer.js";

let blockCache: { data: BlockStatusData; ts: number } | null = null;
let priceCache: { data: PricesData; ts: number } | null = null;
let btcCache: { usd: number; ts: number } | null = null;
let diagnosticsCache: { data: unknown; ts: number } | null = null;
const balanceCache = new Map<string, { data: unknown; ts: number }>();

const BLOCK_CACHE_TTL = 5_000;
const PRICE_CACHE_TTL = 30_000;
const BTC_CACHE_TTL = 60_000;
const DIAGNOSTICS_CACHE_TTL = 10_000;
const BALANCE_CACHE_TTL = 15_000;

async function getCachedBtcUsd(): Promise<number> {
  const now = Date.now();
  if (btcCache && now - btcCache.ts < BTC_CACHE_TTL) {
    return btcCache.usd;
  }

  const usd = await fetchBtcUsd();
  btcCache = { usd, ts: now };
  return usd;
}

export async function opnetRoutes(app: FastifyInstance) {
  app.get("/opnet/block-status", async (_req, reply) => {
    const now = Date.now();
    if (blockCache && now - blockCache.ts < BLOCK_CACHE_TTL) {
      return reply.send(blockCache.data);
    }

    try {
      const data = await fetchBlockStatus();
      blockCache = { data, ts: now };
      return reply.send(data);
    } catch (err) {
      app.log.warn({ err }, "block-status upstream unavailable");
      // Return a degraded 200 (not 503) so the frontend can distinguish
      // "RPC offline" from "API offline". The BlockTimerBar checks degraded flag.
      const degraded: BlockStatusData = {
        network: "opnet-testnet",
        blockHeight: blockCache?.data.blockHeight ?? 0,
        nextBlockEstimateMs: -1,
        timestamp: new Date().toISOString(),
        source: "rpc",
        degraded: true,
      };
      return reply.send(degraded);
    }
  });

  app.get("/opnet/prices", async (_req, reply) => {
    const now = Date.now();
    if (priceCache && now - priceCache.ts < PRICE_CACHE_TTL) {
      return reply.send(priceCache.data);
    }

    try {
      const data = await fetchTokenPrices();
      priceCache = { data, ts: now };
      return reply.send(data);
    } catch (err) {
      app.log.warn({ err }, "prices upstream unavailable");
      return reply.status(503).send({
        error: "Price data unavailable",
        upstream: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  app.get("/opnet/btc-price", async (_req, reply) => {
    try {
      const usd = await getCachedBtcUsd();
      return reply.send({ usd, timestamp: new Date().toISOString() });
    } catch (err) {
      app.log.warn({ err }, "btc-price upstream unavailable");
      return reply.status(503).send({
        error: "BTC price unavailable",
        upstream: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  app.get<{ Params: { address: string } }>("/opnet/address-balance/:address", async (request, reply) => {
    const address = request.params.address?.trim() ?? "";
    if (!address) {
      return reply.status(400).send({ error: "Wallet address is required." });
    }

    const now = Date.now();
    const cacheKey = address.toLowerCase();
    const cached = balanceCache.get(cacheKey);
    if (cached && now - cached.ts < BALANCE_CACHE_TTL) {
      return reply.send(cached.data);
    }

    try {
      const [balance, btcUsd] = await Promise.all([
        fetchAddressBalance(address),
        getCachedBtcUsd(),
      ]);
      const data = {
        ...balance,
        btcUsd,
        usd: (balance.totalSats / 100_000_000) * btcUsd,
        timestamp: new Date().toISOString(),
      };
      balanceCache.set(cacheKey, { data, ts: now });
      return reply.send(data);
    } catch (err) {
      app.log.warn({ err, address }, "address balance upstream unavailable");
      return reply.status(503).send({
        error: "Address balance unavailable",
        upstream: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  app.get("/opnet/diagnostics", async (_req, reply) => {
    const now = Date.now();
    if (diagnosticsCache && now - diagnosticsCache.ts < DIAGNOSTICS_CACHE_TTL) {
      return reply.send(diagnosticsCache.data);
    }

    try {
      const [runtime, latestPoolSnapshot, latestTradeFill] = await Promise.all([
        getRuntimeDiagnostics(),
        prisma.poolSnapshot.findFirst({
          orderBy: [{ blockHeight: "desc" }, { recordedAt: "desc" }],
          select: { blockHeight: true, recordedAt: true },
        }),
        prisma.tradeFill.findFirst({
          orderBy: [{ blockHeight: "desc" }, { confirmedAt: "desc" }],
          select: { blockHeight: true, confirmedAt: true },
        }),
      ]);

      const latestIndexedBlock = Math.max(
        latestPoolSnapshot?.blockHeight ?? 0,
        latestTradeFill?.blockHeight ?? 0,
        0,
      ) || null;
      const latestIndexedAtDate =
        [latestPoolSnapshot?.recordedAt, latestTradeFill?.confirmedAt]
          .filter((value): value is Date => value instanceof Date)
          .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

      const data = {
        timestamp: runtime.timestamp,
        runtimeMode:
          process.env["VERCEL_ENV"] === "preview"
            ? "preview"
            : process.env["NODE_ENV"] === "production"
              ? "production"
              : "development",
        network: runtime.network,
        rpcUrl: runtime.rpcUrl,
        provider: runtime.provider,
        backendApiTarget:
          process.env["APP_URL"]?.trim() ||
          process.env["CORS_ORIGIN"]?.trim() ||
          null,
        contracts: runtime.contracts,
        readiness: runtime.readiness,
        indexer: {
          latestIndexedBlock,
          latestIndexedAt: latestIndexedAtDate?.toISOString() ?? null,
          liveBlockLag:
            latestIndexedBlock !== null && typeof runtime.provider.blockHeight === "number"
              ? Math.max(runtime.provider.blockHeight - latestIndexedBlock, 0)
              : null,
          confirmationsRequired: MARKET_CONFIRMATION_BLOCKS,
        },
        walletCapabilities: {
          auth: true,
          launch: runtime.readiness.poolCreation,
          trade: runtime.readiness.liveReads,
          shop: runtime.readiness.shopMint,
        },
      };

      diagnosticsCache = { data, ts: now };
      return reply.send(data);
    } catch (err) {
      app.log.warn({ err }, "OP_NET diagnostics unavailable");
      return reply.status(503).send({
        error: "OP_NET diagnostics unavailable",
        upstream: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
