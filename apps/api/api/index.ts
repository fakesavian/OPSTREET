declare global {
  // Cache the Fastify app across warm invocations.
  // eslint-disable-next-line no-var
  var __opstreetApiAppPromise: Promise<{
    ready(): Promise<unknown>;
    server: {
      emit(event: "request", req: unknown, res: unknown): boolean;
    };
  }> | undefined;
}

async function getApp() {
  if (!globalThis.__opstreetApiAppPromise) {
    globalThis.__opstreetApiAppPromise = import("../src/app.js")
      .then(({ buildApp }) => buildApp({ skipWarmRuntime: true }))
      .then(async (app) => {
        await app.ready();
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
