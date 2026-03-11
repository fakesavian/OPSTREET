import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = __dirname;
const TMP_DIR = path.join(ROOT, ".tmp");

function psEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function psExec(bin: string, args: string[] = []): string {
  const command = [`& '${psEscape(bin)}'`, ...args.map((arg) => `'${psEscape(arg)}'`)].join(" ");
  return `${command}; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`;
}

function psInDir(dir: string, command: string): string {
  return `Push-Location '${psEscape(dir)}'; try { ${command} } finally { Pop-Location }`;
}

const sharedTsc = psExec(path.join(ROOT, "node_modules", ".bin", "tsc.cmd"), [
  "-p",
  path.join(ROOT, "packages", "shared", "tsconfig.json"),
]);

const apiPrisma = path.join(ROOT, "apps", "api", "node_modules", ".bin", "prisma.cmd");
const apiTsx = path.join(ROOT, "apps", "api", "node_modules", ".bin", "tsx.cmd");
const webNext = path.join(ROOT, "apps", "web", "node_modules", ".bin", "next.cmd");

const apiServerCommand = [
  `New-Item -ItemType Directory -Force -Path '${psEscape(TMP_DIR)}' | Out-Null`,
  sharedTsc,
  psInDir(
    path.join(ROOT, "apps", "api"),
    [
      psExec(apiTsx, ["src/index.ts"]),
    ].join("; "),
  ),
].join("; ");

const webServerCommand = [
  `New-Item -ItemType Directory -Force -Path '${psEscape(TMP_DIR)}' | Out-Null`,
  sharedTsc,
  psInDir(
    path.join(ROOT, "apps", "web"),
    [
      psExec(webNext, ["build"]),
      psExec(webNext, ["start", "-H", "0.0.0.0", "-p", "3000"]),
    ].join("; "),
  ),
].join("; ");

/**
 * Playwright config — OPFun Secure Launchpad smoke tests.
 * Run: pnpm test
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `powershell -NoProfile -Command "${apiServerCommand}"`,
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env["CI"],
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATABASE_URL: "file:./smoke-test.db",
        PORT: "3001",
        ADMIN_SECRET: "dev-secret-change-me",
        JWT_SECRET: "playwright-smoke-secret",
        CORS_ORIGIN: "http://localhost:3000",
        AUTH_DOMAIN: "localhost",
        DEV_AUTH_HEADER_FALLBACK: "true",
        SHOP_OP721_COLLECTION: "op721-smoke-collection",
        NODE_ENV: "test",
      },
    },
    {
      command: `powershell -NoProfile -Command "${webServerCommand}"`,
      url: "http://localhost:3000",
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
      env: {
        NEXT_PUBLIC_API_URL: "http://localhost:3001",
      },
    },
  ],
});
