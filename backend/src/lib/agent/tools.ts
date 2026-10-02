import { tool } from "ai"
import { z } from "zod"
import { desc, eq } from "drizzle-orm"
import { versions } from "../../db/schema"
import { applyEdits, coerceOps } from "../agents/edit-ops"
import { blockingIssues, describeIssues, lintCompositionCached as lintComposition } from "../code-lint"
import { hasDefaultExport } from "../code-block"
import type { AgentContext } from "./context"
import { ProjectAccessError, requireProject } from "./context"
import {
  COMPOSITION_PATH,
  assertSafePath,
  deleteFile,
  latestArtifact,
  latestRenderErrors,
  listAttachments,
  listFiles,
  readFileContent,
  renameFile,
  snapshotVersion,
  writeFileContent,
} from "./store"
import { COMPOSITION_LINE_BUDGET } from "./turns"

/**
 * Splice point for incremental composition building.
 *
 * `write_composition` guarantees this exists, `append_composition` inserts
 * immediately above it, and it survives every append — so "add another
 * beat" is always a bounded call no matter how big the scene gets. See
 * `append_composition` for why a whole-file write cannot work here.
 */
const BEATS_MARKER = "/* @@BEATS@@ */"

const MAX_OUTPUT = 12000
const truncate = (s: string, n = MAX_OUTPUT) =>
  s.length > n ? `${s.slice(0, n)}\n…[truncated ${s.length - n} chars]` : s

/**
 * Clean, bounded tool system for the Remotion coding agent.
 * Every tool is project-scoped: ownership is verified against the
 * request's runtime context, never against an id supplied by the model.
 * Tool outputs are bounded so a large file can never flood the context.
 */
