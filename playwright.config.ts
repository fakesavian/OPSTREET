import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — OPFun Secure Launchpad smoke tests.
 * Run: pnpm test
 * Requires the Next.js dev server (auto-started unless already running).
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
  webServer: {
    command: "pnpm --filter web dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
