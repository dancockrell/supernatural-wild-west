import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:8788",
    headless: true,
    ...(process.env.NATIVE_GPU_REVIEW === '1' ? {
      channel: 'chrome',
      launchOptions: {args: ['--use-angle=d3d11','--enable-gpu']},
    } : {}),
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx tests/browser/harness.ts",
    url: "http://127.0.0.1:8788/api/config",
    reuseExistingServer: false,
    timeout: 20000,
  },
});