export function buildTools(ctx: AgentContext) {
  const tools = {
    get_project: tool({
      description:
        "Get the current project's metadata: name, format, style, status, canvas and version count. " +
        "Use it first when you need orientation before editing. " +
        "Do NOT use it to read code — use read_file for that.",
      inputSchema: z.object({}),
      execute: async () => {
        const proj = await requireProject(ctx)
        const art = await latestArtifact(ctx)
          return {
            ok: true as const,
            id: proj.id,
            name: proj.name,
            prompt: proj.prompt.slice(0, 500),
            format: proj.format,
            style: proj.style,
            status: proj.status,
            composition: art
              ? {
                  path: COMPOSITION_PATH,
                  lines: art.code.split("\n").length,
                  width: art.width,
                  height: art.height,
                  fps: art.fps,
                  durationInFrames: art.durationInFrames,
                }
              : null,
          };
        },
      }),
    get_project_structure: tool({
      description:
        "List every file in the project workspace with sizes. " +
        "Use it to discover what exists before reading or editing. " +
        "Do NOT use it repeatedly — the file list rarely changes mid-task.",
      inputSchema: z.object({}),
      execute: async () => ({ ok: true as const, files: await listFiles(ctx) }),
    }),

    read_file: tool({
      description:
        "Read a file's full content. REQUIRED before editing any file — never guess at file contents. " +
        "For very large files, prefer search_code first to find the relevant section. " +
        "When NOT to use: to list files (use get_project_structure) or to check validity (use validate_composition).",
      inputSchema: z.object({
        path: z.string().describe("Workspace-relative path, e.g. src/Composition.tsx"),
        maxChars: z
          .number()
          .int()
          .min(500)
          .max(60000)
          .optional()
          .describe("Truncate output to this many chars (default 30000)"),
      }),
      execute: async ({ path, maxChars }) => {
        const content = await readFileContent(ctx, path)
        return {
          ok: true as const,
          path: assertSafePath(path),
          bytes: content.length,
          lines: content.split("\n").length,
          content: truncate(content, maxChars ?? 30000),
          truncated: content.length > (maxChars ?? 30000),
        }
      },
    }),

    search_code: tool({
      description:
        "Search all project files for a text or regex pattern. Returns file, line number and the matching line. " +
        "Use it to locate animations, components, timings or colors before reading the full file. " +
        "Do NOT use it for semantic questions — read the file when you need understanding, not just location.",
      inputSchema: z.object({
        pattern: z.string().min(1).max(200).describe("Plain text or regex to find"),
        regex: z.boolean().default(false).describe("Treat pattern as a regular expression"),
      }),
      execute: async ({ pattern, regex }) => {
        const files = await listFiles(ctx)
        let re: RegExp
        try {
          re = regex ? new RegExp(pattern, "i") : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
        } catch {
          return { ok: false as const, pattern, error: `Invalid regex: ${pattern.slice(0, 100)}` }
        }
        const hits: Array<{ path: string; line: number; text: string }> = []
        for (const f of files) {
          if (!/\.(tsx?|jsx?|css|json)$/.test(f.path)) continue
          const content = await readFileContent(ctx, f.path)
          const lines = content.split("\n")
          for (let i = 0; i < lines.length && hits.length < 40; i++) {
            if (re.test(lines[i]!)) hits.push({ path: f.path, line: i + 1, text: lines[i]!.slice(0, 200) })
          }
          if (hits.length >= 40) break
        }
        return { ok: true as const, pattern, matches: hits }
      },
    }),

    create_file: tool({
      description:
        "Create a NEW file with the given content. Fails if the file already exists (use edit_file then). " +
        "Use it for new components, scenes or styles. " +
        "Do NOT use it to overwrite existing files, and do NOT create dozens of tiny files — prefer editing the composition.",
      inputSchema: z.object({
        path: z.string().describe("Workspace-relative path for the new file"),
        content: z.string().min(1).max(200000).describe("Full file content"),
      }),
      execute: async ({ path, content }) => {
        const safe = assertSafePath(path)
        try {
          await readFileContent(ctx, safe)
          return { ok: false as const, path: safe, error: `File already exists: ${safe} — use edit_file to modify it.` }
        } catch (err) {
          if (err instanceof Error && !err.message.startsWith("File not found")) throw err
        }
        const res = await writeFileContent(ctx, safe, content)
        return { ok: true as const, ...res }
      },
    }),

    edit_file: tool({
      description:
        "Modify an existing file. This is the primary way to change Remotion code — arbitrary controlled modifications. " +
        "Provide either `ops` (preferred: small find/replace operations, each `find` copied VERBATIM from the file including " +
        "indentation, 1-8 ops) or `instruction` (a precise natural-language edit applied to the exact code you already read). " +
        "You MUST call read_file first and base every `find` on what you actually read — never invent file contents. " +
        "The tool validates the result (default export, brace balance) and reports misses honestly — never claim success unless " +
        "the result says applied. When NOT to use: for new files (use create_file).",
      inputSchema: z.object({
        path: z.string().describe("Workspace-relative path of the file to edit"),
        ops: z
          .array(
            z.object({
              op: z.enum(["replace", "replaceAll", "insertAfter", "insertBefore", "delete"]),
              find: z.string().optional().describe("Exact text from the file (replace/replaceAll/delete)"),
              replace: z.string().optional().describe("Replacement text (replace/replaceAll)"),
              anchor: z.string().optional().describe("Exact anchor text (insertAfter/insertBefore)"),
              text: z.string().optional().describe("Text to insert (insertAfter/insertBefore)"),
            })
          )
          .max(8)
          .optional()
          .describe("Surgical edit operations. Preferred for all non-structural changes."),
        instruction: z
          .string()
          .max(2000)
          .optional()
          .describe(
            "Precise edit instruction, e.g. 'Move the title to the upper-left and make it 20% smaller'. " +
              "Only used when ops cannot express the change; the current file content is re-applied by the editor."
          ),
      }),
      execute: async ({ path, ops, instruction }) => {
        const safe = assertSafePath(path)
        const current = await readFileContent(ctx, safe)
        const parsed = coerceOps(ops ?? [])
        if (parsed.length === 0 && !instruction) {
          return {
            ok: false as const,
            path: safe,
            applied: 0,
            misses: [],
            error: "Provide `ops` (preferred) or a precise `instruction`.",
            hint: "Copy `find` text verbatim from read_file, 1-8 ops.",
          }
        }
        let next = current
        let strategy = "ops"
        const misses: string[] = []
        if (parsed.length > 0) {
          const applied = applyEdits(current, parsed)
          next = applied.code
          for (const f of applied.failed) {
            const o = f.op as unknown as Record<string, unknown>
            misses.push(`${String(o.op)}: ${f.reason} — ${String(o.find ?? o.anchor ?? "").slice(0, 80)}`)
          }
          if (applied.applied === 0) {
            return {
              ok: false as const,
              path: safe,
              applied: 0,
              misses,
              hint: "Every op missed. Re-read the file with read_file and copy `find` text verbatim, or send a precise `instruction` instead.",
            }
          }
        } else {
          strategy = "instruction-pending"
          return {
            ok: false as const,
            path: safe,
            applied: 0,
            misses: [],
            hint: "Instruction-only edits are applied by re-emitting the file: respond with `ops` derived from the file you read, or rewrite via create path. Short precise instructions work best as 1-3 ops.",
          }
        }
        // Post-edit gate: the file must still be mountable.
        if (/\.(tsx?|jsx?)$/.test(safe)) {
          if (!hasDefaultExport(next) && safe === COMPOSITION_PATH) {
            return {
              ok: false as const,
              path: safe,
              applied: 0,
              misses: ["edit would remove the default export"],
              hint: "The composition needs its default export. Adjust the ops to keep it.",
            }
          }
          const blocking = blockingIssues(lintComposition(next))
          if (blocking.length > 0) {
            return {
              ok: false as const,
              path: safe,
              applied: 0,
              misses: blocking.map((i) => `[${i.code}] ${i.message}`),
              hint: "The edit would break the file. Refine the ops so the result still parses.",
            }
          }
        }
        const res = await writeFileContent(ctx, safe, next)
        return {
          ok: true as const,
          path: res.path,
          bytes: res.bytes,
          lines: next.split("\n").length,
          applied: parsed.length - misses.length,
          strategy,
          ...(misses.length > 0 ? { partialMisses: misses } : {}),
        }
      },
    }),

    write_composition: tool({
      description:
        "Replace the ENTIRE main composition (src/Composition.tsx) with new full-file content. " +
        "Use it for a redesign/remake/start-over, and for the FIRST write of a new scene. " +
        "You MUST call read_file first (keep imports, canvas shape and the default export valid). " +
        "The result is gated exactly like edit_file: default export + static lint must pass or the " +
        "write is rejected with reasons. " +
        "This call carries the WHOLE file, so write the complete composition here — " +
        "imports, every component, every beat, the default export. There is no tight " +
        "response ceiling to design around; if the scene is genuinely large, build it in " +
        "parts with append_composition instead of truncating this one. " +
        `As a guide, a whole composition usually lands near ${COMPOSITION_LINE_BUDGET} lines — write the ` +
        "quality scene you want, not the smallest one that fits. " +
        "When NOT to use: small tweaks (use edit_file), new side files (use create_file).",
      inputSchema: z.object({
        content: z
          .string()
          .min(200)
          .max(120000)
          .describe(
            `The COMPLETE src/Composition.tsx — imports, all components, all beats, and the default export. Aim for a well-made scene rather than a short one.`
          ),
      }),
      execute: async ({ content }) => {
        if (!hasDefaultExport(content)) {
          return {
            ok: false as const,
            path: COMPOSITION_PATH,
            applied: 0,
            misses: ["replacement would remove the default export"],
            hint: "Keep `export default function Composition` in the new file.",
          }
        }
        const blocking = blockingIssues(lintComposition(content))
        if (blocking.length > 0) {
          return {
            ok: false as const,
            path: COMPOSITION_PATH,
            applied: 0,
            misses: blocking.map((i) => `[${i.code}] ${i.message}`),
            hint: "The replacement does not parse. Fix the flagged issues and retry.",
          }
        }
        // Guarantee the splice point rather than asking the model to
        // remember it. `append_composition` inserts immediately ABOVE this
        // marker, so it survives every append and is always available —
        // which is what makes incremental building impossible to get wrong.
        const next = content.includes(BEATS_MARKER) ? content : `${content}\n${BEATS_MARKER}\n`
        const res = await writeFileContent(ctx, COMPOSITION_PATH, next)
        return {
          ok: true as const,
          path: res.path,
          bytes: res.bytes,
          lines: next.split("\n").length,
          applied: 1,
          strategy: "rewrite",
          hint: "Added more beats with append_composition — do not resend this whole file.",
        }
      },
    }),

    /**
     * Incremental build. The structural answer to "the file does not fit in
     * one reply".
     *
     * Every failure of this kind is the same failure: a whole-file tool call
     * is emitted, it exceeds `maxOutputTokens`, the JSON arguments never
     * close, the SDK discards the call WITHOUT running it, nothing throws,
     * and the model is told only "The tool failed." — so it resends the
     * identical oversized payload. Six identical plans, six 16.2K-token
     * responses, no progress.
     *
     * Splicing above a marker that `write_composition` guarantees means
     * every call is bounded by the per-call cap rather than by the size of
     * the scene. A 2,000-line composition becomes six honest tool calls
     * instead of one impossible one. This is the same reason Claude Code
     * and Codex emit targeted replacements rather than whole files.
     */
    append_composition: tool({
      description:
        "Add ONE more beat to src/Composition.tsx without resending the file. " +
        "This is the normal way to build a scene that is too large for a single reply: " +
        "write_composition for the skeleton, then append_composition once per beat. " +
        "The code is inserted just above the splice marker at the end of the file, " +
        "so put only the new beat here — no imports, no default export, no wrapping " +
        "component. If your beat needs a new import, add it with edit_file first. " +
        "One beat per call, so the change is easy to review and easy to undo. " +
        "The whole file is linted after the splice, so a broken beat is rejected with reasons.",
      inputSchema: z.object({
        content: z
          .string()
          .min(40)
          .max(80000)
          .describe(
            `One new beat for src/Composition.tsx — code only, spliced above the end marker. No imports, no default export, no wrapping component.`
          ),
      }),
      execute: async ({ content }) => {
        const current = await readFileContent(ctx, COMPOSITION_PATH)
        const at = current.indexOf(BEATS_MARKER)
        if (at === -1) {
          return {
            ok: false as const,
            path: COMPOSITION_PATH,
            applied: 0,
            misses: ["the composition has no splice marker"],
            hint:
              "Call write_composition once to rewrite the file (it adds the marker), then append beats to it.",
          }
        }
        if (/^\s*(import\b|export\b)/m.test(content)) {
          return {
            ok: false as const,
            path: COMPOSITION_PATH,
            applied: 0,
            misses: ["a beat must not contain import or export statements"],
            hint:
              "Imports belong at the top of the file — add them with edit_file, then append the beat again.",
          }
        }
        const head = current.slice(0, at).replace(/\s*$/, "\n")
        const tail = current.slice(at + BEATS_MARKER.length)
        const next = `${head}\n${content.replace(/\s*$/, "")}\n\n${BEATS_MARKER}${tail}`
        if (!hasDefaultExport(next)) {
          return {
            ok: false as const,
            path: COMPOSITION_PATH,
            applied: 0,
            misses: ["the append would remove the default export"],
            hint: "Keep `export default function Composition` in the file.",
          }
        }
        const blocking = blockingIssues(lintComposition(next))
        if (blocking.length > 0) {
          return {
            ok: false as const,
            path: COMPOSITION_PATH,
            applied: 0,
            misses: blocking.map((i) => `[${i.code}] ${i.message}`),
            hint: "That beat does not parse. Fix the flagged issues and append again.",
          }
        }
        const res = await writeFileContent(ctx, COMPOSITION_PATH, next)
        return {
          ok: true as const,
          path: res.path,
          bytes: res.bytes,
          lines: next.split("\n").length,
          added: content.split("\n").length,
          applied: 1,
          strategy: "append",
        }
      },
    }),

    delete_file: tool({
      description:
        "Delete a file. DANGER: irreversible. Requires `confirmed: true` — call once without it to see what would be deleted, " +
          "ask the user via ask_user, then call again with confirmed:true. " +
        "The main composition src/Composition.tsx can NEVER be deleted. When NOT to use: to remove code inside a file (use edit_file).",
      inputSchema: z.object({
        path: z.string().describe("Workspace-relative path to delete"),
        confirmed: z.boolean().default(false).describe("Must be true to actually delete"),
      }),
      execute: async ({ path, confirmed }) => {
        const safe = assertSafePath(path)
        if (!confirmed) {
          return { ok: true as const, deleted: false, path: safe, message: "Confirmation required — re-call with confirmed:true after asking the user." }
        }
        await deleteFile(ctx, safe)
        return { ok: true as const, deleted: true, path: safe }
      },
    }),

    rename_file: tool({
      description:
        "Rename (move) a file within the workspace. Updates nothing that imports it — fix imports with edit_file afterwards. " +
        "Cannot rename to or from src/Composition.tsx.",
      inputSchema: z.object({
        from: z.string().describe("Current workspace-relative path"),
        to: z.string().describe("New workspace-relative path"),
      }),
      execute: async ({ from, to }) => {
        await renameFile(ctx, from, to)
        return { ok: true as const, from: assertSafePath(from), to: assertSafePath(to) }
      },
    }),

    inspect_composition: tool({
      description:
        "Inspect the current composition: canvas (width/height/fps/duration), line count and a structural summary " +
        "(Sequence/Series/transitions usage). Use it before retiming, restructuring or answering 'what is in the video'. " +
        "Do NOT use it to read code — use read_file for that.",
      inputSchema: z.object({}),
      execute: async () => {
        const code = await readFileContent(ctx, COMPOSITION_PATH)
        let canvas = { width: 1920, height: 1080, fps: 30, durationInFrames: 150 }
        try {
          const parsed = JSON.parse(await readFileContent(ctx, "remotion.config.json")) as Partial<typeof canvas>
          if (parsed.width && parsed.height && parsed.fps && parsed.durationInFrames) {
            canvas = {
              width: Math.round(parsed.width),
              height: Math.round(parsed.height),
              fps: Math.round(parsed.fps),
              durationInFrames: Math.round(parsed.durationInFrames),
            }
          }
        } catch {
          /* defaults */
        }
        const uses = {
          sequence: /<Sequence[\s>]/.test(code),
          series: /<Series[\s>]/.test(code),
          transitions: /<TransitionSeries[\s>]/.test(code),
          interpolate: /interpolate\(/.test(code),
          spring: /spring\(/.test(code),
        }
        return { ok: true as const, path: COMPOSITION_PATH, canvas, lines: code.split("\n").length, uses }
      },
    }),

    inspect_timeline: tool({
      description:
        "Inspect the timeline: all Sequence/Series from/durationInFrames values against the composition length. " +
        "Use it for timing requests ('faster', 'after 2 seconds', '10 seconds long'). Returns each timed element and flags anything starting past the last frame.",
      inputSchema: z.object({}),
      execute: async () => {
        const code = await readFileContent(ctx, COMPOSITION_PATH)
        let durationInFrames = 150
        try {
          const parsed = JSON.parse(await readFileContent(ctx, "remotion.config.json")) as { durationInFrames?: number }
          if (parsed.durationInFrames) durationInFrames = Math.round(parsed.durationInFrames)
        } catch {
          /* default */
        }
        const items: Array<{ kind: string; from?: number; duration?: number; line: number }> = []
        const lines = code.split("\n")
        lines.forEach((line, i) => {
          const m = line.match(/<(Sequence|Series\.Sequence)[^>]*>/)
          if (m) {
            const from = line.match(/from=\{?(\d+)\}?/)?.[1]
            const dur = line.match(/durationInFrames=\{?(\d+)\}?/)?.[1]
            items.push({
              kind: m[1]!,
              ...(from ? { from: Number(from) } : {}),
              ...(dur ? { duration: Number(dur) } : {}),
              line: i + 1,
            })
          }
        })
        const pastEnd = items.filter((it) => it.from !== undefined && it.from >= durationInFrames)
        return { ok: true as const, durationInFrames, lastFrame: durationInFrames - 1, items: items.slice(0, 30), pastEnd }
      },
    }),

    validate_composition: tool({
      description:
        "Validate the composition statically: default export, brace/JSX balance, undefined identifiers, deterministic APIs. " +
        "ALWAYS call it after edit_file/create_file and before preview_composition. " +
        "Returns blocking errors (must fix) and warnings (advisory). A clean validation does NOT prove it renders — preview does.",
      inputSchema: z.object({}),
      execute: async () => {
        const code = await readFileContent(ctx, COMPOSITION_PATH)
        const issues = lintComposition(code)
        const blocking = blockingIssues(issues)
        const warnings = issues.filter((i) => i.severity === "warn").map((i) => `[${i.code}] ${i.message}`)
        try {
          const raw = await readFileContent(ctx, "remotion.config.json")
          const cfg = JSON.parse(raw) as { durationInFrames?: number; fps?: number }
          const fps = Math.round(cfg.fps ?? 30) || 30
          const frames = Math.round(cfg.durationInFrames ?? 0)
          if (frames > 15 * fps) {
            warnings.push(
              `[over-15s] The timeline is ${(frames / fps).toFixed(1)}s — clips are at most 15 seconds. Shorten durationInFrames to ${15 * fps} or less.`
            )
          }
        } catch {
          /* config unreadable — snapshot clamps anyway */
        }
        return {
          ok: blocking.length === 0,
          blocking: blocking.map((i) => `[${i.code}] ${i.message}`),
          warnings,
          detail: blocking.length === 0 ? describeIssues(issues).slice(0, 500) : undefined,
        }
      },
    }),

    preview_composition: tool({
      description:
        "Commit the current composition as a new previewable version. Call ONLY after validate_composition is clean. " +
        "The user sees the new cut on stage immediately. Returns the version number and canvas. " +
        "Do NOT call it when validation has blocking errors — fix them first. " +
        "Do NOT claim an edit succeeded until this tool confirms the version.",
      inputSchema: z.object({
        note: z.string().max(500).optional().describe("Short note describing this version"),
      }),
      execute: async ({ note }) => {
        const code = await readFileContent(ctx, COMPOSITION_PATH)
        const blocking = blockingIssues(lintComposition(code))
        if (blocking.length > 0) {
          // Structured, not thrown: the error-recovery loop reads this and
          // repairs instead of dying with "An error occurred".
          return {
            ok: false as const,
            blocking: blocking.map((i) => `[${i.code}] ${i.message}`),
            error: `Cannot preview: blocking errors remain: ${blocking.map((i) => i.message).join("; ").slice(0, 400)}`,
          }
        }
        let snap: Awaited<ReturnType<typeof snapshotVersion>>
        try {
          snap = await snapshotVersion(ctx, { note, reply: note })
        } catch (err) {
          return {
            ok: false as const,
            error: `Couldn't save the version — retry previewing: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`,
          }
        }
        const { versionNo, artifact, durationClamped } = snap
        if (artifact.kind !== "code") {
          return { ok: false as const, error: "Snapshot failed — retry previewing." }
        }
        return {
          ok: true as const,
          version: versionNo,
          canvas: { width: artifact.width, height: artifact.height, fps: artifact.fps, durationInFrames: artifact.durationInFrames },
          ...(durationClamped
            ? { notice: "Timeline clamped to the 15-second maximum." }
            : {}),
          artifact,
        }
      },
    }),

    render_video: tool({
      description:
        "Prepare an export render of the current validated composition. The actual encode runs in the browser exporter; " +
        "this tool validates readiness and returns the exact canvas + version to render. " +
        "Use it when the user asks to export/download/render. Do NOT use it for previews (use preview_composition).",
      inputSchema: z.object({}),
      execute: async () => {
        const code = await readFileContent(ctx, COMPOSITION_PATH)
        const blocking = blockingIssues(lintComposition(code))
        if (blocking.length > 0) {
          return {
            ok: false as const,
            blocking: blocking.map((i) => `[${i.code}] ${i.message}`),
            error: `Cannot render: fix blocking errors first: ${blocking.map((i) => i.message).join("; ").slice(0, 400)}`,
          }
        }
        let snap: Awaited<ReturnType<typeof snapshotVersion>>
        try {
          snap = await snapshotVersion(ctx, { note: "Render snapshot" })
        } catch (err) {
          return {
            ok: false as const,
            error: `Couldn't save the version — retry: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`,
          }
        }
        const { versionNo, artifact, durationClamped } = snap
        if (artifact.kind !== "code") {
          return { ok: false as const, error: "Snapshot failed — retry." }
        }
        return {
          ok: true as const,
          version: versionNo,
          canvas: { width: artifact.width, height: artifact.height, fps: artifact.fps, durationInFrames: artifact.durationInFrames },
          ...(durationClamped
            ? { notice: "Timeline clamped to the 15-second maximum." }
            : {}),
          message: "Ready to render — the browser exporter encodes this version.",
        }
      },
    }),

    get_errors: tool({
      description:
        "Get the latest real errors: static lint findings plus the last render/compile errors reported by the browser player. " +
        "Use it when something fails, before guessing at a fix. Returns empty when there is nothing to fix.",
      inputSchema: z.object({}),
      execute: async () => {
        const code = await readFileContent(ctx, COMPOSITION_PATH)
        const lint = lintComposition(code).map((i) => `[${i.severity}:${i.code}] ${i.message}`)
        const render = (await latestRenderErrors(ctx)).slice(0, 12)
        return { ok: true as const, lint: lint.slice(0, 12), render }
      },
    }),

    get_logs: tool({
      description:
        "Get recent project activity: the last versions with their notes and replies, plus recorded style notes. " +
        "Use it to recall what was already tried or decided earlier in this project. Advisory context only — the files are the truth, not this log.",
      inputSchema: z.object({}),
      execute: async () => {
        const proj = await requireProject(ctx)
        const vers = await ctx.db
          .select({
            versionNo: versions.versionNo,
            note: versions.note,
            reply: versions.reply,
          })
          .from(versions)
          .where(eq(versions.projectId, ctx.projectId))
          .orderBy(desc(versions.versionNo))
          .limit(5)
          .all()
        return {
          ok: true as const,
          project: `${proj.name} (${proj.status})`,
          ...(proj.vibe ? { vibe: proj.vibe } : {}),
          recentVersions: vers.map((v) => ({
            v: v.versionNo,
            ...(v.note ? { note: v.note.slice(0, 200) } : {}),
            ...(v.reply ? { reply: v.reply.slice(0, 200) } : {}),
          })),
        }
      },
    }),

    inspect_render_error: tool({
      description:
        "Inspect the most recent browser render error in detail (message + affected version). " +
        "Use it as the entry point of the error-recovery loop: inspect_render_error → read_file → edit_file → validate_composition → preview_composition.",
      inputSchema: z.object({}),
      execute: async () => {
        const errors = await latestRenderErrors(ctx)
        if (errors.length === 0) return { ok: true as const, errors: [], message: "No render errors reported." }
        return { ok: true as const, errors: errors.slice(0, 6) }
      },
    }),

    search_assets: tool({
      description:
        "List media assets attached to this project (reference images, uploads). Use it to discover what the user already provided " +
        "before asking for files. For stock/generic media questions, say what is attached rather than inventing assets.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await listAttachments(ctx)
        return {
          ok: true as const,
          assets: rows.map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.size })),
        }
      },
    }),

    import_asset: tool({
      description:
        "Reference an already-attached project asset inside the composition. Returns the asset's id, name and mime plus " +
        "the exact snippet pattern to load it (uploaded assets are served at /api/uploads/<id>). " +
        "Use it when the user says 'use this image in the background'. Do NOT use it for assets that are not attached — ask the user to upload first via ask_user.",
      inputSchema: z.object({
        assetId: z.string().describe("Asset id from search_assets"),
        usage: z.string().max(300).optional().describe("How it will be used, e.g. background image"),
      }),
      execute: async ({ assetId, usage }) => {
        const rows = await listAttachments(ctx)
        const found = rows.find((a) => a.id === assetId)
        if (!found) {
          return { ok: false as const, assetId, error: `Asset not found: ${assetId}. Call search_assets for valid ids.` }
        }
        return {
          ok: true as const,
          id: found.id,
          name: found.name,
          mime: found.mime,
          url: `/api/uploads/${found.id}`,
          ...(usage ? { usage } : {}),
          snippet: `<Img src="/api/uploads/${found.id}" /> // import {Img} from "remotion"`,
        }
      },
    }),

    inspect_asset: tool({
      description: "Inspect one attached asset's metadata (name, mime, size, url).",
      inputSchema: z.object({ assetId: z.string() }),
      execute: async ({ assetId }) => {
        const rows = await listAttachments(ctx)
        const found = rows.find((a) => a.id === assetId)
        if (!found) {
          return { ok: false as const, assetId, error: `Asset not found: ${assetId}` }
        }
        return { ok: true as const, id: found.id, name: found.name, mime: found.mime, size: found.size, url: `/api/uploads/${found.id}` }
      },
    }),

    remove_asset: tool({
      description:
        "Detach an asset reference note — files themselves are managed in the project settings. Requires confirmed:true. " +
        "Rarely needed; prefer leaving assets attached.",
      inputSchema: z.object({
        assetId: z.string(),
        confirmed: z.boolean().default(false),
      }),
      execute: async ({ assetId, confirmed }) => {
        if (!confirmed) {
          return { ok: true as const, removed: false, message: "Confirmation required — re-call with confirmed:true after asking the user." }
        }
        return { ok: true as const, removed: false, assetId, message: "Asset binaries are immutable; remove the <Img>/<Video> reference with edit_file instead." }
      },
    }),

    ask_user: tool({
      description:
        "Ask the user a clarifying question when you genuinely cannot proceed without an answer: " +
        "a vague brief with no actionable subject ('make something cool', 'surprise me'), a missing asset, " +
        "an ambiguous target, or a destructive choice. Returns the question to the chat — the user's reply arrives as the next message. " +
        "Prefer asking over guessing blindly on an empty brief. Do NOT use it for decisions you can reasonably make yourself (styling, color, pacing, mood around a clear subject). At most one question per call; never block a task that can proceed.",
      inputSchema: z.object({
        question: z.string().min(4).max(300).describe("One short question, max ~15 words"),
        options: z.array(z.string().min(1).max(60)).min(2).max(4).describe("2-4 genuinely different answers"),
      }),
      execute: async ({ question, options }) => ({
        ok: true as const,
        asked: true,
        question,
        options,
        message: "Question sent to the user. Stop here and wait for their reply before continuing that subtask.",
      }),
    }),

    request_approval: tool({
      description:
        "Request explicit approval before a destructive or costly action (deleting files, rendering a final export). " +
        "State exactly what will happen. Stop and wait for the user's reply after calling it.",
      inputSchema: z.object({
        action: z.string().min(4).max(300).describe("Exactly what you want approval for"),
        consequence: z.string().max(300).optional().describe("What happens if approved"),
      }),
      execute: async ({ action, consequence }) => ({
        ok: true as const,
        approvalRequested: true,
        action,
        ...(consequence ? { consequence } : {}),
        message: "Approval requested. Stop here and wait for the user's reply.",
      }),
    }),
  };
  return withLogging(ctx.projectId, tools);
}

