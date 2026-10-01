import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { streamSSE } from "hono/streaming"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ModelMessage,
  type UIMessage,
} from "ai"
import { and, eq } from "drizzle-orm"
import { requireAuth } from "../lib/auth"
import { AiNotConfiguredError } from "../lib/ai-types"
import { getDb } from "../lib/db"
import { conversations, messages, projects, renderErrors } from "../db/schema"
import { createAgentContext } from "../lib/agent/context"
import { buildAgent } from "../lib/agent/agent"
import { buildTools } from "../lib/agent/tools"
import {
  appendMessage,
  createConversation,
  getConversation,
  listConversations,
  loadMessages,
  readCanvas,
} from "../lib/agent/store"
import type { Env } from "../env"

const app = new Hono<Env>()

app.use("/*", requireAuth)

/**
 * Reject oversize payloads before JSON parse + Zod walk burn Worker CPU.
 *
 * The size is derived from what the client actually sends, not a guess:
 * reference images are downscaled in the browser (1024px, JPEG) and only
 * the newest message carries their bytes — older turns are already in D1
 * and the server dedupes them by id. So a realistic turn is a few hundred
 * KB of text plus at most 3 × ~700KB images. 2.5MB leaves headroom over
 * that while still rejecting junk well before it reaches the parser, which
 * matters most on CPU-capped plans where JSON.parse is the top cost.
 */
app.use(
  "/*",
  bodyLimit({
    maxSize: 2.5 * 1024 * 1024,
    onError: (c) =>
      c.json(
        { error: "Request too large — remove reference images and retry." },
        413
      ),
  })
)

/** Minimal UIMessage validation — parts stay opaque (rich, never plain text). */
const uiMessageSchema = z.object({
  id: z.string().max(120),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.unknown()).default([]),
})

const chatSchema = z.object({
  projectId: z.string().min(1).max(80),
  conversationId: z.string().min(1).max(80),
  messages: z.array(uiMessageSchema).min(1).max(100),
  /** Turn depth. Optional so older clients keep working unchanged. */
  mode: z.enum(["standard", "advanced"]).optional(),
})

async function ownedProject(
  database: D1Database,
  projectId: string,
  userId: string
): Promise<boolean> {
  const db = getDb(database)
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1)
    .all()
  return !!row
}

async function ownedConversation(
  database: D1Database,
  conversationId: string,
  projectId: string,
  userId: string
): Promise<boolean> {
  const db = getDb(database)
  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.projectId, projectId),
        eq(conversations.userId, userId)
      )
    )
    .limit(1)
    .all()
  return !!row
}

import { pruneForModel, userTextOf } from "../lib/agent/history"
import { smalltalkReply } from "../lib/smalltalk"
// Static imports (evaluated once at isolate cold-start, not per request):
// the old dynamic `await import()` inside the chat handler re-evaluated
// these modules on every turn, billing their parse cost to the request's
// CPU budget — one of the contributors to the prod `exceededCpu` deaths.
import { contractsFor, fontRules } from "../lib/remotion-guide"
import { fontCatalogue } from "../lib/font-catalogue.generated"
import { CHAT_TURN_COST, refund, spend } from "../lib/credits"

import {
  TURN_LIMITS,
  isContinueMessage,
  resolveMode,
  stepsUsedOf,
} from "../lib/agent/turns"
import { isEmptyParts, toolActivity, truncatedByLength } from "../lib/agent/settled-parts"
import { loadTurnPreamble } from "../lib/agent/preamble"

/**
 * Agent chat (AI SDK UIMessage stream).
 *
 * Browser → this route → AI SDK ToolLoopAgent → Vercel AI Gateway → model.
 * The SDK manages the multi-step tool loop, streaming, stop conditions and
 * tool-result routing. History persists as rich UIMessage parts (text +
 * tool calls + tool results), so reloads and conversation switches keep
 * full fidelity. The MODEL gets the pruned copy (pruneForModel) — same
 * conversation, a fraction of the serialization CPU per step.
 */
