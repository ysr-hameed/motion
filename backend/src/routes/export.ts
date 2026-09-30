import { Hono } from "hono"
import { and, eq } from "drizzle-orm"
import { getDb } from "../lib/db"
import { requireAuth } from "../lib/auth"
import { attachments, projects, versions } from "../db/schema"
import type { Env } from "../env"

const app = new Hono<Env>()

app.use("/*", requireAuth)

/**
 * Exports the project file: spec, versions and settings. Real MP4
 * rendering happens in the browser, so this is the editable source
 * bundle — a composition is TypeScript, and that is what ships.
 */
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
  const latest = vers[vers.length - 1]
  const payload = {
    app: "SlyxUp Motion",
    kind: "remotion-composition",
    exportedAt: new Date().toISOString(),
    version: `v${vers.length}`,
    // A composition is a TSX file. Ship it as one, plus a copy-pasteable
    // ESM module that anyone can drop into a Remotion project.
    composition: latest?.motionJson ?? null,
    spec: {
      prompt: row.prompt,
      format: row.format,
      style: row.style,
      duration: `00:${String(row.durationSecs).padStart(2, "0")}`,
    },
    vibe: row.vibe,
    design: row.design,
    exportSettings: row.exportSettings,
    attachments: atts.map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      mime: a.mime,
    })),
    thread: vers.flatMap((v) => [
      ...(v.note ? [{ role: "user", text: v.note }] : []),
      ...(v.reply ? [{ role: "ai", text: v.reply }] : []),
    ]),
  }
  const name = row.name.replace(/[^\w\-]+/g, "-").slice(0, 40) || "motion-clip"
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${name}-v${vers.length}.json"`,
    },
  })
})

export default app
