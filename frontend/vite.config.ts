import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

/**
 * The agent is reached over a WebSocket at /agents/*. Proxying it in dev makes
 * the browser see one origin, so no CORS headers are needed in development and
 * the dev setup matches production (where the two are separate domains).
 */
const BACKEND = "http://localhost:8787"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Mirrors the `~/*` path in tsconfig.json. Without it TypeScript resolves
    // these imports happily and Vite then fails at transform time.
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/agents": { target: BACKEND, ws: true, changeOrigin: true },
      "/api": { target: BACKEND, changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Only the two things that are genuinely heavy AND always loaded get a
        // manual chunk: the transpiler and Remotion core. The optional
        // @remotion packages are dynamically imported by lazy-scope.ts, so
        // lumping them into one named chunk here would force all of them into
        // the initial graph and undo that splitting — leave them to Vite.
        manualChunks(id) {
          if (id.includes("sucrase")) return "transpiler"
          if (id.includes("/node_modules/remotion/")) return "remotion"
        },
      },
    },
  },
})