app.post("/chat", zValidator("json", chatSchema), async (c) => {
  const user = c.get("user")
  const body = c.req.valid("json")

  const ctx = createAgentContext({
    database: c.env.DB,
    userId: user.id,
    projectId: body.projectId,
    conversationId: body.conversationId,
  })

  // Ownership + creation-mode in ONE round-trip (see lib/agent/preamble.ts).
  // The canvas is NOT here — it lives in an R2 JSON file, so it stays a
  // separate read below.
  const pre = await loadTurnPreamble(c.env.DB, body.projectId, body.conversationId, user.id)
  if (!pre.projectOk) {
    return c.json({ error: "Not found" }, 404)
  }
  if (!pre.conversationOk) {
    return c.json({ error: "Conversation not found" }, 404)
  }
  const freshProject = pre.freshProject

  // Persist any new user messages the client sent (dedupe by id).
  // Continuation tokens are NEVER persisted: they are transport, not
  // history — storing them would pollute the model context and break
  // step counting below.
  const stored = await loadMessages(ctx)
  const incoming = body.messages as UIMessage[]
  const freshRealUser = incoming.filter(
    (m) => m.role === "user" && !isContinueMessage(m) && !stored.some((s) => s.id === m.id)
  )
  for (const m of freshRealUser) {
    await appendMessage(ctx, { role: "user", parts: m.parts ?? [] })
  }

  const uiHistory: UIMessage[] = [
    ...(stored.map((m) => ({
      id: m.id,
      role: m.role,
      parts: (m.parts ?? []) as UIMessage["parts"],
    })) as UIMessage[]),
    ...freshRealUser,
  ]

  // Continuation? The latest incoming user message is the token the
  // client auto-sends to chain the next single step of an open turn.
  // No smalltalk, no charge — the turn already paid on its first step.
  const isContinuation =
    incoming.length > 0 && isContinueMessage(incoming[incoming.length - 1]!)
  // A continuation with no real brief in history is a hand-crafted free
  // step, not a resume — refuse it. (Legit retries always have the
  // original user message persisted from the turn's first request.)
  if (isContinuation && !uiHistory.some((m) => m.role === "user")) {
    return c.json({ error: "Nothing to continue — describe the clip first." }, 400)
  }

  // Smalltalk short-circuit: pure chit-chat never reaches the model.
  // Deterministic, instant, zero gateway cost — and the model can never
  // "inspect the project" in response to a "hi". Attachments mean task
  // context, so image-bearing turns always go through. Skipped for
  // continuations (the turn already started; there is no new brief).
  const latestUser = [...uiHistory].reverse().find((m) => m.role === "user")
  if (latestUser && !isContinuation) {
    const { text, hasFiles } = userTextOf(latestUser)
    const canned = !hasFiles ? smalltalkReply(text) : null
    if (canned) {
      await appendMessage(ctx, { role: "assistant", parts: [{ type: "text", text: canned }] })
      console.log(JSON.stringify({ msg: "agent-smalltalk", projectId: body.projectId }))
      const short = createUIMessageStream({
        execute: ({ writer }) => {
          const id = crypto.randomUUID()
          writer.write({ type: "text-start", id })
          writer.write({ type: "text-delta", id, delta: canned })
          writer.write({ type: "text-end", id })
        },
      })
      return createUIMessageStreamResponse({ stream: short })
    }
  }

  // Step cap: each request runs exactly one model step, so count the
  // assistant step-messages since the last real user message. At the cap
  // the turn closes deterministically (no model call, ~1ms CPU) instead
  // of looping until the plan kills the request.
  const mode = resolveMode(body.mode)
  const limits = TURN_LIMITS[mode]
  const stepsUsed = stepsUsedOf(uiHistory)
  if (stepsUsed >= limits.maxSteps) {
    const didPreview = uiHistory.some(
      (m) =>
        m.role === "assistant" &&
        ((m.parts ?? []) as Array<{ type?: string; toolCallId?: string }>).some(
          (p) => p?.type === "tool-preview_composition" || p?.type === "tool-render_video"
        )
    )
    const closing = didPreview
      ? "Saved — it's on stage now. Tell me what to change next."
      : "I hit my step limit for this turn — press Retry and I'll continue from the latest version."
    await appendMessage(ctx, { role: "assistant", parts: [{ type: "text", text: closing }] })
    console.log(JSON.stringify({ msg: "agent-step-cap", projectId: body.projectId, stepsUsed }))
    const short = createUIMessageStream({
      execute: ({ writer }) => {
        const id = crypto.randomUUID()
        writer.write({ type: "text-start", id })
        writer.write({ type: "text-delta", id, delta: closing })
        writer.write({ type: "text-end", id })
      },
    })
    return createUIMessageStreamResponse({ stream: short })
  }

  // Credit gate: 1 credit per real agent turn (charged once, on the first
  // step — continuations ride the same turn). Pure smalltalk (answered
  // above, never reached the model) is free. The deduct happens BEFORE
  // the model runs so an unpaid turn can never start; runs that fail to
  // start are refunded below, aborted mid-runs are not (work was done).
  const callerToken =
    (c.req.header("Authorization") ?? "").replace(/^Bearer\s+/i, "") || undefined
  if (!isContinuation && freshRealUser.length > 0) {
    const charge = await spend(
      getDb(c.env.DB),
      c.env,
      user.id,
      callerToken,
      CHAT_TURN_COST,
      "agent-turn",
      body.conversationId
    )
    if (!charge.ok) {
      const s = charge.status
      return c.json(
        {
          error: s.unlimited
            ? "Couldn't verify your plan — retry and I'll pick it up."
            : `You've used all ${s.allowance} credits on the ${s.tierLabel} plan (resets ${new Date(s.resetsAt).toLocaleDateString()}). Upgrade for more, or wait for the reset.`,
          code: "insufficient_credits",
          credits: s,
        },
        402
      )
    }
  }

  // History conversion must never kill the turn: malformed stored parts
  // fall back to the latest user message alone instead of 500ing.
  let modelMessages: ModelMessage[]
  try {
    modelMessages = await convertToModelMessages(pruneForModel(uiHistory))
  } catch (err) {
    console.error(JSON.stringify({ msg: "agent-history-fallback", err: String(err) }))
    const last = latestUser ?? uiHistory[uiHistory.length - 1]
    modelMessages = last
      ? await convertToModelMessages(pruneForModel([last] as UIMessage[]))
      : []
  }
  // Grounding (context management): the canvas contract for THIS cut plus the
  // typeface catalogue. The full Remotion skill reference is not re-sent —
  // validate/repair tools close that loop. Passed via the `system` option
  // (never as a system message inside `messages` — the SDK flags those as a
  // prompt-injection risk). Advisory: a failed read still runs the turn.
  let canvasHint: string | undefined
  let systemPreamble: string | undefined
  try {
    const canvas = await readCanvas(ctx)
    canvasHint = `${canvas.width}x${canvas.height} @${canvas.fps}fps, ${canvas.durationInFrames} frames`
    systemPreamble = `${contractsFor(canvas)}\n\n${fontRules(fontCatalogue())}`
  } catch {
    /* grounding is advisory — the run proceeds without it */
  }
  const tools = buildTools(ctx)

  console.log(
    JSON.stringify({
      msg: "agent-start",
      projectId: body.projectId,
      conversationId: body.conversationId,
      history: uiHistory.length,
      fresh: freshProject,
      step: stepsUsed + 1,
      continuation: isContinuation,
    })
  )

  let built: ReturnType<typeof buildAgent>
  try {
    built = buildAgent(c.env, tools, { freshProject, canvasHint, mode })
  } catch (err) {
    if (err instanceof Error && /not configured/i.test(err.message)) {
      return c.json({ error: "AI isn't set up on this server yet. Try again in a moment." }, 503)
    }
    throw err
  }

  // Walk the model chain when the primary fails to start (queued /
  // gateway hiccup): the Oct 1 incident was a single model with nowhere
  // to fall through to, so every retry piled onto the same queued model
  // until the client aborted (499) after 152s of "Composing".
  console.log(
    JSON.stringify({
      msg: "agent-model",
      projectId: body.projectId,
      conversationId: body.conversationId,
      model: built.modelId,
      chain: built.chain,
    })
  )

  // The model is called with `stream()` and its chunks are RELAYED as they
  // arrive, so the user watches the reply get written.
  //
  // This used to be `generate()`, buffered until complete, then dumped as
  // one burst. The cost was invisible in code and brutal in the UI: a single
  // step takes 77–88s, and for every one of those seconds the client had
  // received nothing but a `start` frame — so the assistant bubble rendered
  // a bare "Thinking…" spinner with no text, no tool chips, no idea what was
  // happening, until the very end. The model writes "On it —" and the plan
  // FIRST, so streaming them lands them on screen in about two seconds.
  //
  // The old note here argued non-streaming on CPU grounds (~18.8ms of frame
  // parsing versus ~0.7ms for one body read). That CPU ceiling is gone, and
  // the comment was quietly describing a UX regression as an optimisation.
  // The chain fallback survives: nothing is emitted until the first chunk
  // arrives, so a model that fails to start still falls through to the next
  // one in the same response.
  let activeModel = built.modelId
  const t0 = Date.now()

  return streamSSE(c, async (stream) => {
    // SSE frames are the same wire format createUIMessageStream emits, so
    // the client's existing useChat transport reads this unchanged.
    // The AI SDK's UI message stream has a precise wire format: bare
    // `data: {json}` frames terminated by `data: [DONE]`, with NO `event:`
    // line. The client's parser ignores named events, so writing them here
    // produced a stream the browser could not read at all — an empty chat
    // with no error anywhere. Format verified against the SDK's own
    // JsonToSseTransformStream.
    const emit = (part: unknown) =>
      stream.writeSSE({ data: JSON.stringify(part) })
    const done = () => stream.writeSSE({ data: "[DONE]" })
    const fail = async (message: string) => {
      // The SDK's error chunk shape. Still terminated with [DONE] so the
      // client settles the request instead of hanging on a half-open stream.
      await emit({ type: "error", errorText: message })
      await done()
      console.error(JSON.stringify({ msg: "agent-failed", err: message }))
    }

    try {
      // The SDK emits `start` itself as the first chunk of the relayed
      // stream. Emitting one here too gave the client two opens for the same
      // message, which is how a bubble could end up empty and rendering a
      // bare "Thinking…" after content had already been sent.
      const messageId = crypto.randomUUID()

      const openOn = (id: string) => {
        const retry = buildAgent(c.env, tools, {
          freshProject,
          canvasHint,
          // The renderer contract goes IN here, not as generate({ system }).
          // The SDK's Agent spreads options over its own settings, so a
          // per-call `system` replaces the whole manual — which is exactly
          // what used to happen, leaving the model with nothing but the
          // canvas contract and no rules at all.
          canvasPreamble: systemPreamble,
          modelId: id,
          mode,
          // Real progress, from a real event: the tool is about to execute.
          // `transient` keeps it out of the persisted message — it is a
          // live signal, not conversation content.
          onToolStart: (toolName: string) => {
            void emit({
              type: "data-toolstart",
              data: { tool: toolName, at: Date.now() - t0 },
              transient: true,
            })
          },
        })
        activeModel = id
        return retry
      }

      // Relay one model's chunks into the SSE as they arrive.
      //
      // `emitted` is what makes the model chain still work: nothing is
      // written until the first chunk, so a model that fails to start (or a
      // gateway that 5xxs) throws before the client has seen anything and
      // the caller can fall through to the next model in the same response.
      // Once a single chunk is out, the response is committed and an error
      // has to surface as an error chunk.
      // A holder object rather than a reassigned `let`: the write happens
      // inside the SDK's onFinish callback, and narrowing a closure-assigned
      // local narrows it to `never` after the loop.
      const settled: { parts?: UIMessage["parts"]; finishReason?: string } = {}
      const relay = async (id: string): Promise<boolean> => {
        const agent = openOn(id).agent
        let emitted = false
        const chunks = agent
          .stream({ messages: modelMessages })
          .toUIMessageStream({
            generateMessageId: () => messageId,
            sendReasoning: true,
            // The SDK closes the message with `finish`, but a cut-off write
            // needs one more sentence AFTER the tool error — and nothing may
            // be written after the terminator. Owning `finish` lets the
            // correction land inside the stream the user is reading.
            sendFinish: false,
            // The SDK's default swallows the reason; we log it and show ours.
            onError: (err) => {
              console.error(JSON.stringify({ msg: "agent-chunk-error", model: id, err: String(err) }))
              return "An error occurred."
            },
            onFinish: (event) => {
              settled.parts = event.responseMessage?.parts
              settled.finishReason = event.finishReason
            },
          })
        for await (const chunk of chunks) {
          // Written as it arrives — this loop is the whole fix. Collecting
          // chunks and emitting after the loop restores the buffering bug
          // while still looking like "streaming" in the diff.
          await emit(chunk)
          emitted = true
        }
        return emitted
      }

      let ok = false
      try {
        ok = await relay(built.modelId)
      } catch (err) {
        console.error(JSON.stringify({ msg: "agent-model-failed", model: built.modelId, err: String(err) }))
      }
      if (!ok) {
        // Nothing reached the client, so the step is still free to fall
        // through to the next model without the user having seen a seam.
        for (const fallback of built.chain.slice(1)) {
          try {
            if (await relay(fallback)) {
              console.log(JSON.stringify({ msg: "agent-model-fallback", to: fallback }))
              ok = true
              break
            }
          } catch (e2) {
            console.error(JSON.stringify({ msg: "agent-model-failed", model: fallback, err: String(e2) }))
          }
        }
      }

      if (!ok) {
        // Never reached a model — refund the credit it reserved.
        c.executionCtx.waitUntil(
          refund(getDb(c.env.DB), user.id, CHAT_TURN_COST, "agent-turn-failed", body.conversationId).catch(
            () => {}
          )
        )
        await fail("The AI stumbled starting up — retry and I'll pick it up.")
        return
      }

      // Terminator. Without it the client's stream reader never sees
      // completion and the turn stays pending until it times out.
      const parts = settled.parts ?? []
      const finishReason = settled.finishReason

      // A cut-off tool call is invisible to the model as a tool error: the
      // SDK never ran it, so nothing in the tool vocabulary tells it WHY.
      // Left alone the model re-issues the identical oversized write, hits
      // the identical cap, and repeats — six identical plans, six 16.2K
      // responses, nothing saved.
      //
      // An assistant text part is the reliable channel: the model reads it
      // on its next step AND the user sees it, so the correction and the
      // explanation are one sentence. It goes on the wire AND into the
      // stored row, so a reload keeps it.
      if (truncatedByLength(parts, finishReason)) {
        const note =
          "That write didn't complete — the response ran out before the file " +
          "finished, so nothing was saved and I won't resend it unchanged. Rebuilding " +
          "it leaner now (grain via noise2D instead of an embedded image, fewer lines)."
        parts.push({ type: "text", text: note } as unknown as UIMessage["parts"][number])
        const noteId = crypto.randomUUID()
        await emit({ type: "text-start", id: noteId })
        await emit({ type: "text-delta", id: noteId, delta: note })
        await emit({ type: "text-end", id: noteId })
      }

      await emit({ type: "finish" })
      await done()

      const empty = isEmptyParts(parts)
      const toolParts = toolActivity(parts).length
      const elapsed = Date.now() - t0

      console.log(
        JSON.stringify({
          msg: "agent-finish",
          projectId: body.projectId,
          conversationId: body.conversationId,
          model: activeModel,
          ms: elapsed,
          toolParts,
          status: finishReason,
        })
      )

      // Persistence is off the response path — the client already has the
      // text, and waitUntil buys the 30s of headroom a D1 write needs.
      c.executionCtx.waitUntil(
        (async () => {
          try {
            if (!empty) {
              await appendMessage(ctx, { role: "assistant", parts })
            }
          } catch (err) {
            console.error(JSON.stringify({ msg: "agent-persist-failed", err: String(err) }))
          }
        })()
      )
    } catch (err) {
      console.error(
        JSON.stringify({ msg: "agent-failed", model: activeModel, ms: Date.now() - t0, err: String(err) })
      )
      await fail("Something broke mid-run — press Retry and I'll pick it up.")
    }
  })
})

