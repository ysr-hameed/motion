import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat"
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  type GenerateTextOnFinishCallback,
  type ToolSet,
} from "ai"
import { createPacedFetch } from "./rate-limit"
import { buildTools, CANVAS } from "./remotion/tools"
import { SKILL_IDS } from "./remotion/skills.generated"
import { CompositionStore } from "./remotion/store"

/** Vercel AI Gateway, OpenAI-compatible. */
const MODEL = "alibaba/qwen3.7-flash"
const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1"

/**
 * Ceiling on model round trips per turn.
 *
 * The gateway allows 5 requests a minute for this key, so every step costs
 * ~12s of wall time (see rate-limit.ts). This is not a CPU limit — a Durable
 * Object waits for free — it is a patience limit, so it is set from the
 * workflow rather than guessed: skills, plan, write, validate, preview, review
 * and a closing sentence is eight steps, and a rejected write that has to be
 * re-issued pushes it past ten. Setting this lower silently truncated turns
 * before the agent ever spoke, which read as a crash.
 */
const MAX_STEPS = 12

const FRAME_RANGE = `frames 0 to ${CANVAS.maxFrames - 1}`

/**
 * The model's own notes about pacing, so a wait reads as deliberate rather
 * than broken — the paced fetch can hold a turn for several seconds.
 */
const SYSTEM = `You are SlyxUp Motion, a motion designer who writes Remotion. You design
and build motion graphics as real TSX source — never JSON, never a description
of code.

THE CUT
One composition per conversation, and it is a COMPONENT — not a Studio entry
file. The default export is the component itself. Never render <Composition>,
never pass a <Composition> to anything, and never put one in a Series or a
Sequence: that component registers a composition with Remotion's Studio and
throws when mounted, which blanks the preview. Canvas ${CANVAS.width}x${CANVAS.height} at
${CANVAS.fps}fps, ${FRAME_RANGE}. Keep clips under 30 seconds. Every clip ends on
something worth remembering: an overshoot landing, a masked reveal, a rack
focus, a scale punch.

HOW TO WORK
The canvas is stated above — you do not need to ask for it. get_canvas also
reports the current version, which is worth a call only when you need it.
1. load_skill — for every topic the brief touches, BEFORE you write that code.
   Not a fallback when stuck; part of the normal path. The Remotion API moves
   and memory contradicts it, and a wrong prop renders as a blank frame.
   Always: timing, sequencing, compositions. Then: animations, transitions,
   effects, shapes, spring, interpolate, easing, audio, images, video, fonts.
2. plan_motion — beats with real frame numbers, real props, real easing. A plan
   names what you are about to type. "Add a nice transition" is not a plan.
3. write_composition — the WHOLE file in one call. Every import, every
   component, every beat, the default export.
4. validate_composition, then review_motion on the source, then fix what it
   actually found with edit_file.
5. preview_composition — ONE preview, once, at the end.
6. Then STOP and close with one sentence. After the preview the model is not
   given tools again, so anything you still want to do must happen before it.
   A turn that ends on tool calls looks like a crash to the person reading it.

Be economical. One plan, one write, at most one revise, one review, one
preview. Re-reading the source you just wrote costs a request and tells you
nothing you do not already have.

MOTION QUALITY
The difference between motion that reads as designed and motion that reads as a
slide deck:
- Anticipation before movement, and a settle after it. spring() for arrivals.
- Overlap, never a sequence of isolated blocks. One thing moves while the next
  is already starting.
- Layered depth: at least one element moving in space, not everything fading.
- Curves with intent. Easing.bezier(...) and spring(), never default linear.
- Hierarchy: the eye must land somewhere on frame 1, and the last frame must
  resolve rather than stop.
- Restraint: one idea per beat, and enough space to let it land.

BEHAVIOUR
- Say nothing between tool calls. That is private work. The interface shows
  every call, its input and its result.
- Never narrate or restate the request. Never describe a preview you have not
  read, and never claim a write worked unless the result says ok:true.
- ALWAYS finish the turn with one short sentence saying what is now on stage.
  A turn that ends on tool calls alone leaves the user looking at a silent
  transcript, which reads as a crash.
- Change only what the request touches. Same names, same structure, same timing
  for everything else. "Faster" means retiming, not restyling.
- If a tool returns an error, fix the thing it named and call it once more.
  Do not repeat an identical failing call. A rejected write means nothing was
  saved — fix the errors and call write_composition again, not edit_file.
- Ask one question only when the subject itself is unclear. Never ask about
  colour, pacing or mood — decide those yourself.

Every id you can pass to load_skill:
${SKILL_IDS.join(", ")}`

export interface ChatState {
  /** modelId -> epoch ms before which the model is skipped. */
  cooldown?: Record<string, number>
}

