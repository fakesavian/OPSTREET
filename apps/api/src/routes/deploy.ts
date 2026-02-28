import type { FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prisma } from "../db.js";
import { deployContract } from "@opfun/opnet";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.resolve(__dirname, "../../../../packages/opnet/generated");

const ADMIN_SECRET = process.env["ADMIN_SECRET"] ?? "dev-secret-change-me";

const ConfirmDeploySchema = z.object({
  contractAddress: z.string().min(10),
  deployTx: z.string().min(10),
  buildHash: z.string().optional(),
});

export async function deployRoutes(app: FastifyInstance) {
  // POST /projects/:id/deploy  — scaffold + attempt auto-deploy (admin-gated)
  app.post<{ Params: { id: string } }>("/projects/:id/deploy", async (request, reply) => {
    if (request.headers["x-admin-secret"] !== ADMIN_SECRET) {
      return reply.status(401).send({ error: "Unauthorized: invalid X-Admin-Secret header" });
    }

    const project = await prisma.project.findUnique({ where: { id: request.params.id } });
    if (!project) return reply.status(404).send({ error: "Project not found" });

    if (!["READY", "DRAFT"].includes(project.status as string)) {
      return reply.status(409).send({
        error: `Cannot deploy from status '${project.status}'. Project must be READY or DRAFT.`,
        hint: project.status === "DRAFT" ? "Run /run-checks first." : undefined,
      });
    }

    // Mark as CHECKING during deploy scaffold
    await prisma.project.update({ where: { id: project.id }, data: { status: "CHECKING" } });

    // Create a deploy CheckRun
    const checkRun = await prisma.checkRun.create({
      data: { projectId: project.id, type: "DEPLOY", status: "PENDING" },
    });

    reply.status(202).send({ message: "Deploy started", projectId: project.id, status: "CHECKING" });

    // Run in background
    runDeploy(project, checkRun.id, app).catch((err: unknown) => {
      app.log.error(err, `deploy failed for project ${project.id}`);
    });
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

    await prisma.project.update({
      where: { id: project.id },
      data: {
        contractAddress: result.data.contractAddress,
        deployTx: result.data.deployTx,
        buildHash: result.data.buildHash ?? project.buildHash,
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
    await prisma.project.update({ where: { id: projectId }, data: { status: "FLAGGED" } });
  }
}
