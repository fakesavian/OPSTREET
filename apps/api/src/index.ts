import Fastify from "fastify";
import cors from "@fastify/cors";
import { projectRoutes } from "./routes/projects.js";
import { deployRoutes } from "./routes/deploy.js";
import { watchEventRoutes } from "./routes/watchEvents.js";
import { prisma } from "./db.js";

// S2: Fail-fast if ADMIN_SECRET is still the default value in production.
const ADMIN_SECRET = process.env["ADMIN_SECRET"] ?? "dev-secret-change-me";
if (ADMIN_SECRET === "dev-secret-change-me") {
  if (process.env["NODE_ENV"] === "production") {
    console.error(
      "[api] FATAL: ADMIN_SECRET is the insecure default. Set a strong secret before deploying.",
    );
    process.exit(1);
  } else {
    console.warn("[api] WARN: ADMIN_SECRET is the default value — change before production deployment.");
  }
}

const app = Fastify({ logger: { level: "info" } });

await app.register(cors, {
  origin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

await app.register(projectRoutes);
await app.register(deployRoutes);
await app.register(watchEventRoutes);

// S4: Reset any projects stuck in CHECKING from a previous crashed run.
const stale = await prisma.project.updateMany({
  where: { status: "CHECKING" },
  data: { status: "DRAFT" },
});
if (stale.count > 0) {
  console.log(`[api] Reset ${stale.count} stale CHECKING project(s) to DRAFT on startup.`);
}

const port = Number(process.env["PORT"] ?? 3001);
const host = process.env["HOST"] ?? "0.0.0.0";

try {
  await app.listen({ port, host });
  console.log(`API running on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
