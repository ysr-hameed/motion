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

/**
 * Render-error repair only. First creation and follow-up edits run
 * through the tool-loop agent (/api/agent/*). The /direct, /refine and
 * /thread endpoints served the old director pipeline — deleted with it.
 * This file survives for one reason: the browser player is the only
 * place that can prove a composition runs.
 */

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
    return { provider: createAiProvider(c.env) }
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
  return "Something went wrong on my side. Please try again."
}

/**
 * Render-error repair. The browser mounts the composition and is the only
 * place that can prove it runs; when it throws, it posts the real error
 * here. Bounded repair passes, then the failure is surfaced honestly.
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
  code: z.string().max(200000).default(""),
  errors: z.array(z.string().max(2000)).max(12).default([]),
  width: z.number().int().min(16).max(7680).default(1920),
  height: z.number().int().min(16).max(7680).default(1080),
  fps: z.number().int().min(1).max(240).default(30),
  durationInFrames: z.number().int().min(1).max(100000).default(150),
  prompt: z.string().max(2000).default(""),
  projectId: z.string().max(80).nullish().default(null),
})

/**
 * Realtime repair stream (SSE). Stages and token progress stream while
 * the repairer writes, then the final payload.
 * Events: stage | progress | text | output | final | error.
 */
app.post("/stream", zValidator("json", streamSchema), async (c) => {
  const { provider } = aiOr503(c)
  if (!provider) return c.json({ error: NOT_CONFIGURED }, 503)
  const body = c.req.valid("json")
  return streamSSE(c, async (stream) => {
    const emit = (e: { type: string; [k: string]: unknown }) =>
      stream.writeSSE({ event: e.type, data: JSON.stringify(e) })
    try {
      const result = await provider.repair(
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

export default app
