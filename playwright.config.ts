import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = __dirname;

/**
 * Playwright config — OPFun Secure Launchpad smoke tests.
 * Run: pnpm test
 *
 * Uses plain pnpm commands so it works on both Linux (CI) and Windows (local).
 * The API's smoke:server script handles prisma generate + migrate + tsx start.
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
      // Build shared first, then start API via the dedicated smoke:server script
      // (prisma generate → migrate deploy → tsx src/index.ts)
      command: "pnpm --filter @opfun/shared build && pnpm --filter api smoke:server",
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env["CI"],
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATABASE_URL: `file:${path.join(ROOT, "apps", "api", "smoke-test.db")}`,
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
      // Build shared + web, then start the production server
      command: "pnpm --filter @opfun/shared build && pnpm --filter web build && pnpm --filter web start",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env["CI"],
      timeout: 300_000,
      stdout: "ignore",
      stderr: "pipe",
      env: {
        NEXT_PUBLIC_API_URL: "http://localhost:3001",
        NEXT_PUBLIC_OPNET_DEPLOYER_PUBKEY: "0000000000000000000000000000000000000000000000000000000000000000",
      },
    },
  ],
});
