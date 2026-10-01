import { Hono } from "hono"
import { and, eq } from "drizzle-orm"
import { getDb } from "../lib/db"
import { requireAuth } from "../lib/auth"
import { attachments, projects } from "../db/schema"
import type { Env } from "../env"

const app = new Hono<Env>()

app.use("/*", requireAuth)

const MAX_BYTES = 2.5 * 1024 * 1024

app.post("/", async (c) => {
  const db = getDb(c.env.DB)
  const user = c.get("user")
  const form = await c.req.formData()
  const file = form.get("file")
  const projectId =
    typeof form.get("projectId") === "string"
      ? (form.get("projectId") as string)
      : null
  if (!(file instanceof File)) {
    return c.json({ error: "Send multipart field 'file'." }, 400)
  }
  if (!file.type.startsWith("image/")) {
    return c.json({ error: "Only images are accepted." }, 400)
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: "File too large (max 2.5 MB)." }, 413)
  }
  // The project must exist and belong to the caller — otherwise uploads
  // land orphaned on other users' projects (or nobody's).
  if (projectId) {
    const [proj] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
      .limit(1)
      .all()
    if (!proj) return c.json({ error: "Not found" }, 404)
  }
  const key = `refs/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`
  await c.env.REFS.put(key, file, {
    httpMetadata: { contentType: file.type },
  })
  const [row] = await db
    .insert(attachments)
    .values({
      projectId,
      name: file.name,
      size: file.size,
      mime: file.type,
      r2Key: key,
    })
    .returning()
  return c.json(
    {
      attachment: {
        id: row.id,
        name: row.name,
        size: row.size,
        mime: row.mime,
        url: `/api/uploads/${row.id}`,
      },
    },
    201
  )
})

app.get("/:id", async (c) => {
  const db = getDb(c.env.DB)
  const user = c.get("user")
  const id = c.req.param("id")
  const [row] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1)
    .all()
  if (!row) return c.json({ error: "Not found" }, 404)
  // Attachments are private to the owning project's user — UUIDs are not
  // a substitute for an ownership check.
  if (row.projectId) {
    const [proj] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, row.projectId), eq(projects.userId, user.id)))
      .limit(1)
      .all()
    if (!proj) return c.json({ error: "Not found" }, 404)
  }
  const obj = await c.env.REFS.get(row.r2Key)
  if (!obj) return c.json({ error: "File missing" }, 404)
  return new Response(obj.body, {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
})

export default app
