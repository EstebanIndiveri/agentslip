import { expect, test } from "@playwright/test";

test("shows three example tickets and supports keyboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText(/agentslip/i);
  const slips = page.locator(".slip");
  await expect(slips).toHaveCount(3, { timeout: 10_000 });
  const kinds = await slips.locator(".meta span").allTextContents();
  const joined = kinds.join(" ");
  expect(joined).toMatch(/session/i);
  expect(joined).toMatch(/needs-you/i);
  expect(joined).toMatch(/done/i);
  await expect(slips.nth(0).locator(".meta")).toContainText(/session/i);
  await expect(slips.nth(1).locator(".meta")).toContainText(/needs-you/i);
  await expect(slips.nth(2).locator(".meta")).toContainText(/done/i);

  await page.keyboard.press("Home");
  await expect(slips.nth(0)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(slips.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(slips.nth(2)).toHaveAttribute("aria-selected", "true");
});

test("layout works on a small screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto("/");
  await expect(page.locator(".slip")).toHaveCount(3, { timeout: 10_000 });
  const box = await page.locator(".roll").boundingBox();
  expect(box).toBeTruthy();
  expect(box!.width).toBeLessThanOrEqual(375);
});
