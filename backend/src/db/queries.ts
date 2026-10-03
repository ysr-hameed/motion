import { ApiError } from "../lib/api-error";

/** D1 is provisioned separately (`wrangler d1 create motion-db`). Until the
 *  binding exists, data routes answer 503 instead of crashing the Worker. */
export function requireDb(env: { DB?: D1Database }): D1Database {
  if (!env.DB) {
    throw new ApiError(
      503,
      "database_not_provisioned",
      "Database is not provisioned yet. Run `wrangler d1 create motion-db`, " +
        "add the binding to wrangler.jsonc, then apply src/db/schema.sql.",
    );
  }
  return env.DB;
}

export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

export const nowMs = (): number => Date.now();

export async function upsertUser(
  db: D1Database,
  user: { id: string; email: string; name?: string | null; avatarUrl?: string | null },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, email, name, avatar_url, created_at, last_active_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         name = COALESCE(excluded.name, users.name),
         avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
         last_active_at = excluded.last_active_at`,
    )
    .bind(
      user.id,
      user.email,
      user.name ?? null,
      user.avatarUrl ?? null,
      nowMs(),
      nowMs(),
    )
    .run();
}

export async function countSince(
  db: D1Database,
  table: "compositions" | "exports",
  userId: string,
  monthStart: number,
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ? AND created_at >= ?`)
    .bind(userId, monthStart)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export function monthStartMs(d = new Date()): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
