import { and, asc, desc, eq } from "drizzle-orm"
import {
  attachments,
  conversations,
  messages,
  projectFiles,
  projects,
  renderErrors,
  versions,
} from "../../db/schema"
import { asArtifact, type Artifact, type CodeArtifact } from "../artifact"
import type { AgentContext } from "./context"
import { requireProject } from "./context"

/** Main composition file. Single-file compositions live here. */
export const COMPOSITION_PATH = "src/Composition.tsx"
export const CONFIG_PATH = "remotion.config.json"

/** Path traversal guard — tools stay inside the project workspace. */
export function assertSafePath(path: string): string {
  if (path.includes("\0")) throw new Error("Refusing unsafe path (null byte)")
  if (/(^|\/)(\.\.)(\/|$)/.test(path.replace(/\\/g, "/"))) {
    throw new Error(`Refusing unsafe path: ${JSON.stringify(path)}`)
  }
  // Virtual store: keys are relative by construction. A leading slash is
  // normalised to relative — it cannot escape because paths are never
  // joined onto a real filesystem.
  const p = path.trim().replace(/\\/g, "/").replace(/^\/+/, "")
  if (!p || p === ".") {
    throw new Error(`Refusing unsafe path: ${JSON.stringify(path)}`)
  }
  if (p.length > 200) throw new Error("Path too long (max 200 chars)")
  return p
}

function defaultCanvasFor(format: string, durationSecs = 5) {
  const secs = Math.min(MAX_VIDEO_SECS, Math.max(3, Math.round(durationSecs) || 5))
  const durationInFrames = secs * 30
  if (format === "9:16") return { width: 1080, height: 1920, fps: 30, durationInFrames }
  if (format === "1:1") return { width: 1080, height: 1080, fps: 30, durationInFrames }
  return { width: 1920, height: 1080, fps: 30, durationInFrames }
}

function starterComposition(canvas: {
  width: number
  height: number
  fps: number
  durationInFrames: number
}): string {
  return `import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from "remotion";

export default function Composition() {
  const frame = useCurrentFrame();
  const {durationInFrames, width, height} = useVideoConfig();
  const s = Math.min(width, height) / 720;
  const fade = interpolate(frame, [0, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rise = interpolate(frame, [0, 32], [28 * s, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const playhead = interpolate(frame, [0, durationInFrames], [3, 97], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bars = [0.55, 0.85, 0.4, 1, 0.65];
  const sprockets = 28;
  return (
    <AbsoluteFill style={{backgroundColor: "#08090C"}}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(60% 50% at 50% 42%, rgba(225,29,72,0.22), transparent 70%)",
          opacity: fade,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          padding: (10 * s) + "px " + (14 * s) + "px",
          opacity: 0.5,
        }}
      >
        {Array.from({length: sprockets}).map((_, i) => (
          <div
            key={i}
            style={{width: 10 * s, height: 7 * s, borderRadius: 2 * s, backgroundColor: "rgba(255,255,255,0.22)"}}
          />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          padding: (10 * s) + "px " + (14 * s) + "px",
          opacity: 0.5,
        }}
      >
        {Array.from({length: sprockets}).map((_, i) => (
          <div
            key={i}
            style={{width: 10 * s, height: 7 * s, borderRadius: 2 * s, backgroundColor: "rgba(255,255,255,0.22)"}}
          />
        ))}
      </div>
      <AbsoluteFill style={{justifyContent: "center", alignItems: "center"}}>
        <div style={{opacity: fade, transform: \`translateY(\${rise}px)\`, display: "flex", flexDirection: "column", alignItems: "center"}}>
          <div
            style={{
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: 15 * s,
              letterSpacing: 8 * s,
              color: "#FB7185",
              fontWeight: 600,
            }}
          >
            SLYXUP MOTION
          </div>
          <div
            style={{
              fontFamily: "Anton, sans-serif",
              fontSize: 92 * s,
              color: "#F2EFE9",
              lineHeight: 1,
              marginTop: 10 * s,
            }}
          >
            Ready to roll
          </div>
          <div
            style={{
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: 19 * s,
              color: "rgba(242,239,233,0.6)",
              marginTop: 12 * s,
            }}
          >
            Describe your clip in the chat — the first cut lands here
          </div>
          <div style={{display: "flex", alignItems: "flex-end", gap: 10 * s, marginTop: 26 * s, height: 56 * s}}>
            {bars.map((h, i) => {
              const cycle = (frame + i * 9) % 60;
              const k = interpolate(cycle, [0, 30, 60], [0.25, 1, 0.25], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div
                  key={i}
                  style={{
                    width: 16 * s,
                    height: h * 56 * s * k + 6 * s,
                    borderRadius: 4 * s,
                    background: "linear-gradient(180deg, #FB7185, #E11D48)",
                    opacity: 0.55 + 0.4 * k,
                  }}
                />
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: \`\${playhead}%\`,
          top: 0,
          bottom: 0,
          width: Math.max(2, 2 * s),
          backgroundColor: "rgba(255,255,255,0.65)",
          opacity: 0.6,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: Math.max(3, 3 * s),
          backgroundColor: "rgba(255,255,255,0.12)",
        }}
      >
        <div style={{width: \`\${playhead}%\`, height: "100%", backgroundColor: "#E11D48"}} />
      </div>
    </AbsoluteFill>
  );
}
// canvas: ${canvas.width}x${canvas.height} ${canvas.durationInFrames}f @${canvas.fps}fps
`;
}

