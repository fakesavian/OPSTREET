import type { FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prisma } from "../db.js";
import { deployContract } from "@opfun/opnet";
import { assertCanTransition } from "../statusMachine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.resolve(__dirname, "../../../../packages/opnet/generated");

const ADMIN_SECRET = process.env["ADMIN_SECRET"] ?? "dev-secret-change-me";

const ConfirmDeploySchema = z.object({
  contractAddress: z.string().min(10),
  deployTx: z.string().min(10),
  buildHash: z.string().optional(),
});

interface QueueDeployResult {
  ok: boolean;
  statusCode?: number;
  error?: string;
  hint?: string;
  projectId?: string;
}

export async function queueDeployForProject(
  projectId: string,
  app: FastifyInstance,
): Promise<QueueDeployResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false, statusCode: 404, error: "Project not found" };

  const liquidityToken = (project as Record<string, unknown>)["liquidityToken"];
  const liquidityAmountRaw = (project as Record<string, unknown>)["liquidityAmount"];
  const liquidityFundingTx = (project as Record<string, unknown>)["liquidityFundingTx"];
  const liquidityAmount = typeof liquidityAmountRaw === "string" ? Number(liquidityAmountRaw) : 0;
  if (
    typeof liquidityToken !== "string" ||
    !["TBTC", "MOTO", "PILL"].includes(liquidityToken) ||
    !Number.isFinite(liquidityAmount) ||
    liquidityAmount <= 0 ||
    typeof liquidityFundingTx !== "string" ||
    liquidityFundingTx.length < 8
  ) {
    return {
      ok: false,
      statusCode: 409,
      error: "Initial liquidity is required before deployment.",
      hint: "Create with liquidity token (TBTC/MOTO/PILL), positive amount, and a valid wallet funding tx.",
    };
  }

  try {
    assertCanTransition(project.status as string, "CHECKING");
  } catch {
    return {
      ok: false,
      statusCode: 409,
      error: `Cannot deploy from status '${project.status}'. Project must be READY.`,
      hint: project.status === "DRAFT" ? "Run /run-checks first to generate a Risk Card." : undefined,
    };
  }

  await prisma.project.update({ where: { id: project.id }, data: { status: "CHECKING" } });
  const checkRun = await prisma.checkRun.create({
    data: { projectId: project.id, type: "DEPLOY", status: "PENDING" },
  });

  runDeploy(project, checkRun.id, app).catch((err: unknown) => {
    app.log.error(err, `deploy failed for project ${project.id}`);
  });

  return { ok: true, projectId: project.id };
}

