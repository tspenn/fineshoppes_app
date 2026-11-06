import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { catalogApi } from "./scripts/catalog-plugin.mjs";

export default defineConfig({
  plugins: [react(), catalogApi()],
  server: {
    host: true,
    port: 4741,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 4741,
    strictPort: true,
  },
});
