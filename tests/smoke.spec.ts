import { test, expect, type APIRequestContext } from "@playwright/test";
import { createRequire } from "node:module";

const API_BASE = "http://localhost:3001";
const ADMIN_SECRET = "dev-secret-change-me";

process.env["DATABASE_URL"] = "file:./smoke-test.db";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../apps/api/node_modules/@prisma/client") as typeof import("../apps/api/node_modules/@prisma/client");
const prisma = new PrismaClient();

function uniqueSeed(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeWallet(tag: string): string {
  return `tb1p${uniqueSeed(tag).replace(/[^a-z0-9]/gi, "").toLowerCase()}`.slice(0, 62);
}

function projectPayload(seed: string) {
  const ticker = `T${seed}`.replace(/[^A-Z0-9]/g, "").slice(0, 8) || "TKN";
  return {
    name: `Smoke ${seed}`,
    ticker,
    decimals: 8,
    maxSupply: "1000000000",
    description: "Smoke test project for automated validation coverage.",
    links: {},
    liquidityToken: "MOTO",
    liquidityAmount: "100",
    liquidityFundingTx: `liq-${uniqueSeed(seed)}`,
  };
}

async function createAuthedContext(request: APIRequestContext, walletAddress: string): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: API_BASE });
  const session = await ctx.post("/auth/dev-session", { data: { walletAddress } });
  expect(session.ok()).toBeTruthy();
  return ctx;
}

async function createReadyProjectRecord(seed: string) {
  const project = await prisma.project.create({
    data: {
      slug: `smoke-${uniqueSeed(seed)}`.toLowerCase(),
      name: `Smoke ${seed}`,
      ticker: `S${seed}`.replace(/[^A-Z0-9]/g, "").slice(0, 8) || "SMOKE",
      decimals: 8,
      maxSupply: "1000000000",
      description: "Smoke-ready project staged for launch and trade coverage.",
      linksJson: "{}",
      status: "READY",
      network: "testnet",
      liquidityToken: "MOTO",
      liquidityAmount: "100",
      liquidityFundingTx: `liq-${uniqueSeed(seed)}`,
      riskScore: 0,
      launchStatus: "DRAFT",
      launchError: null,
    },
  });

  return project;
}

async function stageProjectLive(
  request: APIRequestContext,
  authed: APIRequestContext,
  projectId: string,
) {
  const launchBuild = await authed.post(`/projects/${projectId}/launch-build`);
  expect(launchBuild.status()).toBe(202);

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: "READY",
      launchStatus: "AWAITING_WALLET_DEPLOY",
      buildHash: `smoke-build-${uniqueSeed("hash")}`,
    },
  });

  const contractAddress = `contract-${uniqueSeed("deploy")}`;
  const deployTx = `deploy-${uniqueSeed("tx")}`;
  const deploySubmit = await authed.post(`/projects/${projectId}/deploy-submit`, {
    data: {
      deployTx,
      contractAddress,
      buildHash: `smoke-build-${uniqueSeed("deploy")}`,
    },
  });
  expect(deploySubmit.status()).toBe(201);

  const confirmDeploy = await request.post(`${API_BASE}/projects/${projectId}/confirm-deploy-onchain`, {
    headers: { "X-Admin-Secret": ADMIN_SECRET },
    data: { contractAddress },
  });
  expect(confirmDeploy.status()).toBe(200);

  const poolAddress = `pool-${uniqueSeed("pool")}`;
  const poolTx = `pooltx-${uniqueSeed("pool")}`;
  const poolSubmit = await authed.post(`/projects/${projectId}/pool-submit`, {
    data: {
      poolTx,
      poolAddress,
      poolBaseToken: "MOTO",
    },
  });
  expect(poolSubmit.status()).toBe(201);

  const confirmPool = await request.post(`${API_BASE}/projects/${projectId}/confirm-pool-onchain`, {
    headers: { "X-Admin-Secret": ADMIN_SECRET },
    data: { poolAddress },
  });
  expect(confirmPool.status()).toBe(200);

  const poolSnapshot = await request.post(`${API_BASE}/projects/${projectId}/pool-snapshot`, {
    headers: { "X-Admin-Secret": ADMIN_SECRET },
    data: {
      reserveBase: 2_500_000,
      reserveQuote: 1_000_000,
      blockHeight: 123,
    },
  });
  expect(poolSnapshot.status()).toBe(200);

  const launchStatus = await authed.get(`/projects/${projectId}/launch-status`);
  expect(launchStatus.status()).toBe(200);
  const launchBody = await launchStatus.json();
  expect(launchBody.launchStatus).toBe("LIVE");

  const marketState = await authed.get(`/projects/${projectId}/market-state`);
  expect(marketState.status()).toBe(200);
  const stateBody = await marketState.json();
  expect(stateBody.available).toBeTruthy();
  expect(stateBody.currentPriceSats).toBeGreaterThan(0);

  return {
    contractAddress,
    poolAddress,
  };
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("homepage and leaderboards page render", async ({ page }) => {
  await page.goto("/");
  await expect(page).not.toHaveTitle(/error/i);
  await expect(page.locator("body")).not.toBeEmpty();

  await page.goto("/leaderboards");
  await expect(page.getByText("Player Leaderboards")).toBeVisible();
});