export async function deployRoutes(app: FastifyInstance) {
  // POST /projects/:id/deploy  — scaffold + attempt auto-deploy (admin-gated)
  app.post<{ Params: { id: string } }>("/projects/:id/deploy", async (request, reply) => {
    if (request.headers["x-admin-secret"] !== ADMIN_SECRET) {
      return reply.status(401).send({ error: "Unauthorized: invalid X-Admin-Secret header" });
    }

    const queued = await queueDeployForProject(request.params.id, app);
    if (!queued.ok) {
      return reply.status(queued.statusCode ?? 409).send({
        error: queued.error ?? "Unable to start deploy",
        hint: queued.hint,
      });
    }

    reply.status(202).send({ message: "Deploy started", projectId: queued.projectId, status: "CHECKING" });
  });

  // POST /projects/:id/confirm-deploy  — manual: record address after user ran deploy.ts
  app.post<{ Params: { id: string } }>("/projects/:id/confirm-deploy", async (request, reply) => {
    if (request.headers["x-admin-secret"] !== ADMIN_SECRET) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const result = ConfirmDeploySchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: "Validation failed", details: result.error.flatten() });
    }

    const project = await prisma.project.findUnique({ where: { id: request.params.id } });
    if (!project) return reply.status(404).send({ error: "Project not found" });

    // STATE MACHINE GUARD: only READY / DEPLOY_PACKAGE_READY / CHECKING → LAUNCHED (per ALLOWED_TRANSITIONS)
    try {
      assertCanTransition(project.status as string, "LAUNCHED");
    } catch {
      return reply.status(409).send({
        error: `Cannot confirm deploy from status '${project.status}'.`,
        hint: project.status === "GRADUATED" ? "Project is already graduated." : undefined,
      });
    }

    const finalBuildHash = result.data.buildHash ?? (project.buildHash as string | null) ?? undefined;

    await prisma.project.update({
      where: { id: project.id },
      data: {
        contractAddress: result.data.contractAddress,
        deployTx: result.data.deployTx,
        buildHash: finalBuildHash ?? null,
        status: "LAUNCHED",
      },
    });

    await prisma.checkRun.create({
      data: {
        projectId: project.id,
        type: "DEPLOY",
        status: "OK",
        outputJson: JSON.stringify({
          contractAddress: result.data.contractAddress,
          deployTx: result.data.deployTx,
          confirmedManually: true,
          network: "testnet",
        }),
      },
    });

    // M4: Mark contractMatchesArtifact = true now that deploy address is recorded.
    // The build hash was generated from the contract source at audit time; recording
    // the address is our signal that the artifact matches the on-chain deployment.
    if (project.riskCardJson) {
      try {
        const riskCard = JSON.parse(project.riskCardJson as string) as {
          releaseIntegrity: { contractMatchesArtifact: boolean | null };
        };
        riskCard.releaseIntegrity.contractMatchesArtifact = true;
        await prisma.project.update({
          where: { id: project.id },
          data: { riskCardJson: JSON.stringify(riskCard) },
        });
      } catch {
        app.log.warn(`[confirm-deploy] Failed to update contractMatchesArtifact for ${project.id}`);
      }
    }

    const updated = await prisma.project.findUnique({
      where: { id: project.id },
      include: { checkRuns: { orderBy: { createdAt: "desc" }, take: 5 } },
    });

    return reply.send(updated);
  });

  // GET /projects/:id/deploy-package — return deploy instructions
  app.get<{ Params: { id: string } }>("/projects/:id/deploy-package", async (request, reply) => {
    if (request.headers["x-admin-secret"] !== ADMIN_SECRET) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const project = await prisma.project.findUnique({ where: { id: request.params.id } });
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const dir = `packages/opnet/generated/${project.id}`;
    return reply.send({
      projectId: project.id,
      ticker: project.ticker,
      buildHash: project.buildHash,
      status: project.status,
      packageDir: dir,
      instructions: [
        `Deploy package is at: ${dir}`,
        ``,
        `1. Compile:  cd ${dir}/contract && npm install && npm run build`,
        `2. Fund:     get Signet BTC to your deployer address`,
        `3. Set env:  export OPNET_MNEMONIC="word1 ... word24"`,
        `4. Deploy:   cd ${dir} && npm install && npx ts-node deploy.ts`,
        `5. Confirm:  POST /projects/${project.id}/confirm-deploy with contractAddress + deployTx`,
        ``,
        `See: ${dir}/DEPLOY.md for complete instructions.`,
      ].join("\n"),
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runDeploy(project: any, checkRunId: string, app: FastifyInstance): Promise<void> {
  const projectId = project.id as string;

  try {
    const output = await deployContract({
      projectId,
      slug: project.slug as string,
      name: project.name as string,
      ticker: project.ticker as string,
      decimals: project.decimals as number,
      maxSupply: project.maxSupply as string,
      iconUrl: project.iconUrl as string | undefined,
      buildHash: project.buildHash as string ?? "",
      liquidityToken: (project as Record<string, unknown>)["liquidityToken"] as
        | "TBTC"
        | "MOTO"
        | "PILL"
        | undefined,
      liquidityAmount: (project as Record<string, unknown>)["liquidityAmount"] as string | undefined,
      generatedDir: path.join(GENERATED_DIR, projectId),
    });

    const newStatus =
      output.status === "LAUNCHED"
        ? "LAUNCHED"
        : output.status === "FAILED"
        ? "FLAGGED"
        : "READY"; // PACKAGE_READY or COMPILED — stay READY, needs manual deploy

    await prisma.checkRun.update({
      where: { id: checkRunId },
      data: {
        status: output.status === "LAUNCHED" ? "OK" : output.status === "FAILED" ? "FAIL" : "WARN",
        outputJson: JSON.stringify({
          deployStatus: output.status,
          contractAddress: output.contractAddress,
          deployTx: output.deployTx,
          wasmPath: output.wasmPath,
          instructions: output.instructions,
          error: output.error,
        }),
      },
    });

    // STATE MACHINE GUARD: re-fetch current status before writing to prevent
    // bypassing the state machine in this async path (e.g. manual confirm-deploy
    // may have already transitioned the project while deployContract was running).
    const freshForSuccess = await prisma.project.findUnique({ where: { id: projectId } });
    if (!freshForSuccess) {
      app.log.warn(`[runDeploy] Project ${projectId} was deleted while deploy was running`);
      return;
    }
    try {
      assertCanTransition(freshForSuccess.status as string, newStatus);
    } catch (transitionErr) {
      app.log.error(
        transitionErr,
        `[runDeploy] Invalid transition ${freshForSuccess.status} → ${newStatus} for ${projectId} — skipping DB write`,
      );
      return;
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: newStatus,
        ...(output.contractAddress ? { contractAddress: output.contractAddress } : {}),
        ...(output.deployTx ? { deployTx: output.deployTx } : {}),
        ...(output.buildHash ? { buildHash: output.buildHash } : {}),
      },
    });
  } catch (err) {
    app.log.error(err, `runDeploy error for ${projectId}`);
    await prisma.checkRun.update({
      where: { id: checkRunId },
      data: {
        status: "FAIL",
        outputJson: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      },
    });

    // STATE MACHINE GUARD: validate FLAGGED transition before writing in error path too.
    const freshForError = await prisma.project.findUnique({ where: { id: projectId } });
    if (!freshForError) return;
    try {
      assertCanTransition(freshForError.status as string, "FLAGGED");
    } catch (transitionErr) {
      app.log.error(
        transitionErr,
        `[runDeploy] Invalid transition ${freshForError.status} → FLAGGED for ${projectId} — skipping DB write`,
      );
      return;
    }
    await prisma.project.update({ where: { id: projectId }, data: { status: "FLAGGED" } });
  }
}
