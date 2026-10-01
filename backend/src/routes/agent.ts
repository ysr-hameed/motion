import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
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
import { conversations, messages, projects, renderErrors, versions } from "../db/schema"
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
 * The client sends at most the last 3 turns (≤3 downscaled images ≈ 2MB),
 * so anything past 6MB is junk or abuse — 413 immediately.
 */
app.use(
  "/*",
  bodyLimit({
    maxSize: 6 * 1024 * 1024,
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

import { MAX_STEPS_PER_TURN, isContinueMessage, stepsUsedOf } from "../lib/agent/turns"

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

  if (!(await ownedProject(c.env.DB, body.projectId, user.id))) {
    return c.json({ error: "Not found" }, 404)
  }
  if (!(await ownedConversation(c.env.DB, body.conversationId, body.projectId, user.id))) {
    return c.json({ error: "Conversation not found" }, 404)
  }

  const ctx = createAgentContext({
    database: c.env.DB,
    userId: user.id,
    projectId: body.projectId,
    conversationId: body.conversationId,
  })

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
  const stepsUsed = stepsUsedOf(uiHistory)
  if (stepsUsed >= MAX_STEPS_PER_TURN) {
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
  // Lean per-request grounding (context management): the canvas contract
  // for THIS cut plus the typeface catalogue. The full Remotion skill
  // reference is not re-sent — validate/repair tools close that loop.
  // Passed via the `system` option (never as a system message inside
  // `messages` — the SDK flags those as a prompt-injection risk).
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
  const t0 = Date.now()

  // Fresh project (no versions yet) → creation mode: compose the full
  // scene in one write instead of timid placeholder tweaks. One cheap
  // indexed count query; advisory only.
  let freshProject = false
  try {
    const db = getDb(c.env.DB)
    const existing = await db
      .select({ versionNo: versions.versionNo })
      .from(versions)
      .where(eq(versions.projectId, body.projectId))
      .limit(1)
      .all()
    freshProject = existing.length === 0
  } catch {
    /* creation flag is advisory */
  }

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
    built = buildAgent(c.env, tools, { freshProject, canvasHint })
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

  // Stream setup itself must not 500 the turn: a gateway hiccup here
  // becomes a retryable JSON error, not a dead SSE connection. Walk the
  // chain — a queued primary falls through to the next model instead of
  // stalling until the client aborts.
  let result: ReturnType<typeof built.agent.stream>
  let activeModel = built.modelId
  try {
    result = built.agent.stream({
      system: systemPreamble,
      messages: modelMessages,
    })
  } catch (err) {
    console.error(JSON.stringify({ msg: "agent-stream-failed", model: activeModel, err: String(err) }))
    let recovered: ReturnType<typeof built.agent.stream> | null = null
    for (const fallback of built.chain.slice(1)) {
      try {
        const retry = buildAgent(c.env, tools, {
          freshProject,
          canvasHint,
          modelId: fallback,
        })
        recovered = retry.agent.stream({ system: systemPreamble, messages: modelMessages })
        console.log(JSON.stringify({ msg: "agent-model-fallback", from: activeModel, to: fallback }))
        activeModel = fallback
        built = retry
        break
      } catch (e2) {
        console.error(JSON.stringify({ msg: "agent-stream-failed", model: fallback, err: String(e2) }))
      }
    }
    if (!recovered) {
      // The turn never reached the model — refund the credit it reserved.
      try {
        await refund(getDb(c.env.DB), user.id, CHAT_TURN_COST, "agent-turn-failed", body.conversationId)
      } catch {
        /* refund is best-effort */
      }
      return c.json({ error: "The AI stumbled starting up — retry and I'll pick it up." }, 502)
    }
    result = recovered
  }

  return result.toUIMessageStreamResponse<UIMessage>({
    originalMessages: incoming,
    onFinish: ({ responseMessage, isAborted, outcome }) => {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const parts = responseMessage.parts ?? []
            // Persist partial progress ALWAYS — including user-aborted and
            // errored runs. The old `!isAborted` guard is what made a
            // refresh after Stop/499 show "only my message": the version
            // snapshot (preview_composition) was already committed to the
            // DB by the tool, but the chat row explaining it was thrown
            // away, so reload showed the user turn with no reply and the
            // preview had nothing to bridge to. Aborted parts may hold
            // in-flight tool calls without results — pruneForModel already
            // tolerates those on the next turn.
            if (parts.length > 0) {
              const finalParts = isAborted
                ? [
                    ...parts,
                    {
                      type: "text",
                      text: "\n\n_That run was stopped before it finished — anything already saved stays saved. Press Retry or describe what to do next and I'll pick it up._",
                    },
                  ]
                : parts
              await appendMessage(ctx, {
                role: "assistant",
                parts: finalParts,
              })
            }
            const toolParts = ((responseMessage.parts ?? []) as Array<{ type?: string }>).filter(
              (p) => typeof p?.type === "string" && p.type.startsWith("tool-")
            ).length
            console.log(
              JSON.stringify({
                msg: "agent-finish",
                projectId: body.projectId,
                conversationId: body.conversationId,
                model: activeModel,
                ms: Date.now() - t0,
                toolParts,
                aborted: isAborted,
                status: outcome.status,
              })
            )
          } catch (err) {
            console.error(JSON.stringify({ msg: "agent-persist-failed", err: String(err) }))
          }
        })()
      )
    },
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
