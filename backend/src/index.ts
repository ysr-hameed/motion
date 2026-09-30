import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import projects from "./routes/projects"
import ai from "./routes/ai"
import agent from "./routes/agent"
import uploads from "./routes/uploads"
import exp from "./routes/export"
import motion from "./routes/motion"
import type { Env } from "./env"

const app = new Hono<Env>()

app.use(logger())
app.use(
  "/api/*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
    ],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
)

app.get("/api/health", (c) => {
  const chain = (c.env.AI_MODEL || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
  return c.json({
    ok: true,
    ai: (c.env.AI_PROVIDER || "gateway").toLowerCase(),
    aiConfigured: Boolean(c.env.AI_GATEWAY_API_KEY),
    model: chain[0] ?? "alibaba/qwen3.7-flash",
    models: chain.length ? chain : ["alibaba/qwen3.7-flash"],
  })
})

app.route("/api/projects", projects)
app.route("/api/ai", ai)
app.route("/api/agent", agent)
app.route("/api/uploads", uploads)
app.route("/api/export", exp)
app.route("/api/motion", motion)

app.notFound((c) => c.json({ error: "Not found" }, 404))
app.onError((err, c) => {
  console.error(JSON.stringify({ msg: "unhandled", err: String(err) }))
  return c.json({ error: "Something went wrong" }, 500)
})

export default app
