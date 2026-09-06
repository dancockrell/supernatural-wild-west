import type { Page } from "@playwright/test";
export async function preview(page: Page, kind: string) {
  await page.locator("#settings").click();
  await page.locator(".developer-tools summary").click();
  await page.locator("#animation-preview").click();
  await page.locator(`[data-feature-preview="${kind}"]`).click();
}
