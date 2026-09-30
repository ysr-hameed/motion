import { and, eq } from "drizzle-orm"
import { getDb, type Db } from "../db"
import { projects } from "../../db/schema"

/**
 * Runtime context threaded through the agent and every tool call.
 * IDs come from the authenticated request — never from the model.
 * Tools verify project ownership against this context on every call.
 */
export interface AgentContext {
  db: Db
  userId: string
  projectId: string
  conversationId: string
}

export class ProjectAccessError extends Error {
  status = 404
  constructor() {
    super("Project not found")
    this.name = "ProjectAccessError"
  }
}

/** Load the project row, or throw when it is missing / not owned. */
export async function requireProject(ctx: AgentContext) {
  const [row] = await ctx.db
    .select()
    .from(projects)
    .where(and(eq(projects.id, ctx.projectId), eq(projects.userId, ctx.userId)))
    .limit(1)
    .all()
  if (!row) throw new ProjectAccessError()
  return row
}

export function createAgentContext(opts: {
  database: D1Database
  userId: string
  projectId: string
  conversationId: string
}): AgentContext {
  return {
    db: getDb(opts.database),
    userId: opts.userId,
    projectId: opts.projectId,
    conversationId: opts.conversationId,
  }
}
