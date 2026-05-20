import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the writable directory used for generated OP_NET launch artifacts.
 *
 * Local dev keeps the historical repo-relative path so existing workflows and
 * docs still work. Serverless production bundles (for example Vercel under
 * /var/task) must not write into the read-only deployment image, so they use
 * /tmp unless OPFUN_GENERATED_DIR explicitly overrides the location.
 */
export function resolveGeneratedDir(importMetaUrl: string): string {
  const configured = process.env["OPFUN_GENERATED_DIR"]?.trim();
  if (configured) return path.resolve(configured);

  if (process.env["VERCEL"] === "1" || !!process.env["AWS_LAMBDA_FUNCTION_NAME"]) {
    return path.join(os.tmpdir(), "opfun-generated");
  }

  const routeDir = path.dirname(fileURLToPath(importMetaUrl));
  const localRepoGeneratedDir = path.resolve(routeDir, "../../../../packages/opnet/generated");

  if (localRepoGeneratedDir.startsWith("/var/task/")) {
    return path.join(os.tmpdir(), "opfun-generated");
  }

  return localRepoGeneratedDir;
}
