import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { projectRoutes } from "./routes/projects.js";
import { deployRoutes } from "./routes/deploy.js";
import { watchEventRoutes } from "./routes/watchEvents.js";
import { floorRoutes } from "./routes/floor.js";
import { buyRoutes } from "./routes/buy.js";
import { authRoutes } from "./routes/auth.js";
import { leaderboardRoutes } from "./routes/leaderboards.js";
import { playerRoutes } from "./routes/players.js";
import { clanAndShopRoutes } from "./routes/clans.js";
import { opnetRoutes } from "./routes/opnet.js";
import { launchRoutes } from "./routes/launch.js";
import { prisma } from "./db.js";
import { seedFoundationData } from "./services/foundation.js";
import { assertRuntimeConfig, getRuntimeDiagnostics } from "@opfun/opnet";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(currentDir, "..");
const envFiles = [resolve(appRoot, ".env"), resolve(appRoot, ".env.local")];

let envLoaded = false;

function loadEnvFile(filePath: string): void {
  const contents = readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function ensureEnvLoaded(): void {
  if (envLoaded) return;
  for (const envFile of envFiles) {
    if (existsSync(envFile)) {
      loadEnvFile(envFile);
    }
  }
  envLoaded = true;
}

function validateSecrets(): void {
  const adminSecret = process.env["ADMIN_SECRET"] ?? "dev-secret-change-me";
  if (adminSecret === "dev-secret-change-me") {
    if (process.env["NODE_ENV"] === "production") {
      console.error(
        "[api] FATAL: ADMIN_SECRET is the insecure default. Set a strong secret before deploying.",
      );
      process.exit(1);
    } else {
      console.warn("[api] WARN: ADMIN_SECRET is the default value - change before production deployment.");
    }
  }

  const jwtSecret = process.env["JWT_SECRET"];
  if (!jwtSecret) {
    if (process.env["NODE_ENV"] !== "development") {
      console.error("[api] FATAL: JWT_SECRET not set. Required in all non-development environments (production, staging, test, CI).");
      process.exit(1);
    } else {
      console.warn("[api] WARN: JWT_SECRET not set - using insecure dev default. Set JWT_SECRET before promotion.");
    }
  }
}

async function registerPlugins(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  const allowedOrigin = process.env["CORS_ORIGIN"] ?? "http://localhost:3000";
  app.addHook("onRequest", async (request, reply) => {
    const method = request.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
    const origin = request.headers["origin"];
    if (origin && origin !== allowedOrigin) {
      return reply.status(403).send({ error: "Forbidden: cross-origin request rejected." });
    }
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: "Rate limit exceeded. Slow down.",
      date: Date.now(),
      expiresIn: context.after,
    }),
  });

  await app.register(cookie);
  await app.register(jwt, { secret: process.env["JWT_SECRET"] ?? "dev-jwt-secret-change-me" });
}

async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes);
  await app.register(projectRoutes);
  await app.register(deployRoutes);
  await app.register(watchEventRoutes);
  await app.register(floorRoutes);
  await app.register(buyRoutes);
  await app.register(leaderboardRoutes);
  await app.register(playerRoutes);
  await app.register(clanAndShopRoutes);
  await app.register(opnetRoutes);
  await app.register(launchRoutes);
}

async function warmRuntime(app: FastifyInstance): Promise<void> {
  const stale = await prisma.project.updateMany({
    where: { status: "CHECKING" },
    data: { status: "DRAFT" },
  });
  if (stale.count > 0) {
    console.log(`[api] Reset ${stale.count} stale CHECKING project(s) to DRAFT on startup.`);
  }

  await seedFoundationData().catch((err: unknown) => {
    app.log.warn({ err }, "Failed to seed foundation definitions");
  });

  const strictOpnetStartup = process.env["STRICT_OPNET_STARTUP"] === "true";
  try {
    assertRuntimeConfig({ requireRpc: true });

    const runtimeDiagnostics = await getRuntimeDiagnostics();
    if (!runtimeDiagnostics.provider.healthy) {
      if (strictOpnetStartup) {
        console.error("[api] FATAL: OPNet startup health checks failed.", runtimeDiagnostics);
        process.exit(1);
      }
      app.log.warn(
        { runtimeDiagnostics },
        "OPNet RPC degraded on startup; API will start with OPNet live routes potentially unavailable.",
      );
    }

    const invalidContracts = (
      Object.entries(runtimeDiagnostics.contracts) as Array<
        [keyof typeof runtimeDiagnostics.contracts, (typeof runtimeDiagnostics.contracts)[keyof typeof runtimeDiagnostics.contracts]]
      >
    )
      .filter(([, value]) => value.configured && (!value.valid || value.codeExists === false))
      .map(([key, value]) => ({ key, value }));
    if (invalidContracts.length > 0) {
      app.log.warn(
        { invalidContracts },
        "OPNet contract configuration is present but failed validation or code probing.",
      );
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

export async function buildApp(options?: { skipWarmRuntime?: boolean }): Promise<FastifyInstance> {
  ensureEnvLoaded();
  validateSecrets();

  const app = Fastify({ logger: { level: "info" } });
  await registerPlugins(app);
  await registerRoutes(app);
  if (!options?.skipWarmRuntime) {
    await warmRuntime(app);
  }
  return app;
}