test("wallet auth session is established by dev-session", async ({ request }) => {
  const wallet = makeWallet("auth");
  const authed = await createAuthedContext(request, wallet);
  const me = await authed.get("/auth/me");
  expect(me.status()).toBe(200);
  const body = await me.json();
  expect(body.walletAddress).toBe(wallet);
});

test("project creation requires auth and enforces wallet daily quota", async ({ request }) => {
  const unauth = await request.newContext({ baseURL: API_BASE });
  const blocked = await unauth.post("/projects", { data: projectPayload("AUTHREQ") });
  expect(blocked.status()).toBe(401);

  const wallet = makeWallet("quota");
  const authed = await createAuthedContext(request, wallet);

  for (let i = 0; i < 3; i++) {
    const res = await authed.post("/projects", { data: projectPayload(`Q${i}A`) });
    expect(res.status()).toBe(201);
  }

  const fourth = await authed.post("/projects", { data: projectPayload("Q4A") });
  expect(fourth.status()).toBe(429);
  const body = await fourth.json();
  expect(String(body.error ?? "")).toContain("Daily limit reached");
});

test("project lifecycle create/list/detail works for authenticated user", async ({ request }) => {
  const wallet = makeWallet("life");
  const authed = await createAuthedContext(request, wallet);

  const created = await authed.post("/projects", { data: projectPayload("LIFEA") });
  expect(created.status()).toBe(201);
  const project = await created.json();

  const listed = await authed.get("/projects?sort=new");
  expect(listed.status()).toBe(200);
  const listBody = await listed.json();
  expect(Array.isArray(listBody.items)).toBeTruthy();
  expect(listBody.items.some((item: { id: string }) => item.id === project.id)).toBeTruthy();

  const detail = await authed.get(`/projects/${project.slug}`);
  expect(detail.status()).toBe(200);
  const detailBody = await detail.json();
  expect(detailBody.id).toBe(project.id);
});

test("run-checks endpoint rejects unauthenticated requests", async ({ request }) => {
  const wallet = makeWallet("checks");
  const authed = await createAuthedContext(request, wallet);
  const created = await authed.post("/projects", { data: projectPayload("CHKSA") });
  expect(created.status()).toBe(201);
  const project = await created.json();

  const unauth = await request.newContext({ baseURL: API_BASE });
  const denied = await unauth.post(`/projects/${project.id}/run-checks`, { data: {} });
  expect(denied.status()).toBe(401);
});

test("auth nonce route enforces 10-per-minute rate limit", async ({ request }) => {
  const ctx = await request.newContext({ baseURL: API_BASE });
  const statuses: number[] = [];
  for (let i = 0; i < 11; i++) {
    const res = await ctx.post("/auth/nonce", { data: { walletAddress: makeWallet(`nonce${i}`) } });
    statuses.push(res.status());
  }
  expect(statuses.slice(0, 10).every((status) => status === 200)).toBeTruthy();
  expect(statuses[10]).toBe(429);
});