/** Latest code artifact snapshot (versions table stays the snapshot log). */
export async function latestArtifact(ctx: AgentContext): Promise<CodeArtifact | null> {
  await requireProject(ctx)
  const vers = await ctx.db
    .select()
    .from(versions)
    .where(eq(versions.projectId, ctx.projectId))
    .orderBy(desc(versions.versionNo))
    .limit(1)
    .all()
  for (const v of vers) {
    const a = asArtifact(v.motionJson)
    if (a?.kind === "code") return a
  }
  return null
}

/**
 * Seed the virtual file system from the latest version snapshot.
 * Idempotent — existing files are left alone.
 */
export async function ensureSeeded(ctx: AgentContext): Promise<void> {
  const proj = await requireProject(ctx)
  const existing = await ctx.db
    .select({ path: projectFiles.path })
    .from(projectFiles)
    .where(eq(projectFiles.projectId, ctx.projectId))
    .all()
  if (existing.length > 0) return
  const art = await latestArtifact(ctx)
  // The seed canvas must honor the duration the user picked in the prompt
  // box (project.durationSecs) — the old code always seeded 150 frames
  // (5s), so a "10 seconds, 9:16" brief silently started life as 5s and
  // the playground showed the default instead of the choice.
  const canvas = art
    ? {
        width: art.width,
        height: art.height,
        fps: art.fps,
        durationInFrames: art.durationInFrames,
      }
    : defaultCanvasFor(
        proj.format,
        typeof (proj as { durationSecs?: unknown }).durationSecs === "number"
          ? (proj as { durationSecs: number }).durationSecs
          : 5
      )
  const code = art?.code ?? starterComposition(canvas)
  await ctx.db.insert(projectFiles).values([
    { projectId: ctx.projectId, path: COMPOSITION_PATH, content: code },
    {
      projectId: ctx.projectId,
      path: CONFIG_PATH,
      content: JSON.stringify({ format: proj.format, ...canvas }, null, 2),
    },
  ])
}

export async function listFiles(ctx: AgentContext): Promise<Array<{ path: string; bytes: number }>> {
  await ensureSeeded(ctx)
  const rows = await ctx.db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.projectId, ctx.projectId))
    .orderBy(asc(projectFiles.path))
    .all()
  return rows.map((r) => ({ path: r.path, bytes: r.content.length }))
}

