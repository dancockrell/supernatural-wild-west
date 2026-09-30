import express from "express";
import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const output =
  process.env.REVIEW_LOCAL_MEDIA === "1"
    ? "test-results/public-demo-local-media-review"
    : "test-results/public-demo-review";
mkdirSync(output, { recursive: true });
const app = express();
app.use("/supernatural-wild-west", express.static("demo-dist"));
const server = app.listen(8790, "127.0.0.1");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const url =
  process.env.DEMO_URL ||
  "http://127.0.0.1:8790/supernatural-wild-west/?parlor=1";
const report = {
  url,
  mediaDelivery:
    process.env.REVIEW_LOCAL_MEDIA === "1"
      ? "diagnostic-local-assets"
      : "packaged-remote-assets",
  pages: [],
  checks: [],
  failures: [],
};
const groups = [
  ".ghost-porch.left",
  ".ghost-porch.right",
  ".parlor-exterior-residents .condemned",
  ".parlor-exterior-residents .rider",
  ".narrative-gambler",
  ".parlor-environment:not([hidden])",
  ".parlor-foreground-fog",
];

async function trackedPage(label) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  const entry = {
    label,
    errors: [],
    httpErrors: [],
    failedRequests: [],
    consoleErrors: [],
  };
  report.pages.push(entry);
  page.on("pageerror", (e) => entry.errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") entry.consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      entry.httpErrors.push({ status: response.status(), url: response.url() });
  });
  page.on("requestfailed", (request) =>
    entry.failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText,
    }),
  );
  if (process.env.REVIEW_LOCAL_MEDIA === "1")
    await page.route(
      "https://raw.githubusercontent.com/dancockrell/supernatural-wild-west/**/public/**",
      (route) => {
        const path = new URL(route.request().url()).pathname.split(
          "/public/",
        )[1];
        return route.fulfill({ path: `public/${path}` });
      },
    );
  return { page, entry };
}
async function diagnostics(page) {
  return page.evaluate(() => ({
    status: document.querySelector("#status")?.textContent,
    connection: document.querySelector("#connection")?.textContent,
    spin: document.querySelector("#spin")?.textContent,
    hidden: document.hidden,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
    videos: [...document.querySelectorAll("video")].map((v) => ({
      host: v.parentElement?.className,
      src: v.currentSrc || v.src,
      ready: v.readyState,
      network: v.networkState,
      paused: v.paused,
      ended: v.ended,
      seeking: v.seeking,
      time: v.currentTime,
      duration: Number.isFinite(v.duration) ? v.duration : null,
      width: v.videoWidth,
      height: v.videoHeight,
      hidden: v.hidden,
      display: getComputedStyle(v).display,
      visibility: getComputedStyle(v).visibility,
      frames: v.getVideoPlaybackQuality?.().totalVideoFrames,
      error: v.error ? { code: v.error.code, message: v.error.message } : null,
      cors: v.crossOrigin,
    })),
  }));
}
async function ready(page) {
  await expect(page.locator("#connection")).toContainText("CONNECTED", {
    timeout: 45000,
  });
  await expect(page.locator("#spin")).toBeEnabled({ timeout: 45000 });
}
async function reduced(page) {
  await page.locator("#settings").click();
  await page.locator("#motion-setting").check();
  await page.locator("#close-modal").click();
}
async function spin(page) {
  await page.locator("#spin").click();
  await expect(page.locator("#round-label")).toContainText("ROUND 00001", {
    timeout: 45000,
  });
  await expect(page.locator("#spin")).toBeEnabled({ timeout: 45000 });
}
async function reset(page) {
  await page.locator("#settings").click();
  await expect(page.locator("#restart-demo")).toBeEnabled();
  await page.locator("#restart-demo").click();
  await ready(page);
  await expect(page.locator("#round-label")).toContainText("ROUND 00000");
  await expect(page.locator("#balance")).toHaveText("1,000.00");
  await expect(page.locator(".poker-slot.dealt")).toHaveCount(0);
  await expect(page.locator("#win")).toHaveText("0.00");
}
try {
  const { page, entry } = await trackedPage(
    "persisted-session-and-native-media",
  );
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await ready(page);
  // Each slot owns one current performance; hidden alternate buffers are intentionally paused.
  // Require two newly presented frames from every visible performance, not merely a poster/time offset.
  try {
    await page.waitForFunction(
      (selectors) => {
        const probes = (window.__demoMediaProbes ||= new Map());
        return selectors
          .map((selector) => {
            const host = document.querySelector(selector);
            const video =
              host instanceof HTMLVideoElement
                ? host
                : host?.querySelector("video:not([hidden])");
            if (!video) return false;
            let probe = probes.get(selector);
            if (!probe || probe.video !== video) {
              probe = { video, frames: 0 };
              probes.set(selector, probe);
              const frame = () => {
                probe.frames++;
                if (probe.frames < 2) video.requestVideoFrameCallback(frame);
              };
              video.requestVideoFrameCallback(frame);
            }
            return (
              !video.error &&
              !video.paused &&
              video.readyState >= 2 &&
              video.videoWidth > 0 &&
              probe.frames >= 2
            );
          })
          .every(Boolean);
      },
      groups,
      { timeout: 45000 },
    );
    entry.media = await diagnostics(page);
    report.checks.push(
      "All seven visible native media slots presented at least two new frames",
    );
    await page.screenshot({ path: `${output}/native-media.png` });
  } catch (error) {
    report.failures.push(`Native media presentation: ${error}`);
    entry.media = await diagnostics(page);
    await page.screenshot({ path: `${output}/media-failure.png` });
  }
  await reduced(page);
  await spin(page);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sww-public-demo-v1")),
  );
  expect(saved.state.sequence).toBe(1);
  expect(saved.rounds).toHaveLength(1);
  const balance = await page.locator("#balance").textContent();
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  await expect(page.locator("#round-label")).toContainText("ROUND 00001");
  await expect(page.locator("#balance")).toHaveText(balance);
  report.checks.push(
    "Settled round and balance survive reload without an extra wager",
  );
  await reset(page);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("sww-public-demo-v1")).rounds,
    ),
  ).toEqual([]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  await expect(page.locator("#round-label")).toContainText("ROUND 00000");
  await expect(page.locator("#balance")).toHaveText("1,000.00");
  report.checks.push(
    "Public reset clears hand/history and remains reset after reload",
  );
  await page.close();

  const quota = await trackedPage("quota-fallback-reset");
  await quota.page.addInitScript((previous) => {
    localStorage.setItem("sww-public-demo-v1", JSON.stringify(previous));
    Storage.prototype.setItem = function () {
      throw new DOMException("Review quota fixture", "QuotaExceededError");
    };
  }, saved);
  await quota.page.goto(url, { waitUntil: "domcontentloaded" });
  await ready(quota.page);
  await expect(quota.page.locator("#round-label")).toContainText("ROUND 00001");
  await reduced(quota.page);
  await reset(quota.page);
  // The durable save remains old when writes fail; the current page must use its reset ledger.
  expect(
    await quota.page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("sww-public-demo-v1")).state.sequence,
    ),
  ).toBe(1);
  await spin(quota.page);
  report.checks.push(
    "Quota failure resets a pre-existing save in memory and permits a fresh round without restoring its old ledger",
  );
  quota.entry.final = await diagnostics(quota.page);
  await quota.page.close();
  const failures = report.pages.flatMap((p) => [
    ...p.errors,
    ...p.httpErrors.map((e) => `${e.status}: ${e.url}`),
    ...p.failedRequests
      .filter((e) => e.error !== "net::ERR_ABORTED")
      .map((e) => `${e.error}: ${e.url}`),
  ]);
  report.failures.push(...failures);
  if (report.failures.length) throw new Error(report.failures.join("\n"));
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      const entry = report.pages.at(-1);
      entry.failureState = await diagnostics(page).catch((e) => ({
        error: String(e),
      }));
      await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
    }
  process.exitCode = 1;
} finally {
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
