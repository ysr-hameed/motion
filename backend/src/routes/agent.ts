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
  const stored = await loadMessages(ctx)
  const incoming = body.messages as UIMessage[]
  for (const m of incoming) {
    if (m.role === "user" && !stored.some((s) => s.id === m.id)) {
      await appendMessage(ctx, { role: "user", parts: m.parts ?? [] })
    }
  }

  const uiHistory: UIMessage[] = [
    ...(stored.map((m) => ({
      id: m.id,
      role: m.role,
      parts: (m.parts ?? []) as UIMessage["parts"],
    })) as UIMessage[]),
    ...incoming.filter((m) => m.role === "user" && !stored.some((s) => s.id === m.id)),
  ]

  // Smalltalk short-circuit: pure chit-chat never reaches the model.
  // Deterministic, instant, zero gateway cost — and the model can never
  // "inspect the project" in response to a "hi". Attachments mean task
  // context, so image-bearing turns always go through.
  const latestUser = [...uiHistory].reverse().find((m) => m.role === "user")
  if (latestUser) {
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
    const { contractsFor, fontRules } = await import("../lib/remotion-guide")
    const { fontCatalogue } = await import("../lib/font-catalogue.generated")
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

  console.log(
    JSON.stringify({
      msg: "agent-model",
      projectId: body.projectId,
      conversationId: body.conversationId,
      model: built.modelId,
    })
  )

  // Stream setup itself must not 500 the turn: a gateway hiccup here
  // becomes a retryable JSON error, not a dead SSE connection.
  let result: ReturnType<typeof built.agent.stream>
  try {
    result = built.agent.stream({
      system: systemPreamble,
      messages: modelMessages,
    })
  } catch (err) {
    console.error(JSON.stringify({ msg: "agent-stream-failed", err: String(err) }))
    return c.json({ error: "The AI stumbled starting up — retry and I'll pick it up." }, 502)
  }

  return result.toUIMessageStreamResponse<UIMessage>({
    originalMessages: incoming,
    onFinish: ({ responseMessage, isAborted, outcome }) => {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const parts = responseMessage.parts ?? []
            // Persist partial progress too: a failed or stopped run still
            // leaves real tool calls/results worth keeping. Only a user
            // abort discards the in-flight reply (history stays consistent).
            if (!isAborted && parts.length > 0) {
              await appendMessage(ctx, {
                role: "assistant",
                parts,
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
