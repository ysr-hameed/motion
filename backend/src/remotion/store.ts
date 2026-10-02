import type { Chat } from "../chat"

/**
 * Per-conversation composition state, in the Durable Object's own SQLite.
 *
 * One DO instance is one conversation, so the instance name is the natural
 * key and no user/project table is needed. The old implementation carried this
 * in D1 behind an auth layer with a hand-written store module; a DO's storage
 * is already single-writer, transactional and colocated with the agent, so the
 * extra machinery bought nothing.
 */
export interface Beat {
  /** Inclusive start frame. */
  from: number
  /** Exclusive end frame. */
  to: number
  /** What happens in this window, in the model's words. */
  what: string
}

export interface MotionPlan {
  /** The one-line idea, shown as the plan's title. */
  title: string
  /** What the cut is trying to achieve. */
  intent: string
  beats: Beat[]
  /** The final image the cut resolves to. */
  ending: string
}

export interface Version {
  n: number
  code: string
  createdAt: number
  plan?: MotionPlan
}

interface CompositionRow {
  code: string | null
  plan: string | null
  version: number
}

interface VersionRow {
  n: number
  code: string
  plan: string | null
  created_at: number
}

const DDL = `CREATE TABLE IF NOT EXISTS composition (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  code TEXT,
  plan TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
)`

const DDL_VERSIONS = `CREATE TABLE IF NOT EXISTS version (
  n INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  plan TEXT,
  created_at INTEGER NOT NULL
)`

export class CompositionStore {
  private ready = false

  constructor(private readonly agent: Chat) {}

  private ensure(): void {
    // CREATE TABLE IF NOT EXISTS is cheap and additive; doing it once per
    // isolate keeps the constructor free of I/O.
    if (this.ready) return
    this.agent.execDdl(DDL)
    this.agent.execDdl(DDL_VERSIONS)
    this.ready = true
  }

  current(): { code: string; plan: MotionPlan | null; version: number } {
    this.ensure()
    const row = this.agent.sql<CompositionRow>`SELECT code, plan, version FROM composition WHERE id = 1`[0]
    return {
      code: row?.code ?? "",
      plan: row?.plan ? safeParse(row.plan) : null,
      version: row?.version ?? 0,
    }
  }

  versions(): Version[] {
    this.ensure()
    return this.agent
      .sql<VersionRow>`SELECT n, code, plan, created_at FROM version ORDER BY n ASC`
      .map((r) => ({
        n: r.n,
        code: r.code,
        createdAt: r.created_at,
        plan: r.plan ? (safeParse(r.plan) ?? undefined) : undefined,
      }))
  }

  /** Stores the plan only. Cheap, and does not bump the version. */
  setPlan(plan: MotionPlan): void {
    this.ensure()
    const now = Date.now()
    this.agent
      .sql`INSERT INTO composition (id, code, plan, version, updated_at)
          VALUES (1, '', ${JSON.stringify(plan)}, 0, ${now})
          ON CONFLICT(id) DO UPDATE SET
            plan = excluded.plan, updated_at = excluded.updated_at`
    this.pruneStalePlan()
  }

  /** Replaces the source and records a new version. Returns its number. */
  write(code: string, opts: { bumpVersion: boolean; plan?: MotionPlan }): number {
    this.ensure()
    const now = Date.now()
    const cur = this.current()
    const planJson = opts.plan ? JSON.stringify(opts.plan) : null
    const next = opts.bumpVersion ? cur.version + 1 : cur.version

    if (opts.bumpVersion) {
      this.agent.sql`INSERT OR REPLACE INTO version (n, code, plan, created_at)
                      VALUES (${next}, ${code}, ${planJson}, ${now})`
    }

    this.agent.sql`INSERT INTO composition (id, code, plan, version, updated_at)
        VALUES (1, ${code}, ${planJson}, ${next}, ${now})
        ON CONFLICT(id) DO UPDATE SET
          code = excluded.code,
          plan = COALESCE(excluded.plan, composition.plan),
          version = excluded.version,
          updated_at = excluded.updated_at`

    return next
  }

  restore(n: number): string | null {
    this.ensure()
    return this.agent.sql<VersionRow>`SELECT code FROM version WHERE n = ${n}`[0]?.code ?? null
  }

  /**
   * Keeps only the most recent versions.
   *
   * Unbounded history would grow the DO's storage row without limit, and the
   * old implementation's transcript bloat was a real failure mode. Restoring
   * is a convenience, not an archive.
   */
  private pruneStalePlan(): void {
    this.agent.execDdl(
      `DELETE FROM version WHERE n NOT IN
         (SELECT n FROM version ORDER BY n DESC LIMIT 20)`
    )
  }
}

function safeParse(json: string): MotionPlan | null {
  try {
    return JSON.parse(json) as MotionPlan
  } catch {
    // A malformed plan must never take down a chat turn; the cut is what matters.
    return null
  }
}
