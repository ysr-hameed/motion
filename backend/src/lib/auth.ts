import { createMiddleware } from "hono/factory"
import { SlyxupClient } from "@slyxup/core"
import type { Env } from "../env"

export interface AuthedUser {
  id: string
  email: string
}

/** Session cache TTL: auth revocation propagates within 5 minutes. */
const SESSION_TTL_S = 300

async function sessionKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  return `sess:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`
}

/**
 * Requires a Stack session via `Authorization: Bearer <token>`.
 * Verified against the auth API, then cached in KV for 5 minutes: the
 * agent loop now makes one request PER STEP, and paying a full HTTPS
 * verify round-trip on every step would add seconds of latency per
 * turn for zero security benefit. When ALLOW_ANON is "true" (local dev
 * default), requests without credentials get a stable local-dev
 * identity — never enable that in production.
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
  const token = match[1]!

  try {
    // Fast path: KV-cached verdict (sub-millisecond CPU, no subrequest).
    const kv = c.env.SESSIONS
    if (kv) {
      const key = await sessionKey(token)
      const cached = await kv.get<{ id: string; email: string }>(key, "json")
      if (cached?.id) {
        c.set("user", { id: cached.id, email: cached.email })
        await next()
        return
      }
    }
    const client = new SlyxupClient({
      apiUrl: c.env.AUTH_API_URL,
      sessionToken: token,
    })
    const res = await client.sessions.get()
    const user = res?.user as
      | { id?: string; email?: string }
      | null
      | undefined
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401)
    const authed = { id: user.id, email: user.email ?? "unknown@slyxup.com" }
    // Cache outside the response path — never adds latency.
    if (c.env.SESSIONS) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            await c.env.SESSIONS!.put(await sessionKey(token), JSON.stringify(authed), {
              expirationTtl: SESSION_TTL_S,
            })
          } catch {
            /* cache is advisory */
          }
        })()
      )
    }
    c.set("user", authed)
    await next()
  } catch (err) {
    console.error(
      JSON.stringify({ msg: "auth-verify-failed", err: String(err) })
    )
    return c.json({ error: "Unauthorized" }, 401)
  }
})