export async function readFileContent(ctx: AgentContext, path: string): Promise<string> {
  const safe = assertSafePath(path)
  await ensureSeeded(ctx)
  const [row] = await ctx.db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.projectId, ctx.projectId), eq(projectFiles.path, safe)))
    .limit(1)
    .all()
  if (!row) throw new Error(`File not found: ${safe}`)
  return row.content
}

export async function writeFileContent(
  ctx: AgentContext,
  path: string,
  content: string
): Promise<{ path: string; bytes: number; created: boolean }> {
  const safe = assertSafePath(path)
  if (content.length > 200000) throw new Error("File too large (max 200000 chars)")
  await ensureSeeded(ctx)
  const [row] = await ctx.db
    .select({ id: projectFiles.id })
    .from(projectFiles)
    .where(and(eq(projectFiles.projectId, ctx.projectId), eq(projectFiles.path, safe)))
    .limit(1)
    .all()
  if (row) {
    await ctx.db
      .update(projectFiles)
      .set({ content, updatedAt: new Date() })
      .where(eq(projectFiles.id, row.id))
    return { path: safe, bytes: content.length, created: false }
  }
  await ctx.db.insert(projectFiles).values({ projectId: ctx.projectId, path: safe, content })
  return { path: safe, bytes: content.length, created: true }
}

export async function deleteFile(ctx: AgentContext, path: string): Promise<void> {
  const safe = assertSafePath(path)
  if (safe === COMPOSITION_PATH) {
    throw new Error(`${COMPOSITION_PATH} is the main composition and cannot be deleted — edit it instead.`)
  }
  await ensureSeeded(ctx)
  await ctx.db
    .delete(projectFiles)
    .where(and(eq(projectFiles.projectId, ctx.projectId), eq(projectFiles.path, safe)))
}

export async function renameFile(ctx: AgentContext, from: string, to: string): Promise<void> {
  const safeFrom = assertSafePath(from)
  const safeTo = assertSafePath(to)
  if (safeFrom === COMPOSITION_PATH || safeTo === COMPOSITION_PATH) {
    throw new Error(`Cannot rename to or from ${COMPOSITION_PATH}.`)
  }
  const content = await readFileContent(ctx, safeFrom)
  await writeFileContent(ctx, safeTo, content)
  await ctx.db
    .delete(projectFiles)
    .where(and(eq(projectFiles.projectId, ctx.projectId), eq(projectFiles.path, safeFrom)))
}

/** Hard ceiling: single clips are at most 15 seconds long. */
export const MAX_VIDEO_SECS = 15

function clampCanvas<T extends { fps: number; durationInFrames: number }>(
  c: T
): { canvas: T; clamped: boolean } {
  const fps = Math.min(60, Math.max(24, Math.round(c.fps) || 30))
  const maxFrames = MAX_VIDEO_SECS * fps
  const durationInFrames = Math.min(Math.max(15, Math.round(c.durationInFrames) || 150), maxFrames)
  const clamped = durationInFrames !== Math.round(c.durationInFrames)
  return { canvas: { ...c, fps, durationInFrames }, clamped }
}

/** Canvas for the current composition (config file or project default). */
export async function readCanvas(ctx: AgentContext): Promise<{
  width: number
  height: number
  fps: number
  durationInFrames: number
}> {
  const proj = await requireProject(ctx).catch(() => ({ format: "16:9" as const, durationSecs: 5 as number }))
  const fallback = defaultCanvasFor(
    proj.format,
    typeof (proj as { durationSecs?: unknown }).durationSecs === "number"
      ? (proj as { durationSecs: number }).durationSecs
      : 5
  )
  try {
    const raw = await readFileContent(ctx, CONFIG_PATH)
    const parsed = JSON.parse(raw) as Partial<typeof fallback>
    if (parsed.width && parsed.height && parsed.fps && parsed.durationInFrames) {
      return clampCanvas({
        width: Math.round(parsed.width),
        height: Math.round(parsed.height),
        fps: Math.round(parsed.fps),
        durationInFrames: Math.round(parsed.durationInFrames),
      }).canvas
    }
  } catch {
    /* fallback */
  }
  return clampCanvas(fallback).canvas
}