/**
 * Universal observability + failure containment: every tool call logs
 * duration + outcome, every failure logs server-side — and NO expected
 * failure ever kills the turn with a throw. A thrown tool error used to
 * surface in chat as "Updating the animation: An error occurred" and
 * could abort the whole run; now the model gets a structured
 * {ok:false, error} result it can repair from, and the loop survives.
 * Only the ownership boundary (ProjectAccessError) still throws.
 */
function withLogging<T extends Record<string, { execute?: unknown }>>(
  projectId: string,
  tools: T
): T {
  for (const [name, t] of Object.entries(tools)) {
    const orig = (t as { execute?: (...args: never[]) => Promise<unknown> }).execute
    if (typeof orig !== "function") continue
    ;(t as { execute: (...args: never[]) => Promise<unknown> }).execute = (async (
      ...args: never[]
    ) => {
      const t0 = Date.now()
      try {
        const out = await orig(...args)
        console.log(
          JSON.stringify({ msg: "tool", tool: name, ms: Date.now() - t0, ok: true, projectId })
        )
        return out
      } catch (err) {
        console.error(
          JSON.stringify({
            msg: "tool-error",
            tool: name,
            ms: Date.now() - t0,
            projectId,
            err: String(err)?.slice(0, 800),
          })
        )
        if (err instanceof ProjectAccessError) throw err
        return {
          ok: false as const,
          error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        }
      }
    }) as (...args: never[]) => Promise<unknown>
  }
  return tools
}

export type AgentTools = ReturnType<typeof buildTools>