// ---- conversation management ----

app.get("/conversations/:projectId", async (c) => {
  const user = c.get("user")
  const projectId = c.req.param("projectId")
  if (!(await ownedProject(c.env.DB, projectId, user.id))) {
    return c.json({ error: "Not found" }, 404)
  }
  const ctx = createAgentContext({
    database: c.env.DB,
    userId: user.id,
    projectId,
    conversationId: "none",
  })
  const rows = await listConversations(ctx)
  return c.json({
    conversations: rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  })
})

app.post(
  "/conversations",
  zValidator("json", z.object({ projectId: z.string().min(1).max(80), title: z.string().max(120).optional() })),
  async (c) => {
    const user = c.get("user")
    const body = c.req.valid("json")
    if (!(await ownedProject(c.env.DB, body.projectId, user.id))) {
      return c.json({ error: "Not found" }, 404)
    }
    const ctx = createAgentContext({
      database: c.env.DB,
      userId: user.id,
      projectId: body.projectId,
      conversationId: "none",
    })
    const conv = await createConversation(ctx, body.title)
    return c.json({ conversation: conv }, 201)
  }
)

app.get("/conversations/:projectId/:conversationId/messages", async (c) => {
  const user = c.get("user")
  const projectId = c.req.param("projectId")
  const conversationId = c.req.param("conversationId")
  if (!(await ownedConversation(c.env.DB, conversationId, projectId, user.id))) {
    return c.json({ error: "Not found" }, 404)
  }
  const ctx = createAgentContext({
    database: c.env.DB,
    userId: user.id,
    projectId,
    conversationId,
  })
  const conv = await getConversation(ctx)
  const stored = await loadMessages(ctx)
  return c.json({
    conversation: conv,
    messages: stored.map((m) => ({ id: m.id, role: m.role, parts: m.parts ?? [] })),
  })
})

