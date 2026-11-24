import { execSync } from "node:child_process";
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Identifica el build que está publicado: commit corto y fecha. Sirve para saber si el navegador tiene la versión nueva. */
const buildId = (() => {
  let commit = "local";
  try {
    commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    /* sin git: queda "local" */
  }
  return `${commit} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
})();

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
