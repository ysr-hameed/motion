import { ApiError, toErrorResponse } from "../lib/api-error";
import { getTier, requirePlan, type AppContext } from "../middleware/require-auth";
import { newId, nowMs, requireDb } from "../db/queries";

/**
 * Motion REST API keys (Business plan). Plaintext `sk_live_…` is returned
 * exactly once at creation; only its sha256 is stored.
 */

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handleKeys(req: Request, ctx: AppContext, url: URL): Promise<Response> {
  try {
    const db = requireDb(ctx.env);
    const gate = await requirePlan(ctx, "business");
    if (gate) return gate;
    const path = url.pathname;

    if (req.method === "GET" && path === "/api/keys") {
      const rows = await db
        .prepare(
          `SELECT id, name, substr(key_hash, 1, 8) AS prefix, last_used_at, created_at, revoked
           FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
        )
        .bind(ctx.session.user.id)
        .all();
      return Response.json({ keys: rows.results });
    }

    if (req.method === "POST" && path === "/api/keys") {
      const body = (await req.json().catch(() => ({}))) as { name?: string };
      const raw = [...crypto.getRandomValues(new Uint8Array(30))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const key = `sk_live_${raw}`;
      const tier = await getTier(ctx);
      await db
        .prepare(
          `INSERT INTO api_keys (id, user_id, key_hash, name, tier_snapshot, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId("key"), ctx.session.user.id, await sha256Hex(key),
          typeof body.name === "string" ? body.name.slice(0, 80) : null,
          tier, nowMs(),
        )
        .run();
      return Response.json({ key, warning: "Copy it now — it is never shown again." }, { status: 201 });
    }

    if (req.method === "DELETE" && path.startsWith("/api/keys/")) {
      const id = decodeURIComponent(path.slice("/api/keys/".length));
      const row = await db.prepare(`SELECT user_id FROM api_keys WHERE id = ?`).bind(id).first<{
        user_id: string;
      }>();
      if (!row) throw new ApiError(404, "not_found", "Key not found.");
      if (row.user_id !== ctx.session.user.id) throw new ApiError(403, "forbidden", "Not your key.");
      await db.prepare(`UPDATE api_keys SET revoked = 1 WHERE id = ?`).bind(id).run();
      return Response.json({ ok: true });
    }

    return Response.json({ error: "not_found", message: "Not found." }, { status: 404 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