/** Snapshot the composition file as a new version row (preview/commit). */
export async function snapshotVersion(
  ctx: AgentContext,
  opts: { note?: string; reply?: string }
): Promise<{ versionNo: number; artifact: Artifact; durationClamped: boolean }> {
  const code = await readFileContent(ctx, COMPOSITION_PATH)
  let canvas = defaultCanvasFor("16:9")
  try {
    const raw = await readFileContent(ctx, CONFIG_PATH)
    const parsed = JSON.parse(raw) as Partial<typeof canvas>
    if (parsed.width && parsed.height && parsed.fps && parsed.durationInFrames) {
      canvas = {
        width: Math.round(parsed.width),
        height: Math.round(parsed.height),
        fps: Math.round(parsed.fps),
        durationInFrames: Math.round(parsed.durationInFrames),
      }
    }
  } catch {
    /* keep defaults */
  }
  const { canvas: clamped, clamped: durationClamped } = clampCanvas(canvas)
  canvas = clamped
  const artifact: Artifact = { kind: "code", ...canvas, code }
  // Dedupe: a retried step (e.g. after a CPU-death) re-previews identical
  // code — minting a new version row for it would inflate history with
  // phantom versions. Same bytes → same version number, no insert.
  const latest = await latestArtifact(ctx)
  if (latest && latest.code === code) {
    const [row] = await ctx.db
      .select({ versionNo: versions.versionNo })
      .from(versions)
      .where(eq(versions.projectId, ctx.projectId))
      .orderBy(desc(versions.versionNo))
      .limit(1)
      .all()
    if (row) return { versionNo: row.versionNo, artifact, durationClamped }
  }
  const existing = await ctx.db
    .select({ versionNo: versions.versionNo })
    .from(versions)
    .where(eq(versions.projectId, ctx.projectId))
    .all()
  const next = existing.reduce((m, v) => Math.max(m, v.versionNo), 0) + 1
  await ctx.db.insert(versions).values({
    projectId: ctx.projectId,
    versionNo: next,
    note: opts.note?.slice(0, 500) ?? null,
    reply: opts.reply?.slice(0, 500) ?? null,
    motionJson: artifact,
  })
  await ctx.db
    .update(projects)
    .set({ status: "ready", updatedAt: new Date() })
    .where(eq(projects.id, ctx.projectId))
  return { versionNo: next, artifact, durationClamped }
}

// ---- conversations / messages (rich UIMessage parts, never plain text) ----

export interface StoredMessage {
  id: string
  role: "user" | "assistant" | "system"
  parts: unknown
}

export async function createConversation(
  ctx: Omit<AgentContext, "conversationId">,
  title?: string
): Promise<{ id: string; title: string }> {
  await requireProject(ctx as AgentContext)
  const [row] = await ctx.db
    .insert(conversations)
    .values({
      projectId: ctx.projectId,
      userId: ctx.userId,
      title: (title ?? "Untitled").slice(0, 120),
    })
    .returning({ id: conversations.id, title: conversations.title })
  return row
}

export async function listConversations(ctx: Omit<AgentContext, "conversationId">) {
  await requireProject(ctx as AgentContext)
  return ctx.db
    .select()
    .from(conversations)
    .where(eq(conversations.projectId, ctx.projectId))
    .orderBy(desc(conversations.updatedAt))
    .all()
}

export async function getConversation(
  ctx: AgentContext
): Promise<{ id: string; title: string } | null> {
  const [row] = await ctx.db
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .where(eq(conversations.id, ctx.conversationId))
    .limit(1)
    .all()
  if (!row) return null
  // Ownership is via the project, not the conversation id alone.
  await requireProject(ctx)
  return row
}

