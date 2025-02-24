import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";
import { codecovVitePlugin } from "@codecov/vite-plugin";
import fs from 'fs/promises';
import path from 'path';

// Plugin to duplicate .d.ts to .d.cts
function duplicateDTSPlugin() {
  return {
    name: 'duplicate-dts',
    closeBundle: async (config) => {
      // This is a workaround to create a .d.cts 
      // file for the cjs format and have types working
      // also with commonjs
      try {
        const outDir = config?.dir ?? 'dist';
        const dtsPath = path.resolve(outDir, 'main.d.ts');
        const dctsPath = path.resolve(outDir, 'main.d.cts');
        await fs.copyFile(dtsPath, dctsPath);
        console.log('Successfully created .d.cts file');
      } catch (error) {
        console.error('Error creating .d.cts file:', error);
      }
    }
  };
}

export default defineConfig({
  optimizeDeps: {
    include: ["@vitest/coverage-v8/browser"],
  },
  build: {
    lib: {
      entry: "./lib/main.ts",
      name: "MediaMock",
      fileName: "media-mock",
      formats: ["es", "cjs", "umd"],
    },
    rollupOptions: {
      external: ["**.test.ts", "**.test.tsx", "**.spec.ts", "**.spec.tsx"],
    },
    outDir: 'dist',  // You can change this to any directory
  },
  test: {
    globals: true,
    browser: {
      provider: "playwright",
      enabled: true,
      name: "chromium",
      headless: true,
    },
    coverage: {
      reporter: ["text", "json-summary", "lcov", "json"],
    },
  },
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
    duplicateDTSPlugin(),
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
      bundleName: "@eatsjobs/media-mock",
      uploadToken: process.env.CODECOV_TOKEN,
    }),
  ],
});
