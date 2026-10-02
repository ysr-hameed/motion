import { createOpenAI } from "@ai-sdk/openai"
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat"
import {
  convertToModelMessages,
  pruneMessages,
  streamText,
  type GenerateTextOnFinishCallback,
  type ToolSet,
} from "ai"

/** Vercel AI Gateway, OpenAI-compatible. */
const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1"

const SYSTEM = `You are SlyxUp Motion, a direct and practical assistant.

Answer the question that was asked. Prefer a short correct answer over a long
one, and skip preamble, restating the request, and offers of further help.`

/** Comma-separated chain from AI_MODEL, e.g. "alibaba/qwen3.7-flash,alibaba/qwen3-max". */
export function modelChain(env: Env): string[] {
  const chain = (env.AI_MODEL ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
  return chain.length > 0 ? chain : ["alibaba/qwen3.7-flash"]
}

/**
 * The chat agent.
 *
 * Everything the previous implementation hand-rolled lives in the Durable
 * Object now: the multi-step loop, the transcript, and stream state.
 * `onChatMessage` is the only place the model is called and it returns a real
 * streaming response — no step cap, no continuation token, no client-side
 * re-chaining, no per-request history reserialization.
 *
 * A turn is a turn. The client sends one message and receives the whole reply.
 */
export class Chat extends AIChatAgent<Env> {
  /** Storage cap only. What reaches the model is decided by pruneMessages. */
  maxPersistedMessages = 500

  async onChatMessage(
    onFinish: GenerateTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions
  ) {
    const chain = modelChain(this.env)
    const apiKey = this.env.AI_GATEWAY_API_KEY
    if (!apiKey) {
      throw new Error(
        "AI_GATEWAY_API_KEY is not set. Add it to .dev.vars locally, " +
          "or run `wrangler secret put AI_GATEWAY_API_KEY` on the deployed Worker."
      )
    }
    let lastError: unknown

    // Walk the chain only when a model cannot even start. A mid-stream failure
    // is surfaced to the client rather than silently retried, so a partial
    // reply is never duplicated.
    for (const modelId of chain) {
      try {
        const openai = createOpenAI({ baseURL: GATEWAY_BASE, apiKey })

        const result = streamText({
          model: openai.chat(modelId),
          system: SYSTEM,
          messages: pruneMessages({
            messages: await convertToModelMessages(this.messages),
            // Reasoning and tool output from earlier steps are dead weight once
            // a newer turn exists. Dropping them makes the window grow on
            // conversation rather than on bookkeeping.
            reasoning: "before-last-message",
            toolCalls: "before-last-2-messages",
          }),
          // Without these two a cancelled turn keeps burning tokens server-side.
          abortSignal: options?.abortSignal,
          onFinish,
        })

        return result.toUIMessageStreamResponse()
      } catch (err) {
        lastError = err
        console.error(JSON.stringify({ msg: "agent-model-failed", modelId, err: String(err) }))
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("No model in the chain could be reached")
  }
}