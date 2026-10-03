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

/** IMPLEMENTATION_PLAN.md §8: per-turn generation + quality metrics. */
const DDL_ANALYTICS = `CREATE TABLE IF NOT EXISTS composition_analytics (
  id TEXT PRIMARY KEY,
  brief TEXT,
  intent_category TEXT,
  created_at INTEGER NOT NULL,
  total_time_ms INTEGER,
  model_calls INTEGER,
  tool_calls INTEGER,
  errors_count INTEGER,
  motion_score INTEGER,
  exported INTEGER DEFAULT 0
)`

/**
 * Phase 3 blackboard (§1.2): cross-workstream state for the orchestrated turn.
 * One DO = one conversation, so a plain key/value table is the whole bus:
 * workstreams post specs here instead of re-stating them through the model,
 * which keeps the transcript flat however many workstreams ran.
 */
const DDL_BLACKBOARD = `CREATE TABLE IF NOT EXISTS blackboard (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`

/** Phase 4 collaboration (§2.6): frame-anchored comment threads. */
const DDL_COMMENTS = `CREATE TABLE IF NOT EXISTS comment (
  id TEXT PRIMARY KEY,
  frame INTEGER NOT NULL,
  author TEXT NOT NULL DEFAULT 'reviewer',
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`

/** Phase 4 delivery (§2.5): semantic tags on versions. */
const DDL_TAGS = `CREATE TABLE IF NOT EXISTS version_tag (
  version INTEGER NOT NULL,
  tag TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (version, tag)
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
    this.agent.execDdl(DDL_ANALYTICS)
    this.agent.execDdl(DDL_BLACKBOARD)
    this.agent.execDdl(DDL_COMMENTS)
    this.agent.execDdl(DDL_TAGS)
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
   * Phase 1 analytics (§8): one row per turn, best-effort. Never throws —
   * a metrics write must not fail a chat turn.
   */
  recordTurn(input: {
    brief: string
    intentCategory?: string
    totalTimeMs: number
    toolCalls: number
    errors: number
    motionScore?: number
    exported?: boolean
  }): void {
    try {
      this.ensure()
      const id = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
      this.agent.sql`INSERT INTO composition_analytics
        (id, brief, intent_category, created_at, total_time_ms, model_calls, tool_calls, errors_count, motion_score, exported)
        VALUES (${id}, ${input.brief.slice(0, 500)}, ${input.intentCategory ?? null}, ${Date.now()},
                ${Math.round(input.totalTimeMs)}, ${null}, ${input.toolCalls}, ${input.errors},
                ${input.motionScore ?? null}, ${input.exported ? 1 : 0})`
    } catch {
      // Advisory only.
    }
  }

  /** Phase 2 satisfaction capture (§8.3): 1-5 stars per version. */
  recordRating(version: number, stars: number): void {
    try {
      this.ensure()
      const id = `rating-${version}-${Date.now()}`
      this.agent.sql`INSERT INTO composition_analytics
        (id, brief, intent_category, created_at, total_time_ms, model_calls, tool_calls, errors_count, motion_score, exported)
        VALUES (${id}, ${`rating v${version}: ${stars}/5`}, ${"rating"}, ${Date.now()},
                ${null}, ${null}, ${0}, ${0}, ${null}, ${0})`
    } catch {
      // Advisory only.
    }
  }

  /** Phase 3 blackboard: post one workstream result for the others to read. */
  blackboardWrite(key: string, value: string): void {
    this.ensure()
    this.agent.sql`INSERT INTO blackboard (key, value, updated_at)
      VALUES (${key.trim().slice(0, 120)}, ${value.slice(0, 8000)}, ${Date.now()})
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  }

  blackboardRead(key: string): string | null {
    this.ensure()
    const row = this.agent
      .sql<{ value: string }>`SELECT value FROM blackboard WHERE key = ${key}`[0]
    return row?.value ?? null
  }

  blackboardList(): Array<{ key: string; updatedAt: number }> {
    this.ensure()
    return this.agent
      .sql<{ key: string; updated_at: number }>`SELECT key, updated_at FROM blackboard ORDER BY updated_at ASC`
      .map((r) => ({ key: r.key, updatedAt: r.updated_at }))
  }

  /** Fresh turn, fresh bus — the turn's first intent analysis clears it. */
  blackboardClear(): void {
    this.ensure()
    this.agent.execDdl(`DELETE FROM blackboard`)
  }

  /** Phase 4: frame-anchored review comment. Returns the comment id. */
  commentAdd(frame: number, text: string, author = "reviewer"): string {
    this.ensure()
    const id = `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    this.agent.sql`INSERT INTO comment (id, frame, author, text, created_at)
      VALUES (${id}, ${Math.max(0, Math.round(frame))}, ${author.slice(0, 80)}, ${text.slice(0, 2000)}, ${Date.now()})`
    return id
  }

  comments(): Array<{ id: string; frame: number; author: string; text: string; createdAt: number }> {
    this.ensure()
    return this.agent
      .sql<{ id: string; frame: number; author: string; text: string; created_at: number }>`SELECT id, frame, author, text, created_at FROM comment ORDER BY frame ASC`
      .map((r) => ({ id: r.id, frame: r.frame, author: r.author, text: r.text, createdAt: r.created_at }))
  }

  /** Phase 4: tag a version (semver + notes). */
  tagVersion(version: number, tag: string, notes?: string): void {
    this.ensure()
    this.agent.sql`INSERT INTO version_tag (version, tag, notes, created_at)
      VALUES (${version}, ${tag.slice(0, 40)}, ${notes?.slice(0, 1000) ?? null}, ${Date.now()})
      ON CONFLICT(version, tag) DO UPDATE SET notes = excluded.notes, created_at = excluded.created_at`
  }

  tags(): Array<{ version: number; tag: string; notes: string | null }> {
    this.ensure()
    return this.agent
      .sql<{ version: number; tag: string; notes: string | null }>`SELECT version, tag, notes FROM version_tag ORDER BY version ASC`
  }

  /** Phase 4: advisory event row (exports, publishes, shares). */
  trackEvent(name: string, detail = ""): void {
    try {
      this.ensure()
      const id = `evt-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
      this.agent.sql`INSERT INTO composition_analytics
        (id, brief, intent_category, created_at, total_time_ms, model_calls, tool_calls, errors_count, motion_score, exported)
        VALUES (${id}, ${`${name}: ${detail}`.slice(0, 500)}, ${"event"}, ${Date.now()},
                ${null}, ${null}, ${0}, ${0}, ${null}, ${name === "export" ? 1 : 0})`
    } catch {
      // Advisory only.
    }
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
