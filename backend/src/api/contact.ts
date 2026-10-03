import { toErrorResponse } from "../lib/api-error";
import { contactBody, parse } from "../lib/validate";
import { newId, nowMs } from "../db/queries";
import { apiRateLimit } from "../middleware/rate-limit-api";

/** Public contact endpoint. Stored in D1 (team inbox view comes next);
 *  IP rate-limited since there is no session to key on. */
export async function handleContact(req: Request, env: Env): Promise<Response> {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "not_found", message: "Not found." }, { status: 404 });
    }
    const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
    const limited = await apiRateLimit(
      `ip:${ip}`,
      env as { RATE_LIMIT_KV?: KVNamespace },
    );
    if (limited) return limited;
    const body = parse(contactBody, await req.json().catch(() => null), "message");
    const db = (env as { DB?: D1Database }).DB;
    if (!db) {
      return Response.json({ error: "database_not_provisioned", message: "Database is not provisioned yet." }, { status: 503 });
    }
    await db
      .prepare(
        `INSERT INTO contact_messages (id, name, email, topic, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(newId("msg"), body.name, body.email, body.topic, body.message, nowMs())
      .run();
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
