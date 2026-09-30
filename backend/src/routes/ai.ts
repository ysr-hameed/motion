import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { streamSSE } from "hono/streaming"
import { requireAuth } from "../lib/auth"
import { AiNotConfiguredError } from "../lib/ai-types"
import { createAiProvider } from "../lib/gateway"
import type { Env } from "../env"

const app = new Hono<Env>()

app.use("/*", requireAuth)

const imageSchema = z.object({
  name: z.string().max(80).default("ref"),
  dataUrl: z.string().max(700000),
})

const directSchema = z.object({
  prompt: z.string().min(1).max(2000),
  format: z.enum(["16:9", "9:16", "1:1"]),
  formatLocked: z.boolean().default(false),
  images: z.array(imageSchema).max(3).default([]),
  projectId: z.string().max(80).nullish().default(null),
})

/**
 * The artifact is validated only for shape, not content. A composition is
 * arbitrary TypeScript — the renderer decides whether it runs, and the
 * repair loop handles it when it does not. A zod schema here would be
 * exactly the ceiling we are removing.
 */
const refineSchema = z.object({
  artifact: z
    .object({
      kind: z.enum(["code", "doc"]),
      code: z.string().max(200000).optional(),
      doc: z.unknown().optional(),
      durationInFrames: z.number().int().optional(),
      fps: z.number().int().optional(),
      width: z.number().int().optional(),
      height: z.number().int().optional(),
    })
    .passthrough(),
  prompt: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["ai", "user"]), text: z.string().max(2000) }))
    .max(30)
    .default([]),
  note: z.string().min(1).max(1000),
  images: z.array(imageSchema).max(3).default([]),
  projectId: z.string().max(80).nullish().default(null),
})

const repairSchema = z.object({
  code: z.string().min(1).max(200000),
  errors: z.array(z.string().max(2000)).min(1).max(12),
  width: z.number().int().min(16).max(7680),
  height: z.number().int().min(16).max(7680),
  fps: z.number().int().min(1).max(240),
  durationInFrames: z.number().int().min(1).max(100000),
  prompt: z.string().max(2000).optional(),
  projectId: z.string().max(80).nullish().default(null),
})

function aiOr503(c: { env: Env["Bindings"] }) {
  try {
    return { provider: createAiProvider({ ...c.env, DB: c.env.DB }) }
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      // The fix is the operator's, not the reader's: the missing key and
      // the full error go to the log, the chat gets plain language.
      console.error(JSON.stringify({ msg: "ai-not-configured", err: String(err) }))
      return { provider: null }
    }
    throw err
  }
}

/** Shown to the reader, never the operator. No worker names, no env vars. */
const NOT_CONFIGURED = "AI isn't set up on this server yet. Try again in a moment."

/**
 * Real failure messages, not canned ones. The reader learns what happened
 * and what to do about it, but never which model worker hit it or what the
 * environment variable is called — the operator gets that in the log.
 */
