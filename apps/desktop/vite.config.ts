import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@elb/domain": path.resolve(__dirname, "../../packages/domain/src"),
      "@elb/export-core": path.resolve(__dirname, "../../packages/export-core/src"),
      "@elb/persistence": path.resolve(__dirname, "../../packages/persistence/src"),
      "@elb/pdf-core": path.resolve(__dirname, "../../packages/pdf-core/src"),
      "@elb/shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@elb/ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@elb/word-core": path.resolve(__dirname, "../../packages/word-core/src")
    }
  }
});
