import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { and, desc, eq } from "drizzle-orm"
import { getDb } from "../lib/db"
import { requireAuth } from "../lib/auth"
import { attachments, projects, versions } from "../db/schema"
import type { Env } from "../env"

const app = new Hono<Env>()

app.use("/*", requireAuth)

const createSchema = z.object({
  name: z.string().min(1).max(120),
  prompt: z.string().min(1).max(500),
  format: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  style: z.string().max(40).optional(),
  durationSecs: z.number().int().min(3).max(30).optional(),
  vibe: z.string().max(40).optional(),
  design: z
    .object({
      bg: z.string(),
      fg: z.string(),
      align: z.enum(["left", "center", "right"]),
    })
    .optional(),
  exportSettings: z
    .object({
      quality: z.string(),
      fps: z.number(),
      container: z.string(),
    })
    .optional(),
})

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  design: createSchema.shape.design.optional(),
  exportSettings: createSchema.shape.exportSettings.optional(),
  vibe: z.string().max(40).nullable().optional(),
  status: z.enum(["draft", "generating", "ready"]).optional(),
})

const versionSchema = z.object({
  note: z.string().max(500).optional(),
  reply: z.string().max(500).optional(),
  motionJson: z.unknown().optional(),
})

function rowToProject(p: typeof projects.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    prompt: p.prompt,
    format: p.format,
    style: p.style,
    durationSecs: p.durationSecs,
    vibe: p.vibe,
    design: p.design,
    exportSettings: p.exportSettings,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

app.get("/", async (c) => {
  const db = getDb(c.env.DB)
  const user = c.get("user")
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, user.id))
    .orderBy(desc(projects.updatedAt))
    .all()
  return c.json({ projects: rows.map(rowToProject) })
})

app.post("/", zValidator("json", createSchema), async (c) => {
  const db = getDb(c.env.DB)
  const user = c.get("user")
  const body = c.req.valid("json")
  const [row] = await db
    .insert(projects)
    .values({
      userId: user.id,
      name: body.name,
      prompt: body.prompt,
      format: body.format,
      style: body.style ?? "Auto",
      durationSecs: body.durationSecs ?? 5,
      vibe: body.vibe,
      ...(body.design ? { design: body.design } : {}),
      ...(body.exportSettings ? { exportSettings: body.exportSettings } : {}),
      status: "draft",
    })
    .returning()
  return c.json({ project: rowToProject(row) }, 201)
})

app.get("/:id", async (c) => {
  const db = getDb(c.env.DB)
  const user = c.get("user")
  const id = c.req.param("id")
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
    .limit(1)
    .all()
  if (!row) return c.json({ error: "Not found" }, 404)
  const vers = await db
    .select()
    .from(versions)
    .where(eq(versions.projectId, id))
    .orderBy(versions.versionNo)
    .all()
  const atts = await db
    .select()
    .from(attachments)
    .where(eq(attachments.projectId, id))
    .all()
  return c.json({
    project: rowToProject(row),
    versions: vers.map((v) => ({
      id: v.id,
      versionNo: v.versionNo,
      note: v.note,
      reply: v.reply,
      motionJson: v.motionJson,
      createdAt: v.createdAt.toISOString(),
    })),
    attachments: atts.map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      mime: a.mime,
      url: `/api/uploads/${a.id}`,
    })),
  })
})

app.patch("/:id", zValidator("json", patchSchema), async (c) => {
  const db = getDb(c.env.DB)
  const user = c.get("user")
  const id = c.req.param("id")
  const body = c.req.valid("json")
  const [row] = await db
    .update(projects)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
    .returning()
  if (!row) return c.json({ error: "Not found" }, 404)
  return c.json({ project: rowToProject(row) })
})

app.delete("/:id", async (c) => {
  const db = getDb(c.env.DB)
  const user = c.get("user")
  const id = c.req.param("id")
  const deleted = await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
    .returning({ id: projects.id })
  if (deleted.length === 0) return c.json({ error: "Not found" }, 404)
  // Best-effort R2 cleanup; project data is already gone.
  c.executionCtx.waitUntil(
    (async () => {
      const atts = await db
        .select()
        .from(attachments)
        .where(eq(attachments.projectId, id))
        .all()
      await Promise.all(atts.map((a) => c.env.REFS.delete(a.r2Key)))
    })()
  )
  return c.json({ ok: true })
})

app.post("/:id/versions", zValidator("json", versionSchema), async (c) => {
  const db = getDb(c.env.DB)
  const user = c.get("user")
  const id = c.req.param("id")
  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
    .limit(1)
    .all()
  if (!proj) return c.json({ error: "Not found" }, 404)
  const existing = await db
    .select({ versionNo: versions.versionNo })
    .from(versions)
    .where(eq(versions.projectId, id))
    .all()
  const next = existing.reduce((m, v) => Math.max(m, v.versionNo), 0) + 1
  const body = c.req.valid("json")
  const [row] = await db
    .insert(versions)
    .values({
      projectId: id,
      versionNo: next,
      note: body.note,
      reply: body.reply,
      motionJson: body.motionJson ?? null,
    })
    .returning()
  await db
    .update(projects)
    .set({ status: "ready", updatedAt: new Date() })
    .where(eq(projects.id, id))
  return c.json(
    {
      version: {
        id: row.id,
        versionNo: row.versionNo,
        note: row.note,
        reply: row.reply,
        motionJson: row.motionJson,
        createdAt: row.createdAt.toISOString(),
      },
    },
    201
  )
})

export default app
