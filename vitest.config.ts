import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@elb/app-core": path.resolve(__dirname, "packages/app-core/src"),
      "@elb/domain": path.resolve(__dirname, "packages/domain/src"),
      "@elb/export-core": path.resolve(__dirname, "packages/export-core/src"),
      "@elb/persistence": path.resolve(__dirname, "packages/persistence/src"),
      "@elb/pdf-core": path.resolve(__dirname, "packages/pdf-core/src"),
      "@elb/shared": path.resolve(__dirname, "packages/shared/src"),
      "@elb/ui": path.resolve(__dirname, "packages/ui/src"),
      "@elb/word-core": path.resolve(__dirname, "packages/word-core/src")
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts"]
  }
});
