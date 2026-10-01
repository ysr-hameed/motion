import { sql } from "drizzle-orm"
import { getDb } from "../db"

/**
 * Per-request ownership + creation-mode data, gathered in ONE D1 round-trip.
 *
 * The chat route used to run three sequential queries before it could even
 * decide whether the turn was allowed: project ownership, conversation
 * ownership, and a versions-count to pick creation-vs-edit mode. Each await
 * is a serialized step in the request's critical path, and Drizzle's query
 * building plus row mapping is all CPU — which is the scarce resource on a
 * CPU-capped plan.
 *
 * One SELECT answers all three. Semantics are identical, including the
 * "advisory" nature of the fresh flag: a missing project yields
 * `projectOk: false` and the route 404s exactly as before.
 *
 * NOTE: the canvas is deliberately NOT read here. It lives in an R2 JSON
 * file (`remotion.config.json`), not a D1 column, so it cannot join into
 * this query — it stays a separate read.
 */
export interface TurnPreamble {
  /** The project exists and belongs to this user. */
  projectOk: boolean
  /** The conversation exists, belongs to this user, and is on that project. */
  conversationOk: boolean
  /** No versions yet ⇒ compose the scene rather than tweak a placeholder. */
  freshProject: boolean
  /** Canvas facts from the project row, used for the creation-mode hint. */
  format: string | null
  durationSecs: number | null
}

export async function loadTurnPreamble(
  database: D1Database,
  projectId: string,
  conversationId: string,
  userId: string
): Promise<TurnPreamble> {
  const db = getDb(database)
  const rows = await db.all<{
    project_ok: number
    conversation_ok: number
    format: string | null
    duration_secs: number | null
    version_count: number
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM projects
        WHERE id = ${projectId} AND user_id = ${userId}) AS project_ok,
      (SELECT COUNT(*) FROM conversations
        WHERE id = ${conversationId}
          AND project_id = ${projectId}
          AND user_id = ${userId}) AS conversation_ok,
      (SELECT p.format          FROM projects p WHERE p.id = ${projectId}) AS format,
      (SELECT p.duration_secs  FROM projects p WHERE p.id = ${projectId}) AS duration_secs,
      (SELECT COUNT(*) FROM versions WHERE project_id = ${projectId}) AS version_count
  `)

  const row = rows[0]
  return {
    projectOk: Number(row?.project_ok ?? 0) > 0,
    conversationOk: Number(row?.conversation_ok ?? 0) > 0,
    freshProject: Number(row?.version_count ?? 0) === 0,
    format: typeof row?.format === "string" ? row.format : null,
    durationSecs: typeof row?.duration_secs === "number" ? row.duration_secs : null,
  }
}