import { routeAgentRequest } from "agents"
import { Chat, DEFAULT_MODEL, MODELS } from "./chat"
import { handleAccount } from "./api/account"
import { handleAssets, handlePublicAsset, handleSharePage } from "./api/assets"
import { handleContact } from "./api/contact"
import { handleKeys } from "./api/keys"
import { handleInternalSync, handleResources } from "./api/resources"
import { handleTeam } from "./api/team"
import { toErrorResponse } from "./lib/api-error"
import { handlePreflight, withCors } from "./lib/cors"
import { apiRateLimit } from "./middleware/rate-limit-api"
import { logRequest } from "./middleware/request-logger"
import { requireAuth } from "./middleware/require-auth"

export { Chat }

/** The default model; the switcher list lives in chat.ts (MODELS). */

/**
 * The frontend is served from Cloudflare Pages at motion.slyxup.com and the
 * agent + API live on workers.dev, so every browser call is cross-origin.
 * CORS is handed to routeAgentRequest for /agents/* (it sets headers on the
 * upgrade response itself — re-wrapping a 101 breaks the WebSocket); REST
 * responses are wrapped with withCors below.
 *
 * Auth lives in SlyxUp Stack, not here: the browser signs in against the
 * Stack auth service and sends `Authorization: Bearer <sessionToken>` (or the
 * `slyxup_session` cookie, or `X-API-Key` for Business keys). /agents/*
 * forwarding stays untouched — each chat session id is an unguessable
 * capability URL — while every /api/* route validates first. Public asset
 * reads (/pub/*) and share pages (/v/*) are unguessable-token URLs by design.
 */
const AGENT_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://motion.slyxup.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Publishable-Key",
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    const origin = request.headers.get("origin")
    const started = Date.now()

    // Preflight for the browser's cross-origin calls.
    if (request.method === "OPTIONS") {
      const preflight = handlePreflight(request, origin)
      if (preflight) return preflight
    }

    if (url.pathname === "/api/health") {
      const resp = withCors(
        Response.json({
          ok: true,
          model: DEFAULT_MODEL,
          models: MODELS,
          provider: "vercel-ai-gateway",
          auth: "slyxup-stack",
        }),
        origin,
      )
      ctx.waitUntil(Promise.resolve().then(() => logRequest(request, 200, Date.now() - started)))
      return resp
    }

    // Public asset reads + share pages (unguessable tokens, no session needed).
    if (url.pathname.startsWith("/pub/")) {
      const token = decodeURIComponent(url.pathname.slice("/pub/".length))
      const resp = withCors(await handlePublicAsset(request, env, token), origin)
      ctx.waitUntil(Promise.resolve().then(() => logRequest(request, resp.status, Date.now() - started)))
      return resp
    }
    if (url.pathname.startsWith("/v/")) {
      const token = decodeURIComponent(url.pathname.slice("/v/".length))
      return handleSharePage(request, env, token)
    }

    // DO → REST metadata sync. Signed by INTERNAL_SECRET, not a user session.
    if (url.pathname.startsWith("/api/internal/")) {
      const resp = withCors(await handleInternalSync(request, env, url), origin)
      ctx.waitUntil(Promise.resolve().then(() => logRequest(request, resp.status, Date.now() - started)))
      return resp
    }

    // Public contact form (IP rate-limited inside the handler).
    if (url.pathname === "/api/contact") {
      const resp = withCors(await handleContact(request, env), origin)
      ctx.waitUntil(Promise.resolve().then(() => logRequest(request, resp.status, Date.now() - started)))
      return resp
    }

    // Authenticated REST API.
    if (url.pathname.startsWith("/api/")) {
      try {
        const authed = await requireAuth(request, env)
        if ("response" in authed) {
          const resp = withCors(authed.response, origin)
          ctx.waitUntil(Promise.resolve().then(() => logRequest(request, resp.status, Date.now() - started)))
          return resp
        }
        const { ctx: appCtx } = authed

        const limited = await apiRateLimit(appCtx.session.user.id, env)
        if (limited) {
          const resp = withCors(limited, origin)
          ctx.waitUntil(
            Promise.resolve().then(() => logRequest(request, 429, Date.now() - started, appCtx.session.user.id)),
          )
          return resp
        }

        const resp =
          url.pathname.startsWith("/api/auth/")
            ? await handleAccount(request, appCtx, url)
            : url.pathname.startsWith("/api/team")
              ? await handleTeam(request, appCtx, url)
              : url.pathname.startsWith("/api/keys")
                ? await handleKeys(request, appCtx, url)
                : url.pathname === "/api/assets/upload" ||
                    url.pathname === "/api/brand-kit/upload" ||
                    url.pathname === "/api/assets/file" ||
                    (url.pathname.startsWith("/api/exports/") && url.pathname.endsWith("/share"))
                  ? await handleAssets(request, appCtx, url)
                  : await handleResources(request, appCtx, url)
        const out = withCors(resp, origin)
        ctx.waitUntil(
          Promise.resolve().then(() => logRequest(request, out.status, Date.now() - started, appCtx.session.user.id)),
        )
        return out
      } catch (err) {
        const resp = withCors(toErrorResponse(err), origin)
        ctx.waitUntil(Promise.resolve().then(() => logRequest(request, resp.status, Date.now() - started)))
        return resp
      }
    }

    // Everything under /agents/* is the Durable Object. The response is
    // returned completely untouched — that is what keeps the socket open.
    const agentResponse = await routeAgentRequest(request, env, { cors: AGENT_CORS })
    if (agentResponse) return agentResponse

    return withCors(new Response("Not found", { status: 404 }), origin)
  },
} satisfies ExportedHandler<Env>