export async function loadMessages(
  ctx: AgentContext,
  limit = 12
): Promise<StoredMessage[]> {
  await requireProject(ctx)
  // Bounded AND matched to the model window (MAX_MODEL_HISTORY = 12):
  // unbounded history with full-code tool snapshots is what blew the
  // Worker's CPU budget — every stored message was re-read, re-parsed
  // and re-serialized on every model step. Older turns never reach the
  // model or the UI window, so loading them only burns CPU + D1 bytes.
  // (Stored parts are additionally sanitized on write — see
  // sanitizePartsForStorage — so rows stay small forever.)
  const rows = await ctx.db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, ctx.conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .all()
  return rows
    .reverse()
    .map((r) => ({ id: r.id, role: r.role, parts: r.parts }))
}

/**
 * Storage sanitizer: tool outputs for preview_composition / render_video
 * carry the ENTIRE composition source (6–120KB) inside message parts.
 * Persisting that verbatim meant every future turn re-read, re-parsed
 * and re-serialized megabytes of duplicated code — the main driver of
 * the prod `exceededCpu` deaths. The live stream already delivered the
 * full artifact to the client (the version rail + preview bridge read
 * the live parts, never the stored ones), the version row holds the
 * code authoritatively, and refresh recovery re-syncs via
 * /api/projects/:id — so storage keeps only the version pointer +
 * canvas facts. This is what makes history size O(turns) instead of
 * O(turns × code size), permanently.
 */
export function sanitizePartsForStorage(parts: unknown): unknown {
  if (!Array.isArray(parts)) return parts ?? []
  return parts.map((p) => {
    if (typeof p !== "object" || p === null) return p
    const t = (p as { type?: unknown }).type
    if (t === "file") {
      // Reference images arrive as base64 data URLs (~700KB each, up to 3).
      // Storing them verbatim meant every later turn re-read megabytes of
      // base64 out of D1 and re-serialized it into the model context — a
      // pure repeat of data the model has already seen, and one of the
      // largest CPU items in the request.
      //
      // The image itself lives in R2 (the upload route) and the turn that
      // introduced it already carries the bytes the model needed. Keeping a
      // pointer keeps history truthful ("there was a reference image")
      // while making stored size O(turns) instead of O(turns × image size).
      const part = p as Record<string, unknown>
      return {
        ...part,
        url: "",
        mediaType: typeof part.mediaType === "string" ? part.mediaType : "image/jpeg",
        storageNote: "reference image stored in R2 — bytes omitted from history",
      }
    }
    if (typeof t !== "string" || (!t.startsWith("tool-") && t !== "dynamic-tool")) return p
    const part = p as Record<string, unknown>
    const out = part.output as Record<string, unknown> | undefined
    if (!out || typeof out !== "object") return p
    const art = out.artifact as Record<string, unknown> | undefined
    if (!art || typeof art !== "object" || typeof art.code !== "string") return p
    return {
      ...part,
      output: {
        ...out,
        artifact: {
          kind: art.kind,
          width: art.width,
          height: art.height,
          fps: art.fps,
          durationInFrames: art.durationInFrames,
          version: (out as { version?: unknown }).version ?? null,
          note: "[full code lives in the version snapshot — see preview vN]",
        },
      },
    }
  })
}

export async function appendMessage(
  ctx: AgentContext,
  msg: { role: "user" | "assistant" | "system"; parts: unknown }
): Promise<void> {
  await ctx.db.insert(messages).values({
    conversationId: ctx.conversationId,
    role: msg.role,
    parts: sanitizePartsForStorage(msg.parts ?? []),
  })
  await ctx.db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, ctx.conversationId))
}

// ---- assets + render errors ----

export async function listAttachments(ctx: AgentContext) {
  await requireProject(ctx)
  return ctx.db
    .select()
    .from(attachments)
    .where(eq(attachments.projectId, ctx.projectId))
    .all()
}

export async function latestRenderErrors(ctx: AgentContext): Promise<string[]> {
  await requireProject(ctx)
  const rows = await ctx.db
    .select()
    .from(renderErrors)
    .where(eq(renderErrors.projectId, ctx.projectId))
    .orderBy(desc(renderErrors.createdAt))
    .limit(1)
    .all()
  return rows[0]?.errors ?? []
}
