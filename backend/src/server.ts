import { routeAgentRequest } from "agents"
import { Chat, modelChain } from "./chat"

export { Chat }

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        model: modelChain(env)[0],
        provider: "vercel-ai-gateway",
      })
    }

    // Everything under /agents/* is the Durable Object. Returned completely
    // unchanged — re-wrapping the response breaks the WebSocket upgrade.
    const agentResponse = await routeAgentRequest(request, env)
    if (agentResponse) return agentResponse

    // Anything else is the frontend.
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>