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
    // The web-motion player is dependency-free (sandboxed iframe + native
    // MediaRecorder/WebCodecs) — no vendor chunk carve-outs needed. Three.js,
    // GSAP and friends load from pinned CDN URLs inside the sandbox, never
    // through this bundle.
  },
})
