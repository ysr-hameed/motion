import { createMiddleware } from "hono/factory"
import { SlyxupClient } from "@slyxup/core"
import type { Env } from "../env"

export interface AuthedUser {
  id: string
  email: string
}

/**
 * Requires a Stack session via `Authorization: Bearer <token>`.
 * The token is verified against the auth API per request (no shared
 * client state). When ALLOW_ANON is "true" (local dev default),
 * requests without credentials get a stable local-dev identity —
 * never enable that in production.
 */
export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const header = c.req.header("Authorization") ?? ""

  if (!header && c.env.ALLOW_ANON === "true") {
    c.set("user", { id: "local-dev", email: "dev@localhost" })
    await next()
    return
  }

  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return c.json({ error: "Unauthorized" }, 401)

  try {
    const client = new SlyxupClient({
      apiUrl: c.env.AUTH_API_URL,
      sessionToken: match[1],
    })
    const res = await client.sessions.get()
    const user = res?.user as
      | { id?: string; email?: string }
      | null
      | undefined
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401)
    c.set("user", { id: user.id, email: user.email ?? "unknown@slyxup.com" })
    await next()
  } catch (err) {
    console.error(
      JSON.stringify({ msg: "auth-verify-failed", err: String(err) })
    )
    return c.json({ error: "Unauthorized" }, 401)
  }
})
