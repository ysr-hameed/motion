import { Hono } from "hono"
import { requireAuth } from "../lib/auth"
import { getDb } from "../lib/db"
import { CHAT_TURN_COST, TIERS, getStatusSynced } from "../lib/credits"
import type { Env } from "../env"

const app = new Hono<Env>()

app.use("/*", requireAuth)

/** Wallet status for pills, settings and pre-send guards. */
app.get("/", async (c) => {
  const user = c.get("user")
  const token = (c.req.header("Authorization") ?? "").replace(/^Bearer\s+/i, "") || undefined
  const status = await getStatusSynced(getDb(c.env.DB), c.env, user.id, token)
  return c.json({
    credits: status,
    costs: { agentTurn: CHAT_TURN_COST },
    tiers: Object.fromEntries(
      Object.entries(TIERS).map(([id, t]) => [id, { allowance: t.allowance, label: t.label }])
    ),
  })
})

export default app
