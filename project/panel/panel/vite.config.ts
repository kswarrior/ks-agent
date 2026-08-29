import { defineConfig } from "vite";
import hono from "@hono/vite-dev-server";

export default defineConfig({
  plugins: [
    hono({
      // Server entry point
      serverEntry: "server/src/index.ts",
    }),
  ],
  resolve: {
    alias: {
      "@": "/web/src",
    },
  },
});