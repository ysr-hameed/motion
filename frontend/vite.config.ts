import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * The agent is reached over a WebSocket at /agents/*. Proxying it in dev makes
 * the browser see one origin, so no CORS headers are needed in development and
 * the dev setup matches production (where the Worker serves the built assets).
 */
const BACKEND = "http://localhost:8787"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/agents": { target: BACKEND, ws: true, changeOrigin: true },
      "/api": { target: BACKEND, changeOrigin: true },
    },
  },
})