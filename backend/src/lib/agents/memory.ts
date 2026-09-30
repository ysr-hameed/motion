/**
 * Phase-2 house memory — best-effort, never blocks generation.
 * Stores per-project style signals (vibe, palette, fonts) in D1 when the
 * `agent_memory` table exists; silently skips when it doesn't (old DB).
 */
export interface MemoryHint {
  text: string
}

export async function readMemoryHint(db: unknown, projectId: string | null): Promise<string | undefined> {
  try {
    if (!db || !projectId) return undefined
    const d = db as {
      prepare: (sql: string) => { bind: (...v: unknown[]) => { all: () => Promise<{ results?: Array<{ v?: unknown; value?: unknown }> }> } }
    }
    const res = await d
      .prepare("SELECT value AS v FROM agent_memory WHERE project_id = ? LIMIT 5")
      .bind(projectId)
      .all()
    const vals = (res.results ?? [])
      .map((r) => String((r.v ?? r.value ?? "") as string))
      .filter(Boolean)
    if (!vals.length) return undefined
    return vals.join(" | ").slice(0, 500)
  } catch {
    return undefined
  }
}

export async function writeMemory(
  db: unknown,
  projectId: string | null,
  key: string,
  value: string
): Promise<void> {
  try {
    if (!db || !projectId || !value) return
    const d = db as {
      prepare: (sql: string) => { bind: (...v: unknown[]) => { run: () => Promise<unknown> } }
    }
    await d
      .prepare(
        "INSERT INTO agent_memory (id, project_id, key, value, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(crypto.randomUUID(), projectId, key.slice(0, 40), value.slice(0, 500), Date.now())
      .run()
  } catch {
    /* table missing or offline — memory is advisory */
  }
}
