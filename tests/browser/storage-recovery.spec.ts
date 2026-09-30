import { test, expect } from "@playwright/test";
import { initialState, resolveSpin } from "../../src/engine/engine";
import { SeededRng } from "../../src/engine/rng";

test("blocked browser storage still allows startup, settings, a spin and reconnect", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let latest: ReturnType<typeof resolveSpin> | null = null;
  let wagers = 0;
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        state: latest?.state ?? initialState(),
        lastResult: latest,
      },
    }),
  );
  await page.route("**/api/spin", (route) => {
    const request = route.request().postDataJSON();
    latest = resolveSpin(
      latest?.state ?? initialState(),
      request.bet,
      new SeededRng(20),
      request.requestId,
    );
    wagers++;
    return route.fulfill({ json: latest });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await page.locator("#settings").click();
  await expect(page.locator("#restart-demo")).toHaveCount(0);
  await page.locator("#music-volume").fill("30");
  await page.locator("#motion-setting").uncheck();
  await page.locator("#motion-setting").check();
  await page.locator("#close-modal").click();
  await page.locator("#spin").click();
  await expect(page.locator("#round-label")).toContainText("ROUND 00001");
  await expect(page.locator("#spin")).toBeEnabled();
  await page.reload();
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await expect(page.locator("#round-label")).toContainText("ROUND 00001");
  expect(wagers).toBe(1);
  expect(errors).toEqual([]);
});

for (const pending of [
  "{",
  JSON.stringify({ requestId: "bad", expectedSequence: 0, bet: "invalid" }),
]) {
  test(`malformed pending data restores the settled session without wagering: ${pending}`, async ({
    page,
  }) => {
    let wagers = 0;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/session", (route) =>
      route.fulfill({ json: { state: initialState(), lastResult: null } }),
    );
    await page.route("**/api/spin", (route) => {
      wagers++;
      return route.abort();
    });
    await page.addInitScript(
      (value) => localStorage.setItem("dd-pending", value),
      pending,
    );
    await page.goto("/");
    await expect(page.locator("#connection")).toContainText("CONNECTED");
    await expect(page.locator("#spin")).toBeEnabled();
    expect(
      await page.evaluate(() => localStorage.getItem("dd-pending")),
    ).toBeNull();
    expect(wagers).toBe(0);
    expect(errors).toEqual([]);
  });
}
