/**
 * Minimal in-memory stand-in for DrizzleD1Database, just enough for the
 * agent store's query shapes. Conditions are NOT interpreted — each test
 * gets a fresh, tiny database (usually one project row), so `where()`
 * filtering would only hide bugs. Known limitation: update/delete apply
 * to every row of the table; tests keep tables to ≤1 relevant row.
 */
import {
  attachments,
  conversations,
  messages,
  projectFiles,
  projects,
  renderErrors,
  versions,
} from "../src/db/schema"

export type Row = Record<string, unknown> & { id: string }

function chainFor(rows: Row[]) {
  const chain: {
    where: (...args: unknown[]) => typeof chain
    orderBy: (...args: unknown[]) => typeof chain
    limit: (...args: unknown[]) => typeof chain
    all: () => Promise<Row[]>
    then: (res: (v: Row[]) => unknown) => Promise<unknown>
  } = {
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    all: async () => rows,
    then: (res) => Promise.resolve([]).then(res),
  }
  return chain
}

export interface FakeDb {
  tables: Map<unknown, Row[]>
  select: (...args: unknown[]) => { from: (t: unknown) => ReturnType<typeof chainFor> }
  insert: (t: unknown) => {
    values: (v: Row | Row[]) => {
      returning: (...args: unknown[]) => Promise<Row[]>
      then: (res: (v: Row[]) => unknown) => Promise<unknown>
    }
  }
  update: (t: unknown) => {
    set: (patch: Row) => { where: (...args: unknown[]) => Promise<Row[]> }
  }
  delete: (t: unknown) => { where: (...args: unknown[]) => Promise<Row[]> }
}

let seq = 0

export function createFakeDb(seed?: Partial<Record<string, Row[]>>): FakeDb {
  const tables = new Map<unknown, Row[]>([
    [projects, [...(seed?.projects ?? [])]],
    [projectFiles, [...(seed?.projectFiles ?? [])]],
    [versions, [...(seed?.versions ?? [])]],
    [conversations, [...(seed?.conversations ?? [])]],
    [messages, [...(seed?.messages ?? [])]],
    [attachments, [...(seed?.attachments ?? [])]],
    [renderErrors, [...(seed?.renderErrors ?? [])]],
  ])
  const rowsOf = (t: unknown): Row[] => {
    let rows = tables.get(t)
    if (!rows) {
      rows = []
      tables.set(t, rows)
    }
    return rows
  }
  return {
    tables,
    select: () => ({ from: (t: unknown) => chainFor(rowsOf(t)) }),
    insert: (t: unknown) => ({
      values: (v: Row | Row[]) => {
        const arr = Array.isArray(v) ? v : [v]
        const table = rowsOf(t)
        const out = arr.map((r) => ({
          id: `fake-${++seq}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...r,
        }))
        table.push(...out)
        return {
          returning: async () => out,
          then: (res: (v: Row[]) => unknown) => Promise.resolve(out).then(res),
        }
      },
    }),
    update: (t: unknown) => ({
      set: (patch: Row) => ({
        where: async () => {
          for (const r of rowsOf(t)) Object.assign(r, patch)
          return []
        },
      }),
    }),
    delete: (t: unknown) => ({
      where: async () => {
        tables.set(t, [])
        return []
      },
    }),
  }
}

export function fakeProject(overrides?: Partial<Row>): Row {
  return {
    id: "proj-1",
    userId: "user-1",
    name: "Test cut",
    prompt: "a test countdown",
    format: "16:9",
    style: "Auto",
    durationSecs: 5,
    vibe: null,
    design: { bg: "#09090b", fg: "#ffffff", align: "center" },
    exportSettings: { quality: "1080p", fps: 30, container: "MP4" },
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function fakeCtx(db: FakeDb) {
  return {
    db,
    userId: "user-1",
    projectId: "proj-1",
    conversationId: "conv-1",
  }
}

export const VALID_CODE = `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export default function Composition() {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const fade = interpolate(frame, [0, 25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", opacity: fade }}>
      <div style={{ color: "#fff", width }}>Hello</div>
    </AbsoluteFill>
  );
}
`

export const BROKEN_CODE = `export const x = (
<div>unbalanced and no default export
`
