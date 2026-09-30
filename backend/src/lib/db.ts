import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1"
import * as schema from "../db/schema"

export type Db = DrizzleD1Database<typeof schema>

export function getDb(database: D1Database): Db {
  return drizzle(database, { schema })
}