/** Seed a fresh conversation from the legacy plain-text thread (continuity). */
app.post(
  "/conversations/:conversationId/seed",
  zValidator(
    "json",
    z.object({
      messages: z
        .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }))
        .max(20),
    })
  ),
  async (c) => {
    const user = c.get("user")
    const conversationId = c.req.param("conversationId")
    const body = c.req.valid("json")
    const db = getDb(c.env.DB)
    const [conv] = await db
      .select({ id: conversations.id, projectId: conversations.projectId })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)))
      .limit(1)
      .all()
    if (!conv) return c.json({ error: "Not found" }, 404)
    if (!(await ownedProject(c.env.DB, conv.projectId, user.id))) {
      return c.json({ error: "Not found" }, 404)
    }
    const existing = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .limit(1)
      .all()
    if (existing.length > 0) return c.json({ ok: true, seeded: 0 })
    for (const m of body.messages) {
      if (!m.text.trim()) continue
      await db.insert(messages).values({
        conversationId,
        role: m.role,
        parts: [{ type: "text", text: m.text }],
      })
    }
    return c.json({ ok: true, seeded: body.messages.length })
  }
)

/** Browser player reports a real render/compile error for the recovery loop. */
app.post(
  "/errors",
  zValidator(
    "json",
    z.object({
      projectId: z.string().min(1).max(80),
      versionNo: z.number().int().min(0).optional(),
      errors: z.array(z.string().max(2000)).min(1).max(12),
    })
  ),
  async (c) => {
    const user = c.get("user")
    const body = c.req.valid("json")
    if (!(await ownedProject(c.env.DB, body.projectId, user.id))) {
      return c.json({ error: "Not found" }, 404)
    }
    const db = getDb(c.env.DB)
    await db.insert(renderErrors).values({
      projectId: body.projectId,
      versionNo: body.versionNo ?? null,
      errors: body.errors,
    })
    return c.json({ ok: true })
  }
)

export { AiNotConfiguredError }
export default app
