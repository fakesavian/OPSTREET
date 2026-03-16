import type { FastifyInstance } from "fastify";

declare global {
  // Cache the Fastify app across warm invocations.
  // eslint-disable-next-line no-var
  var __opstreetApiAppPromise: Promise<FastifyInstance> | undefined;
}

async function getApp(): Promise<FastifyInstance> {
  if (!globalThis.__opstreetApiAppPromise) {
    globalThis.__opstreetApiAppPromise = import("../src/app.js")
      .then(({ buildApp }) => buildApp({ skipWarmRuntime: true }))
      .then(async (app) => {
        await app.ready();
        // Warm the Neon DB connection in the background so the first DB-touching
        // route (auth/verify, project creation, etc.) doesn't hit a cold connection.
        import("../src/db.js")
          .then(({ prisma }) => prisma.$queryRaw`SELECT 1`)
          .catch(() => { /* non-fatal — DB will connect on first real query */ });
        return app;
      });
  }

  return globalThis.__opstreetApiAppPromise;
}

export default async function handler(req: unknown, res: unknown): Promise<void> {
  try {
    const app = await getApp();
    app.server.emit("request", req, res);
  } catch (error) {
    console.error("[api] Vercel handler bootstrap failed", error);

    const response = res as {
      statusCode?: number;
      setHeader?: (name: string, value: string) => void;
      end?: (body?: string) => void;
    };

    response.statusCode = 500;
    response.setHeader?.("content-type", "application/json; charset=utf-8");
    response.end?.(
      JSON.stringify({
        error: "API bootstrap failed",
        message: error instanceof Error ? error.message : "Unknown startup error",
      }),
    );
  }
}
