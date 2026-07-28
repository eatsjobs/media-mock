import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Test-only config. The library itself is bundled by tsdown (tsdown.config.ts).
export default defineConfig({
  test: {
    globals: true,
    isolate: true,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: process.env.CI
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
                args: [
                  "--enable-media-stream",
                  "--use-fake-ui-for-media-stream",
                ],
              },
            },
          ],
    },
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json-summary", "lcov", "json", "html"],
      cleanOnRerun: true,
    },
    testTimeout: process.env.CI ? 45000 : 30000,
    hookTimeout: process.env.CI ? 45000 : 30000,
    teardownTimeout: process.env.CI ? 15000 : 10000,
    forceRerunTriggers: ["**/vitest.config.*"],
  },
  // Serves tests/assets fixtures; not copied anywhere by the library build.
  publicDir: "public",
});
