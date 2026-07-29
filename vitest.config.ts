import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const browserInstances = process.env.CI
  ? [
      // In CI, only run Chromium for speed and reliability
      {
        browser: "chromium",
        headless: true,
        launch: {
          timeout: 15000,
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--disable-web-security",
            "--disable-features=VizDisplayCompositor",
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--disable-setuid-sandbox",
          ],
        },
      },
    ]
  : [
      // Locally, run multiple browsers but handle Firefox gracefully
      {
        browser: "chromium",
        headless: true,
        launch: {
          timeout: 10000,
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--disable-web-security",
            "--disable-features=VizDisplayCompositor",
          ],
        },
      },
      {
        browser: "webkit",
        headless: true,
        launch: {
          timeout: 10000,
          args: ["--enable-media-stream", "--use-fake-ui-for-media-stream"],
        },
      },
    ];

const timeouts = {
  testTimeout: process.env.CI ? 45000 : 30000,
  hookTimeout: process.env.CI ? 45000 : 30000,
  teardownTimeout: process.env.CI ? 15000 : 10000,
};

// Test-only config. The library itself is bundled by tsdown (tsdown.config.ts).
export default defineConfig({
  test: {
    projects: [
      {
        // Pure logic (constraint parsing, resolution matching) has no DOM
        // dependency, so it runs in node — milliseconds instead of a browser boot.
        test: {
          name: "unit",
          globals: true,
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          ...timeouts,
        },
      },
      {
        // Everything that touches navigator.mediaDevices, canvas or the DOM.
        test: {
          name: "browser",
          globals: true,
          isolate: true,
          include: ["tests/*.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: browserInstances,
          },
          ...timeouts,
        },
        // Serves tests/assets fixtures; not copied anywhere by the library build.
        publicDir: "public",
      },
    ],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json-summary", "lcov", "json", "html"],
      cleanOnRerun: true,
    },
    forceRerunTriggers: ["**/vitest.config.*"],
  },
});
