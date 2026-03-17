import type { FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../db.js";
import { CreateProjectSchema } from "../schemas.js";
import { slugify } from "@opfun/shared";
import { scaffoldContract } from "@opfun/opnet";
import { auditContract } from "@opfun/opnet";
import { assertCanTransition } from "../statusMachine.js";
import { onProjectCreated } from "./floor.js";
import { verifyWalletToken } from "../middleware/verifyWalletToken.js";
import { recordFoundationProgressFromProjectCreate } from "../services/foundation.js";
import { queueDeployForProject } from "./deploy.js";

// Resolve to packages/opnet/generated/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.resolve(__dirname, "../../../../packages/opnet/generated");
// On testnet (default) there is no creation limit — limit only applies on mainnet.
// Set CREATE_PROJECT_DAILY_LIMIT in env to enforce a cap (mainnet deployments should set this).
const CREATE_PROJECT_DAILY_LIMIT = process.env["CREATE_PROJECT_DAILY_LIMIT"]
  ? Number(process.env["CREATE_PROJECT_DAILY_LIMIT"])
  : Infinity;
const CREATE_PROJECT_IP_DAILY_LIMIT = Number(process.env["CREATE_PROJECT_IP_DAILY_LIMIT"] ?? 20);

// M10: Bob call timeout (30 s). Prevents indefinite hangs.
const BOB_TIMEOUT_MS = 30_000;
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms),
    ),
  ]);
}


