import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

const ADMIN_SECRET = process.env["ADMIN_SECRET"] ?? "dev-secret-change-me";
// T5: Optional Discord webhook for CRITICAL alerts (fire-and-forget, opt-in)
const DISCORD_WEBHOOK_URL = process.env["DISCORD_WEBHOOK_URL"];
const APP_URL = process.env["APP_URL"] ?? "http://localhost:3000";

// M9: How long a dedupKey suppresses duplicate events (24 hours).
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1_000;

const WatchEventSchema = z.object({
  severity: z.enum(["INFO", "WARN", "CRITICAL"]),
  title: z.string().min(1).max(200),
  detailsJson: z.record(z.unknown()).optional(),
  txId: z.string().optional(),
  /// M9: Optional dedup key — if set, POST is silently skipped if an unresolved event
  /// with the same dedupKey exists for this project within DEDUP_WINDOW_MS.
  /// Format convention: "<RULE_CODE>:<projectId>" e.g. "CODE_CHANGE:clxxx"
  dedupKey: z.string().max(120).optional(),
});

export async function watchEventRoutes(app: FastifyInstance) {
  // POST /projects/:id/watch-events — watcher writes events (admin-gated)
  app.post<{ Params: { id: string } }>("/projects/:id/watch-events", async (request, reply) => {
    if (request.headers["x-admin-secret"] !== ADMIN_SECRET) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const project = await prisma.project.findUnique({ where: { id: request.params.id } });
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const result = WatchEventSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: "Validation failed", details: result.error.flatten() });
    }

    // M9: Deduplication — skip if an unresolved event with this dedupKey already
    // exists for this project within the last 24 hours.
    if (result.data.dedupKey) {
      const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
      const existing = await prisma.watchEvent.findFirst({
        where: {
          projectId: project.id,
          dedupKey: result.data.dedupKey,
          resolved: false,
          createdAt: { gte: cutoff },
        },
      });
      if (existing) {
        // Duplicate suppressed — return 200 with the existing event so watcher can log it
        return reply.status(200).send({ ...existing, deduplicated: true });
      }
    }

    const event = await prisma.watchEvent.create({
      data: {
        projectId: project.id,
        severity: result.data.severity,
        title: result.data.title,
        detailsJson: result.data.detailsJson ? JSON.stringify(result.data.detailsJson) : null,
        txId: result.data.txId ?? null,
        dedupKey: result.data.dedupKey ?? null,
        resolved: false,
      },
    });

    // Auto-flag project if a critical anomaly is detected while live
    if (result.data.severity === "CRITICAL" && project.status === "LAUNCHED") {
      await prisma.project.update({
        where: { id: project.id },
        data: { status: "FLAGGED" },
      });
      app.log.warn(`[watchtower] Project ${project.id} (${project.ticker}) FLAGGED: ${result.data.title}`);
    }

    // T5: Discord webhook — fire-and-forget, opt-in via DISCORD_WEBHOOK_URL env var
    if (result.data.severity === "CRITICAL" && DISCORD_WEBHOOK_URL) {
      const projectUrl = `${APP_URL}/p/${project.slug as string}`;
      fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [
            {
              title: `⚠️ CRITICAL: ${result.data.title}`,
              description: `**${project.ticker as string}** (${project.name as string})\n${projectUrl}`,
              color: 0xff3333,
              timestamp: new Date().toISOString(),
              footer: { text: "OPFun Watchtower · Testnet" },
            },
          ],
        }),
      }).catch(() => undefined); // never block the response
    }

    return reply.status(201).send(event);
  });

  // PATCH /projects/:id/watch-events/:eventId/resolve — mark event resolved (admin-gated)
  app.patch<{ Params: { id: string; eventId: string } }>(
    "/projects/:id/watch-events/:eventId/resolve",
    async (request, reply) => {
      if (request.headers["x-admin-secret"] !== ADMIN_SECRET) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const event = await prisma.watchEvent.findFirst({
        where: { id: request.params.eventId, projectId: request.params.id },
      });
      if (!event) return reply.status(404).send({ error: "Event not found" });

      const updated = await prisma.watchEvent.update({
        where: { id: event.id },
        data: { resolved: true },
      });

      return reply.send(updated);
    },
  );

  // GET /projects/:id/watch-events — public read for feed / project page
  app.get<{ Params: { id: string } }>("/projects/:id/watch-events", async (request, reply) => {
    const project = await prisma.project.findUnique({ where: { id: request.params.id } });
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const events = await prisma.watchEvent.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return reply.send(events);
  });
}
