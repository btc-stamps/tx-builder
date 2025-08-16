import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov", "json-summary"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.config.ts",
        "**/*.d.ts",
        "tests/",
        "examples/",
        "scripts/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "src/index.ts",
      ],
      include: ["src/**/*.ts"],
      all: true,
      skipFull: false,
      thresholds: {
        global: {
          branches: 70,
          functions: 50,
          lines: 14,
          statements: 14
        },
        "src/builders/**/*.ts": {
          branches: 60,
          functions: 95,
          lines: 85,
          statements: 85
        },
        "src/utils/**/*.ts": {
          branches: 70,
          functions: 60,
          lines: 50,
          statements: 50
        },
        "src/encoders/**/*.ts": {
          branches: 40,
          functions: 50,
          lines: 50,
          statements: 50
        }
      }
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    isolate: true,
    threads: true,
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@btc-stamps/types": path.resolve(__dirname, "../types/src"),
    },
  },
});
