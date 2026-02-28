import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { CreateProjectSchema } from "../schemas.js";
import { slugify } from "@opfun/shared";

export async function projectRoutes(app: FastifyInstance) {
  // POST /projects
  app.post("/projects", async (request, reply) => {
    const result = CreateProjectSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: "Validation failed", details: result.error.flatten() });
    }
    const data = result.data;

    // Build unique slug from name + ticker
    const baseSlug = slugify(`${data.name}-${data.ticker}`);
    // Ensure uniqueness by appending random suffix if needed
    let slug = baseSlug;
    const existing = await prisma.project.findUnique({ where: { slug } });
    if (existing) {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const project = await prisma.project.create({
      data: {
        slug,
        name: data.name,
        ticker: data.ticker,
        decimals: data.decimals,
        maxSupply: data.maxSupply,
        description: data.description,
        linksJson: JSON.stringify(data.links),
        iconUrl: data.iconUrl ?? null,
        sourceRepoUrl: data.sourceRepoUrl ?? null,
        status: "DRAFT",
        network: "testnet",
      },
    });

    return reply.status(201).send(serializeProject(project));
  });

  // GET /projects
  app.get("/projects", async (_request, reply) => {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return reply.send(projects.map(serializeProject));
  });

  // GET /projects/:slug
  app.get<{ Params: { slug: string } }>("/projects/:slug", async (request, reply) => {
    const { slug } = request.params;
    const project = await prisma.project.findUnique({
      where: { slug },
      include: {
        checkRuns: { orderBy: { createdAt: "desc" }, take: 20 },
        watchEvents: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return reply.send({
      ...serializeProject(project),
      checkRuns: project.checkRuns,
      watchEvents: project.watchEvents,
    });
  });

  // POST /projects/:id/run-checks  (Milestone 1 stub)
  app.post<{ Params: { id: string } }>("/projects/:id/run-checks", async (request, reply) => {
    const { id } = request.params;
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return reply
      .status(501)
      .send({ message: "Milestone 2: Bob integration (OpnetDev + OpnetAudit) not yet implemented" });
  });

  // GET /health
  app.get("/health", async (_req, reply) => {
    return reply.send({ status: "ok", timestamp: new Date().toISOString() });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeProject(p: any) {
  return {
    ...p,
    links: (() => {
      try {
        return JSON.parse(p.linksJson as string);
      } catch {
        return {};
      }
    })(),
    riskCard: (() => {
      try {
        return p.riskCardJson ? JSON.parse(p.riskCardJson as string) : null;
      } catch {
        return null;
      }
    })(),
  };
}