export async function projectRoutes(app: FastifyInstance) {
  // POST /projects
  app.post("/projects", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const result = CreateProjectSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: result.error.flatten(),
      });
    }
    const data = result.data;
    const sessionWallet = request.walletSession?.walletAddress;
    if (!sessionWallet) {
      return reply.status(401).send({ error: "Authentication required." });
    }

    const now = new Date();
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const walletQuota = await prisma.walletQuota.upsert({
      where: {
        walletAddress_action_windowStart: {
          walletAddress: sessionWallet,
          action: "create_project",
          windowStart,
        },
      },
      create: {
        walletAddress: sessionWallet,
        action: "create_project",
        windowStart,
        count: 1,
      },
      update: { count: { increment: 1 } },
    });
    if (walletQuota.count > CREATE_PROJECT_DAILY_LIMIT) {
      return reply.status(429).send({
        error: `Daily limit reached: max ${CREATE_PROJECT_DAILY_LIMIT} project creates per wallet per day.`,
        retryAfter: "tomorrow",
      });
    }

    const ipKey = `ip:${request.ip}`;
    const ipQuota = await prisma.walletQuota.upsert({
      where: {
        walletAddress_action_windowStart: {
          walletAddress: ipKey,
          action: "create_project_ip",
          windowStart,
        },
      },
      create: {
        walletAddress: ipKey,
        action: "create_project_ip",
        windowStart,
        count: 1,
      },
      update: { count: { increment: 1 } },
    });
    if (ipQuota.count > CREATE_PROJECT_IP_DAILY_LIMIT) {
      return reply.status(429).send({
        error: `Daily IP limit reached: max ${CREATE_PROJECT_IP_DAILY_LIMIT} project creates per IP per day.`,
        retryAfter: "tomorrow",
      });
    }

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
        liquidityToken: data.liquidityToken,
        liquidityAmount: data.liquidityAmount,
        liquidityFundingTx: data.liquidityFundingTx,
      },
    });

    // Auto-pipeline: run checks first, then attempt deploy when READY.
    const queuedProject = await prisma.project.update({
      where: { id: project.id },
      data: { status: "CHECKING" },
    });
    runChecksAndAutoDeploy(queuedProject, app).catch((err: unknown) => {
      app.log.error(err, `auto deploy pipeline failed for project ${queuedProject.id}`);
    });

    // Achievement/progression hooks for authenticated creators
    onProjectCreated(sessionWallet).catch(() => undefined);
    recordFoundationProgressFromProjectCreate(sessionWallet, project.id).catch(() => undefined);

    return reply.status(201).send(serializeProject(queuedProject));
  });

  // GET /projects?sort=trending|new&status=LAUNCHED&cursor=xxx&limit=50&q=search
  // "trending" is now backed by real user attention (viewCount), not legacy pledge volume.
  app.get<{
    Querystring: { sort?: string; status?: string; cursor?: string; limit?: string; q?: string }
  }>("/projects", async (request, reply) => {
    const sort = request.query.sort === "trending" ? "viewCount" : "createdAt";
    const { status, cursor, q } = request.query;
    const take = Math.min(Number(request.query.limit ?? 50), 100);

    const where: any = {};
    if (status) where.status = status;
    if (q && q.trim().length > 0) {
      where.OR = [
        { name: { contains: q.trim() } },
        { ticker: { contains: q.trim() } },
        { description: { contains: q.trim() } },
      ];
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: { [sort]: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = projects.length > take;
    const items = hasMore ? projects.slice(0, take) : projects;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return reply.send({
      items: items.map(serializeProject),
      nextCursor,
      hasMore,
    });
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
  app.post<{ Params: { id: string } }>("/projects/:id/run-checks",
    { preHandler: [verifyWalletToken] },
    async (request, reply) => {
    // B1: Per-wallet daily quota
    const MAX_CHECKS_PER_DAY = 5;
    const wallet = request.walletSession!.walletAddress;
    const now = new Date();
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const quota = await prisma.walletQuota.upsert({
      where: { walletAddress_action_windowStart: { walletAddress: wallet, action: "run_checks", windowStart } },
      create: { walletAddress: wallet, action: "run_checks", windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });

    if (quota.count > MAX_CHECKS_PER_DAY) {
      return reply.status(429).send({
        error: `Daily limit reached: max ${MAX_CHECKS_PER_DAY} check runs per wallet per day.`,
        retryAfter: "tomorrow",
      });
    }

    const { id } = request.params;
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }

    // S3 + M5: Validate CHECKING transition through the state machine.
    try {
      assertCanTransition(project.status as string, "CHECKING");
    } catch {
      return reply.status(409).send({
        error: `Cannot run checks from status '${project.status}'.`,
        hint:
          project.status === "CHECKING"
            ? "Checks already in progress."
            : project.status === "READY"
            ? "Project already has a Risk Card. Re-run only from DRAFT or FLAGGED."
            : undefined,
      });
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

  // POST /projects/:id/pledge — retired after live migration.
  // Keep the route so stale clients fail clearly instead of silently mutating legacy state.
  app.post<{ Params: { id: string }; Body: { walletAddress?: string } }>(
    "/projects/:id/pledge",
    { preHandler: [verifyWalletToken] },
    async (_request, reply) => {
    return reply.status(410).send({
      error: "Legacy pledge flow retired",
      message:
        "Pledge-based discovery and launch progression have been disabled. Use live deploy, pool, and confirmed trade state instead.",
    });
  });

  // POST /projects/:id/view — increment view counter (fire-and-forget, no auth)
  app.post<{ Params: { id: string } }>("/projects/:id/view", async (request, reply) => {
    // Best-effort: don't fail the caller if this errors
    prisma.project
      .update({ where: { id: request.params.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);
    return reply.status(204).send();
  });

  // GET /health
  app.get("/health", async (_req, reply) => {
    return reply.send({ status: "ok", timestamp: new Date().toISOString() });
  });
}

async function runChecksAndAutoDeploy(project: any, app: FastifyInstance): Promise<void> {
  await runChecks(project);

  const refreshed = await prisma.project.findUnique({ where: { id: project.id } });
  if (!refreshed || refreshed.status !== "READY") return;

  const queued = await queueDeployForProject(project.id, app);
  if (!queued.ok) {
    app.log.warn(
      `[auto-pipeline] Deploy skipped for ${project.id}: ${queued.error ?? "unknown reason"}`,
    );
  }
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
    const result = await withTimeout(
      scaffoldContract({
        projectId,
        name: project.name as string,
        ticker: project.ticker as string,
        decimals: project.decimals as number,
        maxSupply: project.maxSupply as string,
        iconUrl: project.iconUrl as string | undefined,
        outputDir,
      }),
      BOB_TIMEOUT_MS,
      "scaffoldContract",
    );

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
    const auditResult = await withTimeout(
      auditContract(contractSource, {
        name: project.name as string,
        ticker: project.ticker as string,
        decimals: project.decimals as number,
        maxSupply: project.maxSupply as string,
        buildHash,
      }),
      BOB_TIMEOUT_MS,
      "auditContract",
    );

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
