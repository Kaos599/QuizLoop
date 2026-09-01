import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@/server": path.resolve(__dirname, "src/server"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
