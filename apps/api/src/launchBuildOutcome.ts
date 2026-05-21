import { existsSync } from "node:fs";
import path from "node:path";
import type { DeployOutput } from "@opfun/opnet";
import type { LaunchType } from "@opfun/shared";

export type LaunchBuildOutcome =
  | {
      kind: "walletDeployReady";
      buildHash: string;
      wasmPath: string;
      curveWasmPath?: string;
    }
  | {
      kind: "buildNotReady";
      error: string;
    };

export function resolveLaunchBuildOutcome(output: DeployOutput): LaunchBuildOutcome {
  if (output.status === "FAILED") {
    return {
      kind: "buildNotReady",
      error: output.error ?? "Build failed",
    };
  }

  if (output.status !== "COMPILED") {
    return {
      kind: "buildNotReady",
      error:
        output.status === "PACKAGE_READY"
          ? "Compiled contract WASM is not available yet. Retry the build before signing deploy."
          : `Unexpected wallet-native build status '${output.status}'.`,
    };
  }

  if (!output.wasmPath) {
    return {
      kind: "buildNotReady",
      error: "Compiled contract WASM is not available yet. Retry the build before signing deploy.",
    };
  }

  return {
    kind: "walletDeployReady",
    buildHash: output.buildHash,
    wasmPath: output.wasmPath,
    curveWasmPath: output.curveWasmPath,
  };
}

export function tokenWasmCandidates(
  generatedRoot: string,
  projectId: string,
  ticker: string,
  launchType: LaunchType,
): string[] {
  const projectDir = path.join(generatedRoot, projectId);
  const candidates = launchType === "BONDING_CURVE"
    ? [
        path.join(projectDir, "contract", "token", "build", `${ticker}.wasm`),
        // Backward-compatible fallback for projects generated before the
        // bonding-curve directory split or manually copied artifacts.
        path.join(projectDir, "contract", "build", `${ticker}.wasm`),
      ]
    : [
        path.join(projectDir, "contract", "build", `${ticker}.wasm`),
        // Tolerate a token-subdir artifact if a project's launch type was
        // repaired after scaffolding.
        path.join(projectDir, "contract", "token", "build", `${ticker}.wasm`),
      ];

  return Array.from(new Set(candidates));
}

export function resolveCompiledTokenWasmPath(
  generatedRoot: string,
  projectId: string,
  ticker: string,
  launchType: LaunchType,
): string | null {
  return tokenWasmCandidates(generatedRoot, projectId, ticker, launchType).find((candidate) => existsSync(candidate)) ?? null;
}