export class Chat extends AIChatAgent<Env, ChatState> {
  maxPersistedMessages = 500
  initialState: ChatState = {}

  private store: CompositionStore | undefined

  /**
   * Raw DDL for the composition store.
   *
   * The Agents SDK's `sql` helper is typed for SELECT and `ctx` is protected,
   * so the store needs one explicit way to create its tables. Exposed as a
   * narrow method rather than a cast so the seam stays obvious.
   */
  execDdl(statement: string): void {
    this.ctx.storage.sql.exec(statement)
  }

  /**
   * Serves the current composition to the browser's Remotion player.
   *
   * This is a separate HTTP sub-path rather than part of the chat transcript,
   * because the player needs the source and the model does not: shipping the
   * whole file through a tool result would put thousands of tokens of code
   * into the context on every preview, which is exactly the bloat that made
   * the previous implementation expensive.
   *
   * Everything not claimed here falls through to AIChatAgent, which owns
   * /get-messages and the rest of its own routing.
   */
  async onRequest(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname
    const store = this.store ?? new CompositionStore(this)

    if (path.endsWith("/composition")) {
      const { code, plan, version } = store.current()
      return Response.json({ code, plan, version })
    }

    if (path.endsWith("/versions")) {
      const { version } = store.current()
      return Response.json({
        current: version,
        versions: store.versions().map((v) => ({
          n: v.n,
          lines: v.code.split("\n").length,
          bytes: v.code.length,
          title: v.plan?.title ?? null,
        })),
      })
    }

    return super.onRequest(request) as Promise<Response>
  }

  private coolDown(modelId: string) {
    this.setState({
      ...(this.state ?? {}),
      cooldown: { ...(this.state?.cooldown ?? {}), [modelId]: Date.now() + 90_000 },
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

    this.store ??= new CompositionStore(this as never)
    const tools = buildTools(this.store, this as never)

    // One paced fetch per turn: every model call, including each tool-loop
    // step, goes through it, so the 5-req/min gateway limit is respected
    // without the agent having to know it exists.
    /**
     * openai-compatible, not @ai-sdk/openai.
     *
     * The gateway speaks the OpenAI wire format but serves Qwen, whose
     * reasoning arrives in a `delta.reasoning` field. @ai-sdk/openai only maps
     * OpenAI's own Responses API reasoning, so the chain of thought was being
     * dropped and the UI showed no thinking at all. The compatible provider maps
     * `delta.reasoning` directly, which is exactly what a third-party
     * OpenAI-compatible endpoint needs.
     */
    const openai = createOpenAICompatible({
      name: "gateway",
      baseURL: GATEWAY_BASE,
      apiKey,
      fetch: createPacedFetch() as typeof fetch,
    })

    const result = streamText({
      model: openai(MODEL),
      system: SYSTEM,
      tools,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        // The model has a 991k context window, so pruning is only here to keep
        // each request cheap — it is not a hard constraint. Reasoning and old
        // tool output are dead weight once a newer turn exists.
        reasoning: "before-last-message",
        toolCalls: "before-last-2-messages",
      }),
      stopWhen: stepCountIs(MAX_STEPS),
      /**
       * Ask the model to show its working.
       *
       * qwen3.7-flash advertises `reasoning` and `include_reasoning`, so the
       * chain of thought comes back as real reasoning parts and the UI can show
       * it live instead of leaving the user watching a spinner. Effort is kept
       * low: this is a code-writing agent, and a long deliberation spends one of
       * five requests a minute without making the cut better.
       */
      providerOptions: {
        gateway: { reasoningEffort: "low" },
      },
      /**
       * Guarantee the turn ends in words.
       *
       * Observed in testing: the model ran the whole workflow correctly —
       * skills, plan, write, validate, review, preview — and then kept finding
       * more work, burning every step on tool calls. The transcript ended on a
       * tool result with no sentence, which reads as a crash to the person
       * watching it.
       *
       * After the first preview_composition the model gets no tools for the
       * rest of the turn. It can still write; it just cannot start new work,
       * so the turn closes with a sentence. Preview is therefore the LAST tool
       * of the turn, which is why the workflow above orders it after the review.
       */
      prepareStep: ({ steps }) => {
        const previewed = steps.some((s) =>
          s.toolCalls.some((c) => c.toolName === "preview_composition")
        )
        return { toolChoice: previewed ? "none" : "auto" }
      },
      // A rate limit answers "Retry after 40s"; the paced fetch already waits
      // that long, so a second layer of retrying only multiplies the delay.
      maxRetries: 0,
      abortSignal: options?.abortSignal,
      onFinish,
      onError: (error) => {
        this.coolDown("alibaba/qwen3.7-flash")
        console.error(JSON.stringify({ msg: "agent-model-error", err: String(error) }))
      },
    })

    return result.toUIMessageStreamResponse()
  }
}