test("floor authenticated routes reject spoofed walletAddress", async ({ request }) => {
  const wallet = makeWallet("floora");
  const spoof = makeWallet("floorb");
  const authed = await createAuthedContext(request, wallet);

  const joined = await authed.post("/floor/presence/join", {
    data: { walletAddress: wallet, displayName: "SmokeA", avatarId: "default-free-1" },
  });
  expect(joined.status()).toBe(200);

  const spoofed = await authed.post("/floor/callouts", {
    data: { walletAddress: spoof, content: "spoof test" },
  });
  expect(spoofed.status()).toBe(400);

  const valid = await authed.post("/floor/callouts", {
    data: { walletAddress: wallet, content: "real caller test" },
  });
  expect(valid.status()).toBe(201);
});

test("live upstream routes return data or explicit 503 errors", async ({ request }) => {
  for (const route of ["/opnet/block-status", "/opnet/prices", "/opnet/btc-price"]) {
    const res = await request.get(`${API_BASE}${route}`);
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    if (res.status() === 200) {
      expect(body).toBeTruthy();
    } else {
      expect(String(body.error ?? "")).toMatch(/unavailable/i);
      expect(body.upstream).toBeTruthy();
    }
  }
});

test("launch flow reaches LIVE and exposes indexed market state", async ({ request }) => {
  const wallet = makeWallet("launch");
  const authed = await createAuthedContext(request, wallet);
  const project = await createReadyProjectRecord("LAUNCH");

  await stageProjectLive(request, authed, project.id);

  const detail = await authed.get(`/projects/${project.slug}`);
  expect(detail.status()).toBe(200);
  const body = await detail.json();
  expect(body.launchStatus).toBe("LIVE");
  expect(body.poolAddress).toBeTruthy();
});

test("live trading queues, confirms, and indexes fills for stats and leaderboards", async ({ request }) => {
  const wallet = makeWallet("trade");
  const authed = await createAuthedContext(request, wallet);
  const project = await createReadyProjectRecord("TRADE");

  await stageProjectLive(request, authed, project.id);

  const intent = await authed.post(`/projects/${project.id}/buy-intent`, {
    data: {
      walletAddress: wallet,
      paymentToken: "MOTO",
      paymentAmount: 1.25,
      confirmBlocks: 3,
      maxSlippageBps: 2500,
      mode: "SWAP",
    },
  });
  expect(intent.status()).toBe(200);
  const intentBody = await intent.json();
  expect(intentBody.status).toBe("LIVE_QUOTE");
  expect(intentBody.quote.confirmBlocks).toBe(3);
  expect(intentBody.quote.currentPriceSats).toBeGreaterThan(0);

  const txId = `trade-${uniqueSeed("fill")}`;
  const submit = await authed.post(`/projects/${project.id}/buy-confirm`, {
    data: {
      walletAddress: wallet,
      txId,
      paymentToken: "MOTO",
      paymentAmount: intentBody.quote.requestedPaymentAmount,
      amountSats: intentBody.quote.requestedSats,
      tokenAmount: intentBody.quote.tokenAmount,
      confirmBlocks: 3,
      maxSlippageBps: 2500,
      mode: "SWAP",
      side: "BUY",
    },
  });
  expect(submit.status()).toBe(201);
  const submitBody = await submit.json();
  expect(submitBody.status).toBe("BROADCAST_SUBMITTED");

  const pending = await request.get(`${API_BASE}/trade-submissions/pending?limit=50`, {
    headers: { "X-Admin-Secret": ADMIN_SECRET },
  });
  expect(pending.status()).toBe(200);
  const pendingBody = await pending.json();
  expect(
    pendingBody.items.some((item: { txId: string; projectId: string }) => item.txId === txId && item.projectId === project.id),
  ).toBeTruthy();

  const confirm = await request.post(`${API_BASE}/projects/${project.id}/trade-submissions/${txId}/confirm`, {
    headers: { "X-Admin-Secret": ADMIN_SECRET },
    data: {
      walletAddress: wallet,
      side: "BUY",
      amountSats: intentBody.quote.requestedSats,
      tokenAmount: intentBody.quote.tokenAmount,
      blockHeight: 456,
      confirmedAt: new Date().toISOString(),
    },
  });
  expect(confirm.status()).toBe(200);

  const marketState = await authed.get(`/projects/${project.id}/market-state`);
  expect(marketState.status()).toBe(200);
  const stateBody = await marketState.json();
  expect(stateBody.available).toBeTruthy();
  expect(stateBody.tradeCount24h).toBeGreaterThanOrEqual(1);
  expect(stateBody.lastTradeAt).toBeTruthy();

  const candles = await authed.get(`/projects/${project.id}/candles?timeframe=1h&limit=10`);
  expect(candles.status()).toBe(200);
  const candleBody = await candles.json();
  expect(candleBody.candles.length).toBeGreaterThan(0);

  const player = await authed.get(`/players/${encodeURIComponent(wallet)}`);
  expect(player.status()).toBe(200);
  const playerBody = await player.json();
  expect(playerBody.recentTrades.length).toBeGreaterThan(0);

  const board = await request.get(`${API_BASE}/leaderboards/earners?range=7d`);
  expect(board.status()).toBe(200);
  const boardBody = await board.json();
  const row = boardBody.items.find((item: { walletAddress: string }) => item.walletAddress === wallet);
  expect(row).toBeTruthy();
  expect(row.totalTrades).toBeGreaterThanOrEqual(1);
});

test("shop mint confirmation and entitlement state come from confirmed ownership only", async ({ request }) => {
  const wallet = makeWallet("shop");
  const authed = await createAuthedContext(request, wallet);

  const itemsBefore = await authed.get(`/shop/items?wallet=${encodeURIComponent(wallet)}`);
  expect(itemsBefore.status()).toBe(200);

  const mintIntent = await authed.post("/shop/mint-intent", {
    data: { walletAddress: wallet, itemKey: "CLAN_FORMATION_LICENSE" },
  });
  expect(mintIntent.status()).toBe(200);
  const intentBody = await mintIntent.json();
  expect(intentBody.status).toBe("MINT_INTENT");
  expect(intentBody.collectionAddress).toBe("op721-smoke-collection");

  const mintTxId = `mint-${uniqueSeed("shop")}`;
  const mintConfirm = await authed.post("/shop/mint-confirm", {
    data: {
      walletAddress: wallet,
      itemKey: "CLAN_FORMATION_LICENSE",
      mintTxId,
    },
  });
  expect(mintConfirm.status()).toBe(201);
  const confirmBody = await mintConfirm.json();
  expect(confirmBody.status).toBe("MINT_SUBMITTED");

  await prisma.shopMint.update({
    where: {
      walletAddress_itemKey: {
        walletAddress: wallet,
        itemKey: "CLAN_FORMATION_LICENSE",
      },
    },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });

  const itemsAfter = await authed.get(`/shop/items?wallet=${encodeURIComponent(wallet)}`);
  expect(itemsAfter.status()).toBe(200);
  const itemsBody = await itemsAfter.json();
  const ownedLicense = itemsBody.items.find((item: { itemKey: string }) => item.itemKey === "CLAN_FORMATION_LICENSE");
  expect(ownedLicense.owned).toBeTruthy();
  expect(ownedLicense.confirmedAt).toBeTruthy();

  const licenseStatus = await authed.get(`/shop/licenses?wallet=${encodeURIComponent(wallet)}`);
  expect(licenseStatus.status()).toBe(200);
  const licenseBody = await licenseStatus.json();
  expect(licenseBody.clansUnlocked).toBeTruthy();

  const useLicense = await authed.post("/shop/use", {
    data: {
      walletAddress: wallet,
      itemKey: "CLAN_FORMATION_LICENSE",
      active: true,
    },
  });
  expect(useLicense.status()).toBe(200);
  const useBody = await useLicense.json();
  expect(useBody.active).toBeTruthy();
});
