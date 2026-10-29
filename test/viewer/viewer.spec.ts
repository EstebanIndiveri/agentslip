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

test("slip media stays inside the paper and the page does not scroll sideways", async ({ page }) => {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    await page.goto("/");
    await expect(page.locator(".slip")).toHaveCount(3, { timeout: 10_000 });
    await expect(page.locator(".slip img, .slip svg, .slip object")).toHaveCount(3);
    const report = await page.evaluate(() => {
      const overflowX = Math.max(
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
        document.body.scrollWidth - document.body.clientWidth,
      );
      const slips = [...document.querySelectorAll(".slip")].map((slip) => {
        const sr = slip.getBoundingClientRect();
        const media = slip.querySelector("img, svg, object");
        const mr = media?.getBoundingClientRect();
        return {
          overflowRight: mr ? mr.right - sr.right : Infinity,
          inside: Boolean(mr && mr.left >= sr.left - 1 && mr.right <= sr.right + 1),
        };
      });
      return { overflowX, slips };
    });
    expect(report.overflowX, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    expect(report.slips).toHaveLength(3);
    for (const slip of report.slips) {
      expect(slip.inside, `slip media overflow at ${width}px`).toBe(true);
      expect(slip.overflowRight).toBeLessThanOrEqual(1);
    }
  }
});

