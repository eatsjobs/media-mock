import fs from "node:fs/promises";
import path from "node:path";
import { codecovVitePlugin } from "@codecov/vite-plugin";
import dts from "vite-plugin-dts";
import { defineConfig } from "vitest/config";

const outDir = "dist";
// Plugin to duplicate .d.ts to .d.cts
function duplicateDTSPlugin() {
  return {
    name: "duplicate-dts",
    closeBundle: async () => {
      // This is a workaround to create a .d.cts
      // file for the cjs format and have types working
      // also with commonjs
      try {
        const dtsPath = path.resolve(outDir, "main.d.ts");
        const dctsPath = path.resolve(outDir, "main.d.cts");
        await fs.copyFile(dtsPath, dctsPath);
        console.log("Successfully created .d.cts file");
      } catch (error) {
        console.error("Error creating .d.cts file:", error);
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  optimizeDeps: {
    include: ["@vitest/coverage-v8/browser"],
  },
  build: {
    minify: "esbuild",
    lib: {
      entry: "./lib/main.ts",
      name: "MediaMock",
      fileName: (format) => {
        if (format === "umd") return "media-mock.umd.min.js";
        if (format === "cjs") return "media-mock.cjs";
        return "media-mock.js";
      },
      formats: ["es", "cjs", "umd"],
    },
    rollupOptions: {
      external: ["**.test.ts", "**.test.tsx", "**.spec.ts", "**.spec.tsx"],
    },
    outDir: outDir, // You can change this to any directory
  },
  test: {
    globals: true,
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      isolate: true,
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
    forceRerunTriggers: ["**/vite.config.*"],
  },
  publicDir: command === "build" ? false : "public", // Don't copy public assets to dist for library builds, but allow for dev/test
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
      bundledPackages: [],
      compilerOptions: {
        declaration: true,
        declarationMap: true,
        emitDeclarationOnly: true,
      },
    }),
    ...(command === "build" ? [duplicateDTSPlugin()] : []),
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
      bundleName: "@eatsjobs/media-mock",
      uploadToken: process.env.CODECOV_TOKEN,
    }),
  ],
}));
