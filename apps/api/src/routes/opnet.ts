import type { FastifyInstance } from "fastify";
import {
  fetchBlockStatus,
  fetchTokenPrices,
  fetchBtcUsd,
  type BlockStatusData,
  type PricesData,
} from "../services/opnetProvider.js";

// ── In-memory caches ───────────────────────────────────────────────────
let blockCache: { data: BlockStatusData; ts: number } | null = null;
let priceCache: { data: PricesData; ts: number } | null = null;
let btcCache: { usd: number; ts: number } | null = null;

const BLOCK_CACHE_TTL = 5_000;
const PRICE_CACHE_TTL = 30_000;
const BTC_CACHE_TTL = 60_000;

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
      return reply.status(503).send({
        error: "Block status unavailable",
        upstream: err instanceof Error ? err.message : "Unknown error",
      });
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
    const now = Date.now();
    if (btcCache && now - btcCache.ts < BTC_CACHE_TTL) {
      return reply.send({ usd: btcCache.usd, timestamp: new Date().toISOString() });
    }

    try {
      const usd = await fetchBtcUsd();
      btcCache = { usd, ts: now };
      return reply.send({ usd, timestamp: new Date().toISOString() });
    } catch (err) {
      app.log.warn({ err }, "btc-price upstream unavailable");
      return reply.status(503).send({
        error: "BTC price unavailable",
        upstream: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
