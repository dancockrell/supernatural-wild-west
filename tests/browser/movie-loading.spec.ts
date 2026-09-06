import { test, expect } from "@playwright/test";
import { initialState } from "../../src/engine/engine";

test("rider cells show their poster during loading then keep galloping through loop boundaries", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { state: initialState(), lastResult: null } }),
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/video/rider-gallop-v5.webm", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const rider = page.locator('.reels canvas[data-movie="rider"]').first();
  const pixels = () =>
    rider.evaluate((canvas) => {
      const c = canvas as HTMLCanvasElement;
      const data = c
        .getContext("2d")!
        .getImageData(0, 0, c.width, c.height).data;
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 100) opaque++;
      return { opaque, frame: c.toDataURL() };
    });
  try {
    await expect(rider).toHaveAttribute("data-ready", "poster");
    expect((await pixels()).opaque).toBeGreaterThan(5000);
  } finally {
    release();
  }
  await expect(rider).toHaveAttribute("data-ready", "true");
  const frames = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const sample = await pixels();
    expect(sample.opaque).toBeGreaterThan(5000);
    frames.add(sample.frame);
    await page.waitForTimeout(400);
  }
  expect(frames.size).toBeGreaterThan(5);
});
