import type { FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../db.js";
import { CreateProjectSchema } from "../schemas.js";
import { slugify } from "@opfun/shared";
import { scaffoldContract } from "@opfun/opnet";
import { auditContract } from "@opfun/opnet";

// Resolve to packages/opnet/generated/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.resolve(__dirname, "../../../../packages/opnet/generated");

export async function projectRoutes(app: FastifyInstance) {
  // POST /projects
  app.post("/projects", async (request, reply) => {
    const result = CreateProjectSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: result.error.flatten(),
      });
    }
    const data = result.data;

    const baseSlug = slugify(`${data.name}-${data.ticker}`);
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
  app.get("/projects", async (_req, reply) => {
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

  // POST /projects/:id/run-checks  — Milestone 2: real scaffold + audit
  app.post<{ Params: { id: string } }>("/projects/:id/run-checks", async (request, reply) => {
    const { id } = request.params;
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }

    // Mark project as CHECKING
    await prisma.project.update({
      where: { id },
      data: { status: "CHECKING" },
    });

    // Reply immediately — checks run async
    reply.status(202).send({
      message: "Checks started",
      projectId: id,
      status: "CHECKING",
    });

    // Run checks in background (don't await reply)
    runChecks(project).catch((err: unknown) => {
      app.log.error(err, `run-checks failed for project ${id}`);
    });
  });

  // GET /health
  app.get("/health", async (_req, reply) => {
    return reply.send({ status: "ok", timestamp: new Date().toISOString() });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runChecks(project: any): Promise<void> {
  const projectId = project.id as string;

  // ── SCAFFOLD ──────────────────────────────────────────────────────────────
  const scaffoldRun = await prisma.checkRun.create({
    data: { projectId, type: "SCAFFOLD", status: "PENDING" },
  });

  let contractSource = "";
  let buildHash = "";

  try {
    const outputDir = path.join(GENERATED_DIR, projectId);
    const result = await scaffoldContract({
      projectId,
      name: project.name as string,
      ticker: project.ticker as string,
      decimals: project.decimals as number,
      maxSupply: project.maxSupply as string,
      iconUrl: project.iconUrl as string | undefined,
      outputDir,
    });

    contractSource = result.contractSource;
    buildHash = result.buildHash;

    await prisma.checkRun.update({
      where: { id: scaffoldRun.id },
      data: {
        status: "OK",
        outputJson: JSON.stringify({
          contractPath: result.contractPath,
          buildHash,
          bobGuidance: result.bobGuidance.slice(0, 500),
        }),
      },
    });

    // Store build hash on project
    await prisma.project.update({
      where: { id: projectId },
      data: { buildHash },
    });
  } catch (err) {
    await prisma.checkRun.update({
      where: { id: scaffoldRun.id },
      data: {
        status: "FAIL",
        outputJson: JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
      },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "FLAGGED" },
    });
    return;
  }

  // ── AUDIT ─────────────────────────────────────────────────────────────────
  const auditRun = await prisma.checkRun.create({
    data: { projectId, type: "AUDIT", status: "PENDING" },
  });

  try {
    const auditResult = await auditContract(contractSource, {
      name: project.name as string,
      ticker: project.ticker as string,
      decimals: project.decimals as number,
      maxSupply: project.maxSupply as string,
      buildHash,
    });

    const auditStatus = auditResult.passed ? "OK" : "WARN";

    await prisma.checkRun.update({
      where: { id: auditRun.id },
      data: {
        status: auditStatus,
        outputJson: JSON.stringify({
          passed: auditResult.passed,
          summary: auditResult.summary,
          issues: auditResult.issues,
          bobOutput: auditResult.rawBobOutput.slice(0, 1000),
        }),
      },
    });

    // Store Risk Card + score on project
    await prisma.project.update({
      where: { id: projectId },
      data: {
        riskScore: auditResult.riskScore,
        riskCardJson: JSON.stringify(auditResult.riskCard),
        status: "READY",
      },
    });
  } catch (err) {
    await prisma.checkRun.update({
      where: { id: auditRun.id },
      data: {
        status: "FAIL",
        outputJson: JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
      },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "FLAGGED" },
    });
  }
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
