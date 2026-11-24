import { defineConfig } from "vitest/config";

/** Pruebas de las reglas de Firestore. Necesitan el emulador: se corren con `npm run test:rules`. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["rules-tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
    // La librería de pruebas (CJS) y el SDK modular deben compartir la misma copia de @firebase/app.
    server: { deps: { inline: [/@firebase\//, /node_modules\/firebase\//] } },
  },
});
