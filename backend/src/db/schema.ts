import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"

export const projects = sqliteTable(
  "projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    format: text("format", { enum: ["16:9", "9:16", "1:1"] })
      .notNull()
      .default("16:9"),
    style: text("style").notNull().default("Auto"),
    durationSecs: integer("duration_secs").notNull().default(5),
    vibe: text("vibe"),
    design: text("design", { mode: "json" })
      .$type<{ bg: string; fg: string; align: "left" | "center" | "right" }>()
      .notNull()
      .default({ bg: "#09090b", fg: "#ffffff", align: "center" }),
    exportSettings: text("export_settings", { mode: "json" })
      .$type<{ quality: string; fps: number; container: string }>()
      .notNull()
      .default({ quality: "1080p", fps: 30, container: "MP4" }),
    status: text("status", {
      enum: ["draft", "generating", "ready"],
    })
      .notNull()
      .default("draft"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    userIdx: index("projects_user_idx").on(t.userId),
  })
)

export const versions = sqliteTable(
  "versions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    note: text("note"),
    reply: text("reply"),
    /** Full MotionDoc JSON snapshot for this version. */
    motionJson: text("motion_json", { mode: "json" }).$type<unknown>(),
    status: text("status", { enum: ["ready"] }).notNull().default("ready"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    projectVersionIdx: uniqueIndex("versions_project_no_idx").on(
      t.projectId,
      t.versionNo
    ),
  })
)

/** Phase-2 house memory: per-project style signals for the agents. Advisory only. */
export const agentMemory = sqliteTable(
  "agent_memory",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    projectIdx: index("agent_memory_project_idx").on(t.projectId),
  })
)

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    size: integer("size").notNull(),
    mime: text("mime").notNull(),
    r2Key: text("r2_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    projectIdx: index("attachments_project_idx").on(t.projectId),
  })
)

export const projectsRelations = relations(projects, ({ many }) => ({
  versions: many(versions),
  attachments: many(attachments),
}))

export const versionsRelations = relations(versions, ({ one }) => ({
  project: one(projects, {
    fields: [versions.projectId],
    references: [projects.id],
  }),
}))

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  project: one(projects, {
    fields: [attachments.projectId],
    references: [projects.id],
  }),
}))

/**
 * Agent conversations. Each conversation belongs to one project; a project
 * may have many conversations. Chat history is memory — the Remotion source
 * (versions/project_files) stays the source of truth for project state.
 */
export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    title: text("title").notNull().default("Untitled"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    projectIdx: index("conversations_project_idx").on(t.projectId),
    userIdx: index("conversations_user_idx").on(t.userId),
  })
)

/**
 * Persistent chat messages in AI SDK UIMessage shape.
 * `parts` preserves rich content: text, tool calls, tool results and
 * metadata — never reduced to plain text.
 */
export const messages = sqliteTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    parts: text("parts", { mode: "json" }).$type<unknown>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    conversationIdx: index("messages_conversation_idx").on(t.conversationId),
  })
)

/**
 * Virtual project file system the agent tools operate on.
 * Seeded lazily from the latest version's composition; the versions table
 * remains the durable snapshot log (preview/commit tools write back).
 */
export const projectFiles = sqliteTable(
  "project_files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    content: text("content").notNull().default(""),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    projectPathIdx: uniqueIndex("project_files_project_path_idx").on(
      t.projectId,
      t.path
    ),
  })
)

/** Last render/compile errors reported by the browser player, per project. */
export const renderErrors = sqliteTable(
  "render_errors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    versionNo: integer("version_no"),
    errors: text("errors", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    projectIdx: index("render_errors_project_idx").on(t.projectId),
  })
)

/**
 * Credit wallet: one row per user, the source of truth for limit-based use.
 * - `plan` is the credit tier (free | pro | studio), resolved lazily from
 *   the platform subscription and cached here (see lib/credits.ts).
 * - `balance` refills to the tier allowance at the start of each calendar
 *   month (`periodKey` = YYYY-MM UTC). `spentThisPeriod` powers the UI.
 * - Studio tier (`plan = "studio"`) is unlimited: spend() bypasses the
 *   balance check, the wallet row just records the tier.
 */
export const creditWallets = sqliteTable(
  "credit_wallets",
  {
    userId: text("user_id").primaryKey(),
    plan: text("plan", { enum: ["free", "pro", "studio"] })
      .notNull()
      .default("free"),
    balance: integer("balance").notNull().default(10),
    spentThisPeriod: integer("spent_this_period").notNull().default(0),
    periodKey: text("period_key").notNull().default("1970-01"),
    lifetimeGranted: integer("lifetime_granted").notNull().default(0),
    lifetimeSpent: integer("lifetime_spent").notNull().default(0),
    planCheckedAt: integer("plan_checked_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  }
)

/** Append-only audit log for every grant/spend/refund. Never updated. */
export const creditLedger = sqliteTable(
  "credit_ledger",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    refId: text("ref_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    userIdx: index("credit_ledger_user_idx").on(t.userId),
  })
)

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type Version = typeof versions.$inferSelect
export type AttachmentRow = typeof attachments.$inferSelect
export type Conversation = typeof conversations.$inferSelect
export type ChatMessage = typeof messages.$inferSelect
export type ProjectFile = typeof projectFiles.$inferSelect
export type CreditWallet = typeof creditWallets.$inferSelect
export type CreditLedgerEntry = typeof creditLedger.$inferSelect
