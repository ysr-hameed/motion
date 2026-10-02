import { routeAgentRequest } from "agents"
import { Chat, modelChain } from "./chat"

export { Chat }

/**
 * The frontend is served from Cloudflare Pages at motion.slyxup.com and the
 * agent lives on workers.dev, so every browser call to /agents/* is
 * cross-origin. CORS is handed to routeAgentRequest rather than applied to its
 * response afterwards — the SDK sets the headers on the upgrade response
 * itself, and re-wrapping a 101 breaks the WebSocket.
 */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://motion.slyxup.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    // Preflight for the browser's cross-origin agent calls.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS })
    }

    if (url.pathname === "/api/health") {
      return Response.json(
        {
          ok: true,
          model: modelChain(env)[0],
          provider: "vercel-ai-gateway",
          corsOrigin: CORS["Access-Control-Allow-Origin"],
        },
        { headers: CORS }
      )
    }

    // Everything under /agents/* is the Durable Object. The response is
    // returned completely untouched — that is what keeps the socket open.
    const agentResponse = await routeAgentRequest(request, env, { cors: CORS })
    if (agentResponse) return agentResponse

    return new Response("Not found", { status: 404, headers: CORS })
  },
} satisfies ExportedHandler<Env>