import { test, expect } from "@playwright/test";

/**
 * OPFun Secure Launchpad — browser smoke tests.
 * Verifies the Next.js app boots and key pages render without crashing.
 *
 * Run: pnpm test
 * (The playwright.config.ts webServer block auto-starts the dev server.)
 */

test("homepage loads and shows project feed", async ({ page }) => {
  await page.goto("/");
  // Page must render without a 500 error
  await expect(page).not.toHaveTitle(/error/i);
  // Some heading or content present
  await expect(page.locator("body")).not.toBeEmpty();
});

test("create page loads with a form", async ({ page }) => {
  await page.goto("/create");
  await expect(page).not.toHaveTitle(/error/i);
  // The create form should have at least one text input
  const inputs = page.locator("input[type=text], input:not([type])");
  await expect(inputs.first()).toBeVisible({ timeout: 10_000 });
});