function queueMessage(err: unknown): string {
  const s = String(err instanceof Error ? err.message : err)
  if (/429|503|queue|overloaded|capacity|rate limit|aborted|abort/i.test(s))
    return "The AI is queued right now — please retry in a few seconds."
  if (/no composition|empty|returned nothing/i.test(s))
    return "I came back empty-handed — try describing it slightly differently."
  if (/no default export/i.test(s))
    return "That one didn't compile. Retry — it usually lands on the second try."
  if (/could not be applied|can't be edited/i.test(s))
    return s
  return "Something went wrong on my side. Please try again."
}

app.post("/direct", zValidator("json", directSchema), async (c) => {
  const { provider } = aiOr503(c)
  if (!provider) return c.json({ error: NOT_CONFIGURED }, 503)
  try {
    const body = c.req.valid("json")
    return c.json(
      await provider.direct({
        ...body,
        projectId: body.projectId ?? null,
      })
    )
  } catch (err) {
    console.error(JSON.stringify({ msg: "ai-direct-failed", err: String(err) }))
    return c.json({ error: queueMessage(err) }, 502)
  }
})

app.post("/refine", zValidator("json", refineSchema), async (c) => {
  const { provider } = aiOr503(c)
  if (!provider) return c.json({ error: NOT_CONFIGURED }, 503)
  try {
    const body = c.req.valid("json")
    return c.json(
      await provider.refine({
        artifact: body.artifact as never,
        prompt: body.prompt,
        history: body.history,
        note: body.note,
        images: body.images,
        projectId: body.projectId ?? null,
      })
    )
  } catch (err) {
    console.error(JSON.stringify({ msg: "ai-refine-failed", err: String(err) }))
    return c.json({ error: queueMessage(err) }, 502)
  }
})

/**
 * Render-error repair. The browser mounts the composition and is the only
 * place that can prove it runs; when it throws, it posts the real error
 * here. Two bounded rounds, then the failure is surfaced honestly.
 */
app.post("/repair", zValidator("json", repairSchema), async (c) => {
  const { provider } = aiOr503(c)
  if (!provider) return c.json({ error: NOT_CONFIGURED }, 503)
  try {
    const body = c.req.valid("json")
    return c.json(await provider.repair(body))
  } catch (err) {
    console.error(JSON.stringify({ msg: "ai-repair-failed", err: String(err) }))
    return c.json({ error: queueMessage(err) }, 502)
  }
})

const streamSchema = z.object({
  kind: z.enum(["direct", "refine", "repair"]),
  prompt: z.string().min(1).max(2000).default(""),
  format: z.string().max(10).default("16:9"),
  formatLocked: z.boolean().default(false),
  artifact: z.unknown().optional(),
  code: z.string().max(200000).default(""),
  errors: z.array(z.string().max(2000)).max(12).default([]),
  width: z.number().int().min(16).max(7680).default(1920),
  height: z.number().int().min(16).max(7680).default(1080),
  fps: z.number().int().min(1).max(240).default(30),
  durationInFrames: z.number().int().min(1).max(100000).default(150),
  history: z
    .array(z.object({ role: z.enum(["ai", "user"]), text: z.string().max(2000) }))
    .max(30)
    .default([]),
  note: z.string().max(1000).default(""),
  images: z.array(imageSchema).max(3).default([]),
  projectId: z.string().max(80).nullish().default(null),
})

/**
 * Realtime director stream (SSE). Stages, token progress and the live text
 * deltas stream while the model writes, then the final payload.
 * Events: stage | progress | report | text | final | error.
 */
app.post("/stream", zValidator("json", streamSchema), async (c) => {
  const { provider } = aiOr503(c)
  if (!provider) return c.json({ error: NOT_CONFIGURED }, 503)
  const body = c.req.valid("json")
  return streamSSE(c, async (stream) => {
    const emit = (e: { type: string; [k: string]: unknown }) =>
      stream.writeSSE({ event: e.type, data: JSON.stringify(e) })
    try {
      let result: unknown
      if (body.kind === "direct") {
        result = await provider.direct(
          {
            prompt: body.prompt,
            format: body.format === "9:16" || body.format === "1:1" ? body.format : "16:9",
            formatLocked: body.formatLocked,
            images: body.images,
            projectId: body.projectId ?? null,
          },
          (e) => void emit(e)
        )
      } else if (body.kind === "repair") {
        result = await provider.repair(
          {
            code: body.code,
            errors: body.errors,
            width: body.width,
            height: body.height,
            fps: body.fps,
            durationInFrames: body.durationInFrames,
            prompt: body.prompt || undefined,
            projectId: body.projectId ?? null,
          },
          (e) => void emit(e)
        )
      } else {
        result = await provider.refine(
          {
            artifact: body.artifact as never,
            prompt: body.prompt,
            history: body.history,
            note: body.note,
            images: body.images,
            projectId: body.projectId ?? null,
          },
          (e) => void emit(e)
        )
      }
      await emit({ type: "final", result })
    } catch (err) {
      console.error(JSON.stringify({ msg: "ai-stream-failed", err: String(err) }))
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ type: "error", message: queueMessage(err) }),
      })
    }
  })
})

/**
 * Session restore: rebuild the chat thread from persisted versions.
 * The versions table is the truth; localStorage is only a cache.
 */
app.get("/thread/:projectId", async (c) => {
  const { getDb } = await import("../lib/db")
  const { versions, projects } = await import("../db/schema")
  const { and, eq } = await import("drizzle-orm")
  const db = getDb(c.env.DB)
  const user = c.get("user")
  const projectId = c.req.param("projectId")
  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
    .limit(1)
    .all()
  if (!proj) return c.json({ error: "Not found" }, 404)
  const vers = await db
    .select()
    .from(versions)
    .where(eq(versions.projectId, projectId))
    .orderBy(versions.versionNo)
    .all()
  return c.json({
    thread: vers.flatMap((v) => [
      ...(v.note ? [{ role: "user", text: v.note }] : []),
      ...(v.reply ? [{ role: "ai", text: v.reply }] : []),
    ]),
    versions: vers.length,
  })
})

export default app
