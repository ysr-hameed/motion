import { createOpenAI } from "@ai-sdk/openai"
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat"
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  type GenerateTextOnFinishCallback,
  type ToolSet,
} from "ai"
import { tools } from "./tools"

/** Vercel AI Gateway, OpenAI-compatible. */
const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1"

/**
 * Ceiling on model round trips within one turn. Each step is a gateway call
 * plus its tool executions, so this bounds both cost and how long a single
 * turn can occupy the Durable Object. Reached only by a genuinely long task.
 */
const MAX_STEPS = 8

const SYSTEM = `You are SlyxUp Motion, a direct and practical assistant.

Answer the question that was asked. Prefer a short correct answer over a long
one, and skip preamble, restating the request, and offers of further help.

Use the tools when the answer depends on them rather than guessing: call
get_current_time for anything about the present, and calculate for arithmetic.

Never narrate a tool call. The interface already displays which tool ran, with
its input and its result. Do not say "let me check", "I used the calculate tool",
"the tool returned", or restate the question back. Go straight from the tool
result to the answer, and when you were asked for a specific format, give only
that.`

/** Comma-separated chain from AI_MODEL, e.g. "alibaba/qwen3.7-flash,alibaba/qwen3-max". */
export function modelChain(env: Env): string[] {
  const chain = (env.AI_MODEL ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
  return chain.length > 0 ? chain : ["alibaba/qwen3.7-flash"]
}

/**
 * How long a model is skipped after it fails.
 *
 * The gateway's per-model quotas are per team and shared across regions, so a
 * 429 from one model says nothing about the next one in the chain. Skipping
 * only the offender keeps a healthy fallback usable instead of letting every
 * turn fail behind whichever model happened to be first.
 */
const COOLDOWN_MS = 90_000

export interface ChatState {
  /** modelId -> epoch ms before which the model is skipped. */
  cooldown?: Record<string, number>
}

/** Reorders the chain so cooled-down models are tried last, not dropped. */
function orderChain(chain: string[], cooldown: Record<string, number> | undefined): string[] {
  const now = Date.now()
  return [...chain].sort((a, b) => {
    const ca = cooldown?.[a] ?? 0
    const cb = cooldown?.[b] ?? 0
    // A model in cooldown sorts after one that is not.
    if ((ca > now) !== (cb > now)) return ca > now ? 1 : -1
    return 0
  })
}

/**
 * The chat agent.
 *
 * Everything the previous implementation hand-rolled lives in the Durable
 * Object now: the multi-step loop, the transcript, and stream state.
 * `onChatMessage` is the only place the model is called and it returns a real
 * streaming response — no step cap driven by CPU, no continuation token, no
 * client-side re-chaining, no per-request history reserialization.
 *
 * A turn is a turn. The client sends one message and receives the whole reply.
 */
export class Chat extends AIChatAgent<Env, ChatState> {
  /** Storage cap only. What reaches the model is decided by pruneMessages. */
  maxPersistedMessages = 500

  initialState: ChatState = {}

  /** Puts a model in cooldown so the next turn starts on a healthy one. */
  private coolDown(modelId: string) {
    this.setState({
      ...(this.state ?? {}),
      cooldown: { ...(this.state?.cooldown ?? {}), [modelId]: Date.now() + COOLDOWN_MS },
    })
  }

  async onChatMessage(
    onFinish: GenerateTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions
  ) {
    const apiKey = this.env.AI_GATEWAY_API_KEY
    if (!apiKey) {
      throw new Error(
        "AI_GATEWAY_API_KEY is not set. Add it to .dev.vars locally, " +
          "or run `wrangler secret put AI_GATEWAY_API_KEY` on the deployed Worker."
      )
    }

    // Cooled-down models are moved to the back rather than removed, so a turn
    // still has somewhere to go when every model is briefly limited.
    const chain = orderChain(modelChain(this.env), this.state?.cooldown)
    let lastError: unknown

    for (const modelId of chain) {
      try {
        const openai = createOpenAI({ baseURL: GATEWAY_BASE, apiKey })

        const result = streamText({
          model: openai.chat(modelId),
          system: SYSTEM,
          tools,
          messages: pruneMessages({
            messages: await convertToModelMessages(this.messages),
            // Reasoning and tool output from older turns are dead weight once a
            // newer turn exists. Dropping them makes the window grow on
            // conversation rather than on bookkeeping.
            reasoning: "before-last-message",
            toolCalls: "before-last-2-messages",
          }),
          // The loop, bounded. Tool results are fed back automatically, so one
          // user message can become several model round trips inside a turn.
          stopWhen: stepCountIs(MAX_STEPS),
          // Fail fast. The gateway's per-model quota is the dominant failure
          // mode and it answers "Retry after 60s", so the SDK's default three
          // attempts turned a rate limit into a turn that hung for minutes. One
          // retry absorbs a genuine blip; anything longer is better served by
          // failing now and letting the next turn use the fallback model.
          maxRetries: 1,
          // Without these two a cancelled turn keeps burning tokens server-side.
          abortSignal: options?.abortSignal,
          onFinish,
          // A provider failure — 429, 5xx — arrives HERE, not as a throw from
          // streamText. The old try/catch never saw it, so the fallback model
          // was never actually tried and a rate limit took the whole turn down.
          onError: (error) => {
            this.coolDown(modelId)
            console.error(JSON.stringify({ msg: "agent-model-error", modelId, err: String(error) }))
          },
        })

        return result.toUIMessageStreamResponse()
      } catch (err) {
        lastError = err
        this.coolDown(modelId)
        console.error(JSON.stringify({ msg: "agent-model-failed", modelId, err: String(err) }))
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("No model in the chain could be reached")
  }
}