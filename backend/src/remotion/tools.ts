import { tool, type ToolSet } from "ai"
import { z } from "zod"
import { findSkill, SKILL_IDS } from "./skills.generated"
import type { Chat } from "../chat"
import type { CompositionStore } from "./store"
import { checkComposition, constraintSolve, dependencyResolve, preValidatePlan } from "./validate"
import { optimizeAsset, suggestAssets, suggestFonts } from "./assets"
import {
  accessibilityAudit,
  brandLearn,
  decisionMake,
  designAnalyze,
  intentDeepAnalyze,
  intentQuestionnaire,
  performanceProfile,
  preferenceApply,
} from "./intelligence"
import { goldenStarter } from "./templates"
import { cacheGet, cacheSet, predictTools, TTL } from "./cache"
import {
  backgroundGenerate,
  copyGenerate,
  iconGenerate,
  musicSearch,
  soundEffects,
  subtitleGenerate,
  voiceoverGenerate,
} from "./content"
import { cdnPublish, exportBundle, exportPreset, EXPORT_PRESETS, thumbnailSpec, watermarkSpec } from "./export"
import { feedbackRequest, shareCreate, teamInvite } from "./collab"
import { threeCameraPath, threeModelAnimate, threeSceneCreate } from "./motion3d"
import { presetForBeat, presetSnippet, textAnimationSnippet } from "./motion-library"
import { LayoutEngine, buildCompositionHints } from "./layout-engine"
import type { ElementType, LayoutStrategy } from "./layout-engine"
import { DISPLAY_FACES } from "./type"

/**
 * What the browser actually measured on the real render, if it reported since
 * the current version was published. Static heuristics cannot see a headline
 * sitting on top of a logo; this can. Removed once consumed, so a stale
 * measurement never describes a newer cut.
 */
export interface Measured {
  frame: number
  findings: string[]
}

/** Clips cap at 30s. Composition fps and size are fixed by the canvas. */
export const CANVAS = { width: 1920, height: 1080, fps: 30, maxFrames: 900 } as const

const FRAME = `frame numbers, 0-indexed, ${CANVAS.fps}fps, canvas ${CANVAS.width}x${CANVAS.height}, max ${CANVAS.maxFrames} frames (30s)`

/** Studio palettes per tone — background, ink, accent(s). Three hues max. */
function paletteForTone(tone: string): { bg: string; ink: string; accents: string[]; note: string } {
  const t = tone.toLowerCase()
  if (/energetic|hype|bold|sport/.test(t))
    return { bg: "#101014", ink: "#F4F2EC", accents: ["#FF5A5A", "#5AC8FA"], note: "Fast entrances 24-40f, overshoot 1.06-1.12." }
  if (/playful|fun|quirky/.test(t))
    return { bg: "#1B1035", ink: "#F4F2EC", accents: ["#FF7AD9", "#C6F24E"], note: "Bouncy springs damping 10-14, stagger 2-3f." }
  if (/minimal/.test(t))
    return { bg: "#F4F2EC", ink: "#141414", accents: ["#E4572E"], note: "Long holds, mask reveals, no glow." }
  if (/elegant|prestige|luxury|editorial|serif/.test(t))
    return { bg: "#111214", ink: "#EFE9DC", accents: ["#D8B56B"], note: "Slow settles damping 24+, fades earned and paired with push." }
  if (/tech|futur|saas|data/.test(t))
    return { bg: "#0B0E14", ink: "#E8EEF7", accents: ["#5AC8FA"], note: "Geometric type, grid decor, tight springs." }
  return { bg: "#0B0C10", ink: "#F2F3F7", accents: ["#FFB340"], note: "Cinematic default: vignette + slow settles." }
}

/** Beat → preset numbers for creative_direct (one call, no preset round-trips). */
function pickPreset(beat: string): { preset: string; easing: string; duration: number } {
  const { id, preset } = presetForBeat(beat)
  return { preset: id, easing: preset.easing, duration: preset.duration }
}

/**
 * Builds the tool set for one conversation.
 *
 * Every tool is scoped to a single composition, so none of them take a project
 * or file id — there is exactly one cut per conversation, and making the model
 * carry an id it could get wrong was a reliable source of mistakes.
 */
export function buildTools(store: CompositionStore, agent?: Chat): ToolSet {
  // Template parity (previouslyUsedSkills): a skill loaded twice in one turn
  // costs a second paced model call AND duplicates ~3k tokens of context.
  // The second load short-circuits with a pointer instead.
  const loadedThisTurn = new Set<string>()
  return {
    load_skill: tool({
      description:
        "Load the Remotion documentation for one topic. This is the reference for " +
        "the exact Remotion version installed here — the API moves, so working from " +
        "memory produces plausible code that does not render. Load a skill BEFORE " +
        "writing the code it covers, not when something is already broken. Design " +
        "skills (taste, not API): creative-direction, kinetic-typography, " +
        "cinematic-motion, layout-composition, charts-data-viz, spring-physics, " +
        "messaging-chat-ui, social-media-formats — load creative-direction once per " +
        "new full-path cut, the others when the beat needs them (see its §5 routing " +
        "table). Example skills (complete working cuts to imitate, never copy " +
        "verbatim): example-typewriter-highlight, example-word-carousel, " +
        "example-text-rotation, example-histogram, example-gold-price-chart, " +
        "example-progress-bar, example-animated-shapes, example-falling-spheres, " +
        "example-lottie. API skills: " +
        "timing, sequencing, compositions. Then as needed: animations, " +
        "transitions, effects, shapes, audio, images, video, fonts, text, parameters, " +
        "multi-scene-video, spring, interpolate, easing.",
      inputSchema: z.object({
        id: z.enum(SKILL_IDS as [string, ...string[]]).describe("The skill id to load."),
      }),
      execute: async ({ id }) => {
        const key = id.trim().toLowerCase()
        if (loadedThisTurn.has(key)) {
          return {
            id,
            alreadyLoaded: true,
            note: "Already loaded this turn — the content is in context above. Use it, do not reload it.",
          }
        }
        loadedThisTurn.add(key)
        const skill = findSkill(id)
        if (!skill) {
          return { error: `Unknown skill "${id}". Available: ${SKILL_IDS.join(", ")}` }
        }
        // A big skill still fits comfortably; trim the trailing sections so one
        // call cannot swamp the context.
        return { id: skill.id, content: skill.content.slice(0, 24_000) }
      },
    }),

    get_canvas: tool({
      description:
        "The render canvas: dimensions, fps, and the frame budget. Call this before " +
        "planning so every frame number you plan is real.",
      inputSchema: z.object({}),
      execute: async () => ({
        ...CANVAS,
        currentVersion: store.current().version,
        hasComposition: store.current().code.length > 0,
      }),
    }),

    plan_motion: tool({
      description:
        "Record the motion plan BEFORE writing code. The plan is a motion " +
        "specification, not a to-do list: every beat names real frame numbers, the " +
        "properties that change, and the easing. The player draws it as a timeline, " +
        "so the user sees the shape of the cut before it exists. Required once per " +
        "new cut, and again only if the direction changes.",
      inputSchema: z.object({
        title: z.string().describe("Short name for the cut, e.g. 'Cursor reveal'."),
        intent: z
          .string()
          .describe("What the cut must achieve in one or two sentences."),
        beats: z
          .array(
            z.object({
              from: z.number().int().min(0).describe("Inclusive start frame."),
              to: z.number().int().min(1).describe("Exclusive end frame."),
              what: z
                .string()
                .describe(
                  "What happens and how. Name the props and easing: " +
                    "'translateX 0→-420, Easing.bezier(0.16,1,0.3,1)'."
                ),
            })
          )
          .min(2)
          .describe("The beats in order. At least two."),
        ending: z.string().describe("The final image the cut resolves to."),
      }),
      execute: async ({ title, intent, beats, ending }) => {
        const sorted = [...beats].sort((a, b) => a.from - b.from)
        const last = sorted[sorted.length - 1]
        const plan = { title, intent, beats: sorted, ending }

        if (last && last.to > CANVAS.maxFrames) {
          return {
            ok: false,
            error: `The last beat ends at frame ${last.to}, past the ${CANVAS.maxFrames}-frame limit. Tighten the timing.`,
            plan,
          }
        }
        store.setPlan(plan)
        return { ok: true, plan }
      },
    }),

    read_file: tool({
      description:
        "Read the current composition source. Read before you edit — an edit whose " +
        "find string is guessed will not apply.",
      inputSchema: z.object({}),
      execute: async () => {
        const { code, plan, version } = store.current()
        return {
          version,
          plan,
          lines: code ? code.split("\n").length : 0,
          code: code || "(no composition yet)",
        }
      },
    }),

    write_composition: tool({
      description:
        "Write the WHOLE composition in one call. This is a single file, so build " +
        "the complete scene here: every import, every component, every beat, the " +
        "default export. Do NOT dribble it out in chunks — a scene written in " +
        "fragments comes out thin, because each piece is written without the whole " +
        "in view. Use edit_file for small changes to a composition that already exists. " +
        "This tool is the ONLY place composition code may ever appear — never write " +
        "TSX, imports, or code fences in chat text. If you catch yourself typing code " +
        "outside this call, stop and put it here instead.",
      inputSchema: z.object({
        code: z
          .string()
          .describe("The complete TSX source of the composition, imports included."),
      }),
      execute: async ({ code }) => {
        // 50x fix: mechanical repairs run INLINE on every write, so a turn
        // that needed write → validate → auto_fix_code → rewrite (4 paced
        // model calls, ~48s) now lands in one call. Repairs are the same
        // pure helpers auto_fix_code uses — results can never drift.
        const repaired = autoRepairInline(code)
        const checks = checkComposition(repaired.code)
        const errors = checks.filter((c) => c.level === "error")
        // Refuse a file that cannot run, with the reason. The alternative is
        // storing broken source and discovering it at render time.
        if (errors.length > 0) {
          return {
            ok: false,
            rejected: true,
            errors: errors.map((e) => e.message),
            warnings: checks.filter((c) => c.level === "warn").map((w) => w.message),
            ...(repaired.applied.length > 0 ? { autoRepaired: repaired.applied } : {}),
          }
        }
        const n = store.write(repaired.code, { bumpVersion: true })
        return {
          ok: true,
          version: n,
          warnings: checks.filter((c) => c.level === "warn").map((w) => w.message),
          ...(repaired.applied.length > 0 ? { autoRepaired: repaired.applied } : {}),
        }
      },
    }),

    edit_file: tool({
      description:
        "Change a small, specific part of the existing composition. One note touches " +
        "one thing. Each op's `find` must be copied EXACTLY from read_file, " +
        "including indentation — it is a literal string match. When an op misses, " +
        "the result names the closest real lines (suggestion): retry from those " +
        "instead of re-guessing. Use write_composition " +
        "instead only for a genuine rewrite. For multi-part changes (rename " +
        "across the file, icon swaps, several small fixes) use bulk_edit.",
      inputSchema: z.object({
        ops: z
          .array(
            z.object({
              find: z.string().describe("Exact existing text to replace."),
              replace: z.string().describe("What it becomes. Empty string deletes it."),
            })
          )
          .min(1)
          .describe("Applied in order."),
      }),
      execute: async ({ ops }) => applyEditOps(store, ops, { allowPartial: true }),
    }),

    bulk_edit: tool({
      description:
        "Apply a batch of related edits to the composition in one call — " +
        "renames, icon swaps, retiming several beats, fixing the same mistake " +
        "in many places. Each op's `find` is an exact literal match from " +
        "read_file; ops apply in order, the whole batch validates once, and " +
        "the version bumps once. Any op may match MANY occurrences to " +
        "rename/replace across the file (that is the difference from edit_file, " +
        "which requires a unique match). Atomic: one missed op saves nothing, " +
        "but the failure names the closest real lines (suggestion) — retry the " +
        "batch from those. Prefer this over five sequential " +
        "edit_file calls.",
      inputSchema: z.object({
        ops: z
          .array(
            z.object({
              find: z.string().describe("Exact existing text to replace."),
              replace: z.string().describe("What it becomes. Empty string deletes it."),
              all: z
                .boolean()
                .default(false)
                .describe("Replace every occurrence, not just a unique match."),
            })
          )
          .min(1)
          .max(20)
          .describe("Applied in order."),
      }),
      execute: async ({ ops }) => applyEditOps(store, ops, { allowPartial: false }),
    }),

    validate_composition: tool({
      description:
        "Run the correctness checks over the current source. Call after any change. " +
        "Returns errors that would stop it rendering and warnings about things that " +
        "usually mean a blank frame or a non-deterministic render. When the player " +
        "already failed THIS version in the browser, that verdict comes back as " +
        "browserError — fix it first; the static results below it are secondary.",
      inputSchema: z.object({}),
      execute: async () => {
        const { code, version } = store.current()
        if (!code) return { ok: false, errors: ["No composition to validate."], warnings: [] }
        const checks = checkComposition(code)
        const browserFailure = currentBrowserFailure(store, agent)
        return {
          ok: !checks.some((c) => c.level === "error"),
          version,
          errors: checks.filter((c) => c.level === "error").map((c) => c.message),
          warnings: checks.filter((c) => c.level === "warn").map((c) => c.message),
          ...(browserFailure
            ? {
                browserError: {
                  ...(browserFailure.phase ? { phase: browserFailure.phase } : {}),
                  ...(browserFailure.message ? { message: browserFailure.message } : {}),
                  ...(browserFailure.line !== undefined ? { line: browserFailure.line } : {}),
                  fixHint: browserFixHint(browserFailure.message ?? ""),
                },
                note: "The player failed THIS version in the browser — fix browserError first; static results below are secondary.",
              }
            : {}),
        }
      },
    }),

    preview_composition: tool({
      description:
        "Publish the current composition to the player. Only call this once the " +
        "source validates. ok:true means PUBLISHED, not rendering — the browser " +
        "still has to compile and mount the cut, so always call " +
        "read_render_report next and never tell the user it works before a " +
        "verified report.",
      inputSchema: z.object({}),
      execute: async () => {
        const { code, version, plan } = store.current()
        if (!code) {
          return { ok: false, error: "Nothing to preview — write the composition first." }
        }
        const checks = checkComposition(code)
        const errors = checks.filter((c) => c.level === "error")
        if (errors.length > 0) {
          return {
            ok: false,
            error: "Not previewed — the source has errors.",
            errors: errors.map((e) => e.message),
          }
        }
        // A publish is what makes the version the one on stage. It bumps only
        // when the code actually changed, so repeated previews are free.
        const current = store.current().version
        const published = code.length > 0 ? current : version
        return {
          ok: true,
          version: published,
          plan,
          bytes: code.length,
          verified: false,
          next: "Call read_render_report — it waits for the browser. Only a verified report means the cut renders.",
        }
      },
    }),

    read_render_report: tool({
      description:
        "Read what the browser actually rendered for a published version. Call " +
        "this right after preview_composition — it waits up to ~24s for the " +
        "browser to compile, mount and render the cut (waiting costs no model calls). " +
        "verified means it mounted AND rendered in the player's browser — " +
        "a compile-only report never verifies. failed carries the exact browser " +
        "error — fix it and re-preview. pending means the browser stayed silent: " +
        "end the turn saying the render is unconfirmed.",
      inputSchema: z.object({
        version: z
          .number()
          .int()
          .optional()
          .describe("Version to verify. Defaults to the current version."),
      }),
      execute: async ({ version }) => {
        const want = version ?? store.current().version
        const deadline = Date.now() + 24_000
        for (;;) {
          const report = agent?.state?.audit
          if (report && report.version >= want) {
            if (report.ok && (report as { phase?: string }).phase !== "compile") {
              return {
                status: "verified",
                version: report.version,
                ...(report.message ? { detail: report.message } : {}),
                findings: report.findings,
                hint:
                  report.findings.length > 0
                    ? "Renders. The findings describe real measured pixels — fix them only if cheap, then re-verify."
                    : "Renders. This report is the only basis for telling the user it works.",
              }
            }
            if (!report.ok) {
              const message = report.message ?? "The browser failed to render this version."
              return {
                status: "failed",
                version: report.version,
                message,
                findings: report.findings,
                fixHint: browserFixHint(message),
              }
            }
            // Compile succeeded but nothing has mounted yet — keep waiting
            // for the mount/runtime/layout report instead of verifying early.
          }
          if (Date.now() >= deadline) {
            return {
              status: "pending",
              version: want,
              hint: "No browser render report yet — the tab may be closed or still compiling. End the turn saying the render is UNCONFIRMED; never claim it works.",
            }
          }
          await new Promise((r) => setTimeout(r, 2000))
        }
      },
    }),

    review_motion: tool({
      description:
        "Critique the cut as a motion designer. Call after a preview, then act on findings. " +
        "Detects: linear-only timing, opacity-only motion, no settle, no stagger, " +
        "overlapping elements, off-canvas overflow, single-beat plans.",
      inputSchema: z.object({
        focus: z
          .string()
          .optional()
          .describe("Optional: a specific concern, e.g. 'the middle beat feels flat'."),
      }),
      execute: async ({ focus }) => {
        const { code, plan, version } = store.current()
        if (!code) return { error: "Nothing to review yet." }

        const findings: string[] = []
        const frames = (code.match(/interpolate\(\s*frame\s*,\s*\[[^\]]*\]/g) ?? []).length
        const springs = (code.match(/\bspring\(/g) ?? []).length
        const easings = (code.match(/Easing\./g) ?? []).length
        const transforms = (code.match(/translate[XY]|scale|rotate|skew/gi) ?? []).length
        const opacities = (code.match(/opacity/gi) ?? []).length
        const staggers = (code.match(/delay|offset|stagger/i) ?? []).length
        const maps = (code.match(/\.map\(/g) ?? []).length

        if (frames > 0 && easings === 0) {
          findings.push(
            "Every interpolation uses the default linear curve. Linear motion reads as robotic — " +
              "give each move an Easing.bezier(...) or a spring()."
          )
        }
        if (transforms === 0 && opacities > 0) {
          findings.push(
            "The cut animates opacity only. Fading is the weakest kind of change — add " +
              "translate, scale or rotate so elements have direction."
          )
        }
        if (opacities > 2 && transforms < 2) {
          findings.push(
            "Opacity is doing most of the work. Layer at least one element that moves in " +
              "space, so the frame has depth rather than a fade."
          )
        }
        if (springs === 0) {
          findings.push(
            "Nothing settles. At least one element should arrive with a spring() or an " +
              "overshoot, so the cut has a landing instead of easing to a stop."
          )
        }
        if (staggers === 0 && maps > 0) {
          findings.push(
            "A list maps over items with no stagger. Offsetting each item's start frame " +
              "(e.g. index * 3) turns a block into a sequence."
          )
        }
        if (plan && plan.beats.length === 1) {
          findings.push(
            "The plan has a single beat, so one idea is stretched to fill the clip. " +
              "Real pieces have a change of state — add a second beat with a different idea."
          )
        }

        // Detect overlapping absolute-positioned elements at the same spot
        const posRe = /position:\s*['"]absolute['"]/g
        const seen = new Map<string, number>()
        let m: RegExpExecArray | null
        while ((m = posRe.exec(code)) !== null) {
          const window = code.slice(m.index, m.index + 500)
          const left = /left:\s*(?:"([^"]+)"|'([^']+)'|(-?\d+(?:\.\d+)?))/.exec(window)?.[0] ?? "?"
          const top = /top:\s*(?:"([^"]+)"|'([^']+)'|(-?\d+(?:\.\d+)?))/.exec(window)?.[0] ?? "?"
          const key = `${left} | ${top}`
          seen.set(key, (seen.get(key) ?? 0) + 1)
        }
        const dupe = [...seen.entries()].find(([, n]) => n >= 2)
        if (dupe) {
          findings.push(
            `Two absolutely-positioned elements share the spot (${dupe[0]}) — they paint on top of each other. ` +
              `Stack text in one flex column with gap, or offset one deliberately.`
          )
        }

        // Detect translate ranges that push elements off-canvas
        for (const m of code.matchAll(/interpolate\(\s*frame\s*,\s*\[([^\]]*)\]\s*,\s*\[([^\]]*)\]/g)) {
          const outs = (m[2] ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
          if (outs.length === 0) continue
          const peak = Math.max(...outs.map((n) => Math.abs(n)))
          const ctx = code.slice(Math.max(0, (m.index ?? 0) - 220), (m.index ?? 0) + 120)
          if (/translate/i.test(ctx) && peak > 1920) {
            findings.push(
              `translate range reaches ${peak}px — past the 1920px canvas edge. ` +
                `Only fix if the element never appears on screen.`
            )
            break
          }
        }

        if (findings.length === 0) {
          findings.push(
            "Nothing structural is wrong. Push on the ending: does the last frame resolve, " +
              "or does it just stop? A cut that ends mid-motion feels unfinished."
          )
        }

        return { version, focus: focus ?? "general", findings }
      },
    }),

    list_versions: tool({
      description:
        "List saved versions of the composition, newest last, with their frame counts. " +
        "Use it to answer 'what did you change' or to pick something to restore.",
      inputSchema: z.object({}),
      execute: async () => {
        const versions = store.versions()
        return {
          current: store.current().version,
          versions: versions.map((v) => ({
            n: v.n,
            lines: v.code.split("\n").length,
            bytes: v.code.length,
            title: v.plan?.title ?? null,
          })),
        }
      },
    }),

    restore_version: tool({
      description:
        "Roll the composition back to an earlier saved version. Restoring does not " +
        "delete anything — later versions stay in the list and can be restored again.",
      inputSchema: z.object({ version: z.number().int().min(1) }),
      execute: async ({ version }) => {
        const code = store.restore(version)
        if (!code) {
          return { ok: false, error: `No saved version ${version}.` }
        }
        const n = store.write(code, { bumpVersion: true })
        return { ok: true, restoredFrom: version, newVersion: n }
      },
    }),

    pre_validate_plan: tool({
      description:
        "Check a motion plan's feasibility BEFORE writing code: frame windows, " +
        "duration budget, overlaps/gaps, and whether each beat names real props " +
        "and easing. Call with the same beats you would pass to plan_motion.",
      inputSchema: z.object({
        beats: z
          .array(
            z.object({
              from: z.number().int().min(0),
              to: z.number().int().min(1),
              what: z.string(),
            })
          )
          .min(1),
        totalFrames: z.number().int().min(1).max(CANVAS.maxFrames).optional(),
      }),
      execute: async ({ beats, totalFrames }) => {
        const check = preValidatePlan(beats, CANVAS.maxFrames)
        const solved = constraintSolve(totalFrames ?? beats.at(-1)?.to ?? 0, beats, CANVAS.maxFrames)
        return { ...check, budget: solved.note, suggestedBeats: solved.beats }
      },
    }),

    constraint_solve: tool({
      description:
        "Solve timing/duration/frame-budget constraints: total frames plus beats. " +
        "Returns a valid retiming or an impossibility report.",
      inputSchema: z.object({
        totalFrames: z.number().int().min(1),
        beats: z.array(
          z.object({ from: z.number().int().min(0), to: z.number().int().min(1), what: z.string() })
        ),
      }),
      execute: async ({ totalFrames, beats }) => constraintSolve(totalFrames, beats, CANVAS.maxFrames),
    }),

    dependency_resolve: tool({
      description:
        "Map imports to the browser scope before writing code. Reports which " +
        "sources are available and what to use instead for the rest.",
      inputSchema: z.object({ imports: z.array(z.string()).min(1) }),
      execute: async ({ imports }) => dependencyResolve(imports),
    }),

    auto_fix_code: tool({
      description:
        "Apply confidence-scored repairs to the current composition, then re-validate. " +
        "High-confidence fixes (Math.random→random with import, page-default " +
        "font→Fonts, lucide named imports→Lucide namespace with correct alias handling, " +
        "linear interpolate→Easing.bezier, missing frame binding, missing default export) " +
        "apply automatically. Pass it EITHER validate_composition errors OR a browser " +
        "failure message from read_render_report — it understands both. Medium/low-confidence " +
        "findings (overflow, z-conflict, missing spring) return with a preview for approval. " +
        "A genuine rewrite still goes through write_composition.",
      inputSchema: z.object({
        errors: z.array(z.string()).min(1).describe("Error messages from validate_composition, or a browser failure message from read_render_report."),
      }),
      execute: async ({ errors }) => {
        let code = store.current().code
        if (!code) return { ok: false, error: "No composition to fix — use write_composition." }
        interface Fix {
          issue: string
          fix: string
          confidence: "high" | "medium" | "low"
          preview: { before: string; after: string }
        }
        const applied: Fix[] = []
        const suggested: Fix[] = []

        // --- high-confidence: objective errors, safe to apply ----------------

        // Fix: only replace Math.random() in non-comment, non-string contexts
        // Bug fix (Issue 8): the previous regex replaced Math.random() inside
        // comments, which changed comment text without fixing the actual error.
        {
          const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
            .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
            .replace(/`(?:\\.|[^`\\])*`/g, (m) => " ".repeat(m.length))
            .replace(/"(?:\\.|[^"\\])*"/g, (m) => " ".repeat(m.length))
            .replace(/'(?:\\.|[^'\\])*'/g, (m) => " ".repeat(m.length))
          if (/Math\.random\s*\(/.test(stripped)) {
            // Apply the replacement only to positions that are in the stripped version
            const randomRe = /Math\.random\s*\(\s*\)/g
            let newCode = ""
            let lastIdx = 0
            let match: RegExpExecArray | null
            let count = 0
            while ((match = randomRe.exec(code)) !== null) {
              // Only replace if the same position in stripped is not whitespace-padded
              const atPos = stripped.slice(match.index, match.index + match[0].length)
              if (!/^\s+$/.test(atPos)) {
                newCode += code.slice(lastIdx, match.index) + "random(null)"
                lastIdx = match.index + match[0].length
                count++
              }
            }
            if (count > 0) {
              code = newCode + code.slice(lastIdx)
              code = ensureRandomImport(code).code
              applied.push({
                issue: `Non-deterministic Math.random() (${count} occurrence${count > 1 ? "s" : ""})`,
                fix: "Replaced with Remotion's seeded random(null), import added from remotion",
                confidence: "high",
                preview: { before: "Math.random()", after: "random(null)" },
              })
            }
          }
        }

        {
          const { code: next, names } = applyLucideNamespace(code)
          if (names.length > 0) {
            code = next
            applied.push({
              issue: `Named lucide-react import(s): ${names.join(", ")}`,
              fix: "Converted to the Lucide namespace the player scope provides (<Lucide.Name/>) — named imports throw at mount. Alias mappings (import { X as Y }) handled correctly.",
              confidence: "high",
              preview: {
                before: `import { ${names[0]} } from "lucide-react"`,
                after: `import * as Lucide from "lucide-react" + <Lucide.${names[0]} />`,
              },
            })
          }
        }

        // Fix: replace ALL occurrences of page-default fonts, not just the first
        // Bug fix (Issue 8): previous code used a single .exec() + replace on m[0],
        // so only the first occurrence was fixed.
        {
          const fontRe = /fontFamily:\s*["'](system-ui|sans-serif|serif|ui-sans-serif|Arial|Helvetica|Inter|Roboto)["']/gi
          const matches = [...code.matchAll(fontRe)]
          if (matches.length > 0) {
            const face = DISPLAY_FACES[0]
            code = code.replace(fontRe, `fontFamily: Fonts.${face}.family`)
            applied.push({
              issue: `Page-default fontFamily (${matches.length} occurrence${matches.length > 1 ? "s" : ""})`,
              fix: `Replaced all with Fonts.${face}.family`,
              confidence: "high",
              preview: { before: matches[0]![0], after: `fontFamily: Fonts.${face}.family` },
            })
          }
        }

        {
          const { upgraded, count } = applyNakedEasing(code)
          if (count > 0) {
            code = ensureEasingImport(upgraded).code
            applied.push({
              issue: `${count} linear interpolate() call(s)`,
              fix: "Added Easing.bezier(0.16, 1, 0.3, 1) with clamped extrapolation",
              confidence: "high",
              preview: {
                before: "interpolate(frame, [a, b], [c, d])",
                after: "interpolate(frame, [a, b], [c, d], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: \"clamp\", extrapolateRight: \"clamp\" })",
              },
            })
          }
        }

        // Structural fix: missing frame binding — auto-add useCurrentFrame()
        // Bug fix (Issue 8): previously only surfaced as "suggested", never applied.
        // This is mechanical and safe: useCurrentFrame() is always the right fix.
        {
          const needsFrame =
            /interpolate\(\s*frame\b/.test(code) &&
            !/useCurrentFrame\(\)/.test(code) &&
            !/(?:const|let|var)\s+frame\b/.test(code)
          if (needsFrame) {
            // Insert `const frame = useCurrentFrame();` after the first `{` of
            // the component function body. Match the first function/arrow body opening.
            const bodyOpen = code.search(/(?:function\s+\w+[^{]*|=>\s*)\{/)
            if (bodyOpen !== -1) {
              const insertAt = code.indexOf("{", bodyOpen) + 1
              const indent = "  "
              const insertion = `\n${indent}const frame = useCurrentFrame();`
              code = code.slice(0, insertAt) + insertion + code.slice(insertAt)
              // Ensure useCurrentFrame is imported from remotion
              if (!/useCurrentFrame/.test(code.split(insertion)[0] ?? "")) {
                const m = /import\s*\{([^}]*)\}\s*from\s*["']remotion["']/.exec(code)
                if (m) {
                  code = code.replace(m[0], `import {${m[1].replace(/\s+$/, "")}, useCurrentFrame } from "remotion"`)
                }
              }
              applied.push({
                issue: "interpolate() reads `frame` but no frame binding exists",
                fix: "Added `const frame = useCurrentFrame();` at the top of the component body",
                confidence: "high",
                preview: { before: "(no frame binding)", after: "const frame = useCurrentFrame();" },
              })
            }
          }
        }

        // Structural fix: missing default export
        // Bug fix (Issue 8): previously only surfaced as "suggested". This is mechanical:
        // find the last top-level function/const that looks like a component.
        {
          if (!/export\s+default\b/.test(code)) {
            const compMatch = [...code.matchAll(/^(?:const|function)\s+([A-Z][A-Za-z0-9_]*)\s*(?:=|{|\()/gm)].pop()
            if (compMatch?.[1]) {
              const name = compMatch[1]
              code = code.trimEnd() + `\n\nexport default ${name};\n`
              applied.push({
                issue: "Missing default export",
                fix: `Appended \`export default ${name};\` — matched the last top-level component`,
                confidence: "high",
                preview: { before: "(no default export)", after: `export default ${name};` },
              })
            } else {
              suggested.push({
                issue: "Missing default export",
                fix: "Append `export default <TopLevelComponent>;` matching the component name",
                confidence: "medium",
                preview: { before: "(no default export)", after: "export default MyCut;" },
              })
            }
          }
        }

        // --- medium/low-confidence: named for approval, never auto-applied ---
        const context = [
          ...errors,
          ...checkComposition(code)
            .filter((c) => c.level === "warn")
            .map((c) => c.message),
        ].join("\n")
        if (/overflow|off-canvas/i.test(context)) {
          suggested.push({
            issue: "Layout overflow",
            fix: "Scale the element down or pull its translate range inside 1920x1080",
            confidence: "medium",
            preview: { before: "translate peak past canvas bounds", after: "range clamped inside the safe margin" },
          })
        }
        if (/z-index|zIndex/i.test(context)) {
          suggested.push({
            issue: "z-index conflict",
            fix: "Separate layers: background=1, content=10, overlays=20, UI=30",
            confidence: "medium",
            preview: { before: "shared zIndex", after: "distinct zIndex per layer" },
          })
        }
        if (/spring|settle|landing/i.test(context) && /\bspring\(/.test(code) === false) {
          suggested.push({
            issue: "Nothing settles",
            fix: "Arrive with spring() or an overshoot preset (load_motion_preset settle)",
            confidence: "low",
            preview: { before: "ease to a stop", after: "spring landing with overshoot" },
          })
        }

        const checks = checkComposition(code)
        const remaining = checks.filter((c) => c.level === "error").map((c) => c.message)
        if (remaining.length > 0) {
          return {
            ok: false,
            applied,
            suggested,
            remaining,
            note: "High-confidence fixes applied but errors remain — fix the rest with edit_file or write_composition.",
          }
        }
        if (applied.length === 0) {
          return {
            ok: false,
            applied,
            suggested,
            remaining,
            note: "No mechanical fix matched — fix manually and call write_composition again.",
          }
        }
        const n = store.write(code, { bumpVersion: true })
        return { ok: true, version: n, applied, suggested }
      },
    }),

    asset_search: tool({
      description:
        "Find a composition-safe image, video, or audio placeholder for the brief. " +
        "Offline catalogue until CDN keys land — returns licensed-source URLs with " +
        "attribution plus the sizing note to use. Confirm licensing before export.",
      inputSchema: z.object({
        query: z.string().describe("What the asset should show, e.g. 'dark product background'."),
        type: z.enum(["image", "video", "audio"]).default("image"),
      }),
      execute: async ({ query, type }) => suggestAssets(query, type),
    }),

    asset_optimize: tool({
      description:
        "Size an asset URL to the 1920x1080 canvas (quality/format) and return " +
        "theoptimized URL plus the Img/staticFile guidance.",
      inputSchema: z.object({
        url: z.string(),
        format: z.enum(["webp", "avif", "mp4", "original"]).default("webp"),
        quality: z.number().int().min(10).max(100).default(80),
      }),
      execute: async ({ url, format, quality }) => optimizeAsset(url, format, quality),
    }),

    font_suggest: tool({
      description:
        "Recommend a display + text font pairing for a mood, from the Fonts.* " +
        "registry already in scope. Returns the exact fontFamily snippet to use.",
      inputSchema: z.object({
        mood: z.string().default("modern").describe("modern, playful, elegant, bold, or tech."),
        brand: z.string().optional(),
      }),
      execute: async ({ mood, brand }) => suggestFonts(mood, brand),
    }),

    intent_deep_analyze: tool({
      description:
        "Four-pass intent extraction: goal + tone + length, industry/audience/" +
        "platform inference, proactive gap-fill, and the only questions worth " +
        "asking. Call first on a new brief, before planning.",
      inputSchema: z.object({
        request: z.string().describe("The user's brief, verbatim."),
      }),
      execute: async ({ request }) => intentDeepAnalyze(request),
    }),

    intent_questionnaire: tool({
      description:
        "What is already known, what was inferred, and the critical gaps as " +
        "quick picks (not free-text interrogation). Present the choices to the user.",
      inputSchema: z.object({ brief: z.string() }),
      execute: async ({ brief }) => intentQuestionnaire(brief),
    }),

    creative_direct: tool({
      description:
        "ONE-CALL art direction for a new brief: intent + palette + font pairing + " +
        "beat-to-preset map + layout strategy + which skill holds the detail. " +
        "Call this INSTEAD of intent_deep_analyze + font_suggest + load_motion_preset " +
        "on the full path — it replaces three paced calls with one. The presets " +
        "name exact easing/spring numbers; copy them, never invent curves.",
      inputSchema: z.object({
        brief: z.string().min(1).describe("The user's brief, verbatim."),
      }),
      execute: async ({ brief }) => {
        const intent = intentDeepAnalyze(brief)
        const fonts = suggestFonts(intent.tone)
        const b = brief.toLowerCase()
        // Example-skill routing (creative-direction §5): point the turn at the
        // complete working cut closest to this brief so timing/easing/layout
        // are imitated, never invented. The turn still converts to player
        // scope (Fonts.*, shorthands, clamps, default export).
        const examples: string[] = []
        if (/typewriter|cursor|quote|code reveal/i.test(b)) examples.push("example-typewriter-highlight")
        if (/carousel|rotating word|alternating/i.test(b)) examples.push("example-word-carousel", "example-text-rotation")
        if (/chart|graph|histogram|statistic|metric|dashboard/i.test(b)) examples.push("example-histogram", "example-gold-price-chart")
        if (/progress|loading|countdown|meter|0.*100/i.test(b)) examples.push("example-progress-bar")
        if (/chat|message|whatsapp|imessage|conversation|testimonial/i.test(b)) examples.push("messaging-chat-ui")
        if (/shape|abstract|bumper/i.test(b)) examples.push("example-animated-shapes")
        if (/3d|three|sphere|spatial/i.test(b)) examples.push("example-falling-spheres")
        if (/lottie/i.test(b)) examples.push("example-lottie")
        if (/promo|ad\b|teaser|launch|social|hook/i.test(b)) examples.push("social-media-formats")
        const beats: Array<{ beat: string; preset: string; easing: string; duration: number }> = [
          { beat: "anticipation", ...pickPreset("anticipation") },
          { beat: "entrance", ...pickPreset("entrance") },
        ]
        if (/word|text|headline|title|quote|list|stagger|cascade|name/i.test(b)) {
          beats.push({ beat: /char|letter/.test(b) ? "text-cascade" : "cascade", ...pickPreset("cascade") })
        }
        if (/logo|icon|badge|mark/i.test(b)) beats.push({ beat: "emphasis", ...pickPreset("emphasis") })
        if (/depth|parallax|scene|background|layer/i.test(b)) {
          beats.push({ beat: "parallax", ...pickPreset("parallax") })
          beats.push({ beat: "counter-motion", ...pickPreset("counter-motion") })
        }
        if (/reveal|mask|wipe|curtain|uncover/i.test(b)) beats.push({ beat: "reveal", ...pickPreset("reveal") })
        beats.push({ beat: "settle", ...pickPreset("settle") })
        beats.push({ beat: "idle", ...pickPreset("idle") })
        beats.push({ beat: "hold", ...pickPreset("hold") })
        return {
          intent: { goal: intent.goal, tone: intent.tone, length: intent.lengthLabel, audience: intent.audience, platform: intent.platform },
          palette: paletteForTone(intent.tone),
          fonts: { display: fonts.display, text: fonts.text, css: fonts.css },
          beats,
          layout: "One focal element upper-third or center; supporting copy in ONE flex column beneath it; decor at zIndex 1; 96px safe margins; load_skill(\"layout-composition\") for placement rules.",
          aliveness: "Anticipation → overshoot spring → secondary motion → idle breathing. Load_skill(\"cinematic-motion\") for the snippets; load_skill(\"kinetic-typography\") when the beat is type-led.",
          ...(examples.length > 0
            ? {
                examples,
                examplesNote:
                  "Load the FIRST example skill before writing code — it is a complete working cut. Imitate its structure/timing/easing, then convert to player scope (Fonts.*, scale/translate/rotate shorthands, clamps, default export).",
              }
            : {}),
        }
      },
    }),

    decision_make: tool({
      description:
        "Score explicit design options on weighted criteria and return the " +
        "winner with reasoning. Decide yourself instead of asking the user.",
      inputSchema: z.object({
        options: z.array(z.string()).min(2),
        criteria: z.record(z.string(), z.number()).optional(),
        signals: z.record(z.string(), z.record(z.string(), z.number())).optional(),
      }),
      execute: async ({ options, criteria, signals }) => decisionMake(options, criteria, signals),
    }),

    preference_apply: tool({
      description:
        "Apply the session's learned style preferences to a fresh decision so " +
        "cuts stay consistent across the conversation.",
      inputSchema: z.object({
        decision: z.string(),
        profile: z.record(z.string(), z.string()).optional(),
      }),
      execute: async ({ decision, profile }) => preferenceApply(decision, profile ?? {}),
    }),

    brand_learn: tool({
      description:
        "Extract a reusable brand profile (palette, moods) from example " +
        "descriptions. Save the profile wording and reuse it for every cut.",
      inputSchema: z.object({ examples: z.array(z.string()).min(1) }),
      execute: async ({ examples }) => brandLearn(examples),
    }),

    design_analyze: tool({
      description:
        "Structured motion-quality audit of the current source: 0-100 score " +
        "plus up to three specific findings. Deeper than review_motion — " +
        "call it when you need a number, e.g. for the quality panel.",
      inputSchema: z.object({}),
      execute: async () => {
        const { code, version } = store.current()
        if (!code) return { error: "Nothing to analyze yet." }
        return { version, ...designAnalyze(code) }
      },
    }),

    performance_profile: tool({
      description:
        "Frame-budget estimate for the current source: score, bottlenecks, " +
        "and optimization recommendations.",
      inputSchema: z.object({}),
      execute: async () => {
        const { code, version } = store.current()
        if (!code) return { error: "Nothing to profile yet." }
        return { version, ...performanceProfile(code) }
      },
    }),

    accessibility_audit: tool({
      description:
        "WCAG-oriented audit of the current source: flash risk, reduced-motion " +
        "path, contrast and caption guidance.",
      inputSchema: z.object({}),
      execute: async () => {
        const { code, version } = store.current()
        if (!code) return { error: "Nothing to audit yet." }
        return { version, ...accessibilityAudit(code) }
      },
    }),

    quick_start: tool({
      description:
        "FAST PATH: plan + write + validate a DESIGNED composition in ONE model call. " +
        "Use this FIRST on every new brief — it publishes an art-directed cut immediately " +
        "(palette + font pair + layout picked from the brief's mood), and follow-up " +
        "edits refine it. Pass the brief's product/brand/headline words PLUS its mood " +
        "and length: mood drives the stage, seconds drives the timing. Skip this when " +
        "the brief names a specific mechanic (typewriter, countdown, waveform) — those " +
        "need the full path from scratch.",
      inputSchema: z.object({
        product: z.string().optional().describe("Product or hero word shown large."),
        brand: z.string().optional().describe("Brand word shown in the hero lockup."),
        headline: z.string().max(140).optional().describe("Headline cascaded per word."),
        mood: z.string().optional().describe("Brief mood in one word: playful, cinematic, bold, minimal, elegant, tech, romantic."),
        seconds: z.number().min(2).max(30).optional().describe("Cut length in seconds — timing scales to it."),
      }),
      execute: async ({ product, brand, headline, mood, seconds }) => {
        const golden = goldenStarter({ product, brand, headline, mood, seconds })
        const repaired = autoRepairInline(golden.code)
        const checks = checkComposition(repaired.code)
        const errors = checks.filter((c) => c.level === "error")
        if (errors.length > 0) {
          return {
            ok: false,
            error: "Golden starter failed validation — write manually with write_composition instead.",
            errors: errors.map((e) => e.message),
          }
        }
        store.setPlan(golden.plan)
        const n = store.write(repaired.code, { bumpVersion: true })
        return {
          ok: true,
          version: n,
          plan: golden.plan,
          warnings: checks.filter((c) => c.level === "warn").map((w) => w.message),
          ...(repaired.applied.length > 0 ? { autoRepaired: repaired.applied } : {}),
          next: "Call preview_composition, then read_render_report, then ONE sentence. Do not rewrite what quick_start published — refine it with edit_file.",
        }
      },
    }),

    // --- Phase 3: orchestration (§1.2, §5) ---------------------------------
    blackboard_write: tool({
      description:
        "Post one workstream result to the shared blackboard (key + short value) " +
        "so parallel workstreams coordinate without restating everything through " +
        "the transcript. Keys like 'design:palette', 'content:assets', 'tech:plan'.",
      inputSchema: z.object({
        key: z.string().min(1).max(120),
        value: z.string().min(1).max(8000),
      }),
      execute: async ({ key, value }) => {
        store.blackboardWrite(key, value)
        return { ok: true, key }
      },
    }),

    blackboard_read: tool({
      description: "Read one blackboard entry posted by this or another workstream.",
      inputSchema: z.object({ key: z.string().min(1) }),
      execute: async ({ key }) => {
        const value = store.blackboardRead(key)
        return value === null ? { ok: false, error: `No entry "${key}".` } : { ok: true, key, value }
      },
    }),

    blackboard_list: tool({
      description: "List all blackboard keys with their update order.",
      inputSchema: z.object({}),
      execute: async () => ({ keys: store.blackboardList() }),
    }),

    execute_batch: tool({
      description:
        "Run several independent reads/computes in ONE model request instead of " +
        "one request each: skill loads, canvas, pre-validation, asset/font/intent " +
        "lookups, audits, template specs. Writes (plan_motion, write_composition, " +
        "edit_file, preview_composition) are NOT batchable — they stay sequential. " +
        "This is how a turn drops from 10-12 calls toward 8.",
      inputSchema: z.object({
        operations: z
          .array(z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()).default({}) }))
          .min(1)
          .max(10),
      }),
      execute: async ({ operations }) => {
        const results = await Promise.all(
          operations.map(async (op) => {
            try {
              return { tool: op.tool, ok: true, result: await batchExecute(store, op.tool, op.args ?? {}) }
            } catch (err) {
              return { tool: op.tool, ok: false, error: err instanceof Error ? err.message : String(err) }
            }
          })
        )
        return { results }
      },
    }),

    prefetch_tools: tool({
      description:
        "Turn-start accelerator: predict the lookups this brief will need " +
        "(intent spec, core skills, fonts, likely assets) and warm the cache " +
        "for them in one call. Also clears the blackboard for the new turn. " +
        "Call FIRST on a new brief, then use the returned results directly.",
      inputSchema: z.object({ brief: z.string().min(1) }),
      execute: async ({ brief }) => {
        store.blackboardClear()
        const predicted = predictTools(brief)
        const results = await Promise.all(
          predicted.map(async (op) => {
            try {
              return { tool: op.tool, ok: true, result: await batchExecute(store, op.tool, op.args) }
            } catch (err) {
              return { tool: op.tool, ok: false, error: err instanceof Error ? err.message : String(err) }
            }
          })
        )
        return { predicted: predicted.length, results }
      },
    }),

    // --- Phase 4: content generation (§2.4) --------------------------------
    copy_generate: tool({
      description:
        "Generate headline + tagline variations in a brand voice. Returns a " +
        "deck — pick ONE pair for the cut, at hero/sub scale.",
      inputSchema: z.object({
        brief: z.string(),
        tone: z.string().default("modern"),
        length: z.number().int().min(1).max(5).default(3),
      }),
      execute: async ({ brief, tone, length }) => copyGenerate(brief, tone, length),
    }),

    voiceover_generate: tool({
      description:
        "Time a voiceover script to the cut: word count, duration fit, and " +
        "frame cues for beat sync. ElevenLabs is not connected — synthesize " +
        "externally, sync here.",
      inputSchema: z.object({
        script: z.string().min(1),
        seconds: z.number().min(2).max(30),
        language: z.string().default("en"),
      }),
      execute: async ({ script, seconds, language }) => voiceoverGenerate(script, seconds, language),
    }),

    music_search: tool({
      description:
        "BPM-matched royalty-free bed suggestions with trim/loop math. Offline " +
        "placeholders — license before publishing.",
      inputSchema: z.object({
        mood: z.string(),
        duration: z.number().min(2).max(900),
        bpm: z.number().min(40).max(220).optional(),
      }),
      execute: async ({ mood, duration, bpm }) => musicSearch(mood, duration, bpm),
    }),

    sound_effects_library: tool({
      description: "Contextual SFX suggestion for an action, with timing + level notes.",
      inputSchema: z.object({ action: z.string().describe("e.g. 'logo pop entrance'") }),
      execute: async ({ action }) => soundEffects(action),
    }),

    subtitle_generate: tool({
      description:
        "Turn frame cues into caption windows for @remotion/captions. " +
        "Auto-transcription is not connected — cues come from the script.",
      inputSchema: z.object({
        cues: z.array(z.object({ at: z.number().int().min(0), text: z.string() })).min(1),
        language: z.string().default("en"),
      }),
      execute: async ({ cues, language }) => subtitleGenerate(cues, language),
    }),

    icon_generate: tool({
      description:
        "Pick consistent lucide-react icons for a concept, with the exact " +
        "import snippet. lucide-react is already in scope.",
      inputSchema: z.object({ concept: z.string() }),
      execute: async ({ concept }) => iconGenerate(concept),
    }),

    background_generate: tool({
      description:
        "Procedural animated background snippet (gradient/noise/grid) in brand " +
        "colors. Frame-driven — never CSS transitions.",
      inputSchema: z.object({
        style: z.string().describe("gradient, noise, or grid"),
        colors: z.array(z.string()).max(4).optional(),
      }),
      execute: async ({ style, colors }) => backgroundGenerate(style, colors),
    }),

    // --- Phase 4: export & distribution (§2.5) ------------------------------
    export_preset: tool({
      description:
        "Exact render spec for one platform preset (dims, fps, duration, cap " +
        "check, reframe math). Presets: ig-story, ig-feed, ig-reel, tiktok, " +
        "youtube, twitter, linkedin, web-hero, png-seq.",
      inputSchema: z.object({
        preset: z.string(),
        totalFrames: z.number().int().min(1).max(CANVAS.maxFrames),
      }),
      execute: async ({ preset, totalFrames }) => exportPreset(preset, totalFrames, CANVAS.fps),
    }),

    export_bundle: tool({
      description: "The 9-preset bundle plan: render the native master once, reframe per preset.",
      inputSchema: z.object({
        totalFrames: z.number().int().min(1).max(CANVAS.maxFrames),
      }),
      execute: async ({ totalFrames }) => ({
        ...exportBundle(totalFrames),
        presets: EXPORT_PRESETS.map((p) => ({ id: p.id, name: p.name, format: p.format })),
      }),
    }),

    cdn_publish: tool({
      description:
        "Publish spec: URL scheme, embed code, and the exact R2 binding to add. " +
        "Honest stub — R2 is not wired, so no file is uploaded.",
      inputSchema: z.object({ title: z.string().min(1) }),
      execute: async ({ title }) => cdnPublish(title),
    }),

    thumbnail_generate: tool({
      description: "Which frame to capture for the thumbnail (+2 variations) and how.",
      inputSchema: z.object({
        frame: z.number().int().min(0),
        totalFrames: z.number().int().min(1).max(CANVAS.maxFrames),
      }),
      execute: async ({ frame, totalFrames }) => thumbnailSpec(frame, totalFrames),
    }),

    watermark_apply: tool({
      description: "Watermark Img snippet at a safe-margin position with level guidance.",
      inputSchema: z.object({
        position: z.string().default("bottom-right"),
      }),
      execute: async ({ position }) => watermarkSpec(position),
    }),

    analytics_track: tool({
      description: "Record an advisory event (view, export, share) to composition_analytics.",
      inputSchema: z.object({
        event: z.string(),
        detail: z.string().default(""),
      }),
      execute: async ({ event, detail }) => {
        store.trackEvent(event, detail)
        return { ok: true, event }
      },
    }),

    version_tag: tool({
      description: "Tag the current version (semver + release notes) for rollback reference.",
      inputSchema: z.object({
        tag: z.string().min(1).max(40).describe("e.g. 'v1.0-ig-story'"),
        notes: z.string().max(1000).default(""),
      }),
      execute: async ({ tag, notes }) => {
        const { version } = store.current()
        store.tagVersion(version, tag, notes)
        return { ok: true, version, tag }
      },
    }),

    template_save: tool({
      description:
        "Save the current plan as a reusable parameterized template on the " +
        "blackboard for this conversation.",
      inputSchema: z.object({
        name: z.string().min(1).max(80),
      }),
      execute: async ({ name }) => {
        const { plan, version } = store.current()
        if (!plan) return { ok: false, error: "No plan to save — run plan_motion first." }
        const key = `template:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
        store.blackboardWrite(key, JSON.stringify({ name, version, plan }))
        return { ok: true, key, version, note: "Parameterized by beats — swap assets/palette/copy per use." }
      },
    }),

    // --- Phase 4: collaboration (§2.6) --------------------------------------
    share_create: tool({
      description: "Shareable review link scheme with permission level and expiry.",
      inputSchema: z.object({
        permission: z.enum(["view", "comment", "edit"]).default("view"),
        daysValid: z.number().int().min(1).max(90).default(7),
      }),
      execute: async ({ permission, daysValid }) => {
        // Session id is the DO name; the model does not carry it, so the link
        // is completed client-side. Track the share event regardless.
        store.trackEvent("share", permission)
        return { ...shareCreate("<session>", permission, daysValid), note: "Replace <session> with the conversation id from the URL." }
      },
    }),

    comment_add: tool({
      description: "Add a frame-anchored review comment to this cut's thread.",
      inputSchema: z.object({
        frame: z.number().int().min(0),
        text: z.string().min(1).max(2000),
      }),
      execute: async ({ frame, text }) => {
        const id = store.commentAdd(frame, text, "reviewer")
        return { ok: true, id, frame }
      },
    }),

    feedback_request: tool({
      description:
        "Review-invite spec: validated invite list + synthesis format. Email " +
        "sending is not wired — share the link manually.",
      inputSchema: z.object({ emails: z.array(z.string()).min(1) }),
      execute: async ({ emails }) => feedbackRequest(emails),
    }),

    team_invite: tool({
      description: "Team role spec for an email. Quotas/SSO are enterprise scope.",
      inputSchema: z.object({
        email: z.string(),
        role: z.enum(["viewer", "editor", "admin"]).default("viewer"),
      }),
      execute: async ({ email, role }) => teamInvite(email, role),
    }),

    activity_log: tool({
      description:
        "Full collaboration timeline for this cut: versions, tags, comments.",
      inputSchema: z.object({}),
      execute: async () => ({
        versions: store.versions().map((v) => ({ n: v.n, title: v.plan?.title ?? null })),
        tags: store.tags(),
        comments: store.comments(),
      }),
    }),

    // --- Phase 4: 3D foundation (§7.1) --------------------------------------
    three_scene_create: tool({
      description:
        "R3F camera-rig scaffold (orbit/dolly/pan) driven by the Remotion " +
        "clock. Foundation only — three/fiber are not installed yet.",
      inputSchema: z.object({
        kind: z.enum(["orbit", "dolly", "pan", "static"]).default("orbit"),
        seconds: z.number().min(2).max(30).default(5),
      }),
      execute: async ({ kind, seconds }) => threeSceneCreate(kind, seconds),
    }),

    three_camera_path: tool({
      description: "Camera keyframe path with per-segment easing, synced to beats.",
      inputSchema: z.object({
        type: z.enum(["dolly", "pan", "orbit", "fly-through"]).default("orbit"),
        // NOTE: no z.tuple here — tuple schemas emit draft-07 `items: [...]`
        // + `additionalItems`, which OpenAI-compatible providers (novita via
        // the Vercel gateway) reject with 400 and fail EVERY turn, since all
        // tools ship on every model call. An [x, y, z] triple is expressed as
        // a length-3 number array instead; the runtime shape is unchanged.
        keyframes: z
          .array(z.array(z.number()).min(3).max(3).describe("One [x, y, z] camera position"))
          .default([]),
      }),
      execute: async ({ type, keyframes }) =>
        threeCameraPath(type, keyframes as Array<[number, number, number]>),
    }),

    three_model_animate: tool({
      description:
        "Model animation snippet (rotate/float/entrance) with hosting note. " +
        "Model loading is not wired — host in R2/staticFile first.",
      inputSchema: z.object({
        model: z.string(),
        animation: z.enum(["rotate", "float", "entrance"]).default("entrance"),
        seconds: z.number().min(2).max(30).default(5),
      }),
      execute: async ({ model, animation, seconds }) => threeModelAnimate(model, animation, seconds),
    }),

    // --- Agent upgrade: motion design system (AGENT_UPGRADE_PLAN Phases 2-3) --
    load_motion_preset: tool({
      description:
        "Load a professional motion preset (timing + easing + transform snippet) for " +
        "a beat type. Returns ready-to-paste code — copy the numbers instead of " +
        "inventing curves. REQUIRED before writing any spring() or Easing.bezier(): " +
        "never hand-roll timing values. " +
        "Original five: entrance, transition, settle, exit, emphasis. " +
        "Extended beat vocabulary: reveal (clip-path wipe, not a fade), " +
        "anticipation (pre-movement compress), cascade (list stagger), " +
        "text-cascade (per-char spring), counter / counter-motion (opposite movement = depth), " +
        "hold / pause (rest beat), parallax (multi-layer speed), morph / blend (shape/colour transition). " +
        "Pass text + textStyle for an animated headline snippet on top of the preset.",
      inputSchema: z.object({
        beatType: z
          .enum([
            "entrance", "transition", "settle", "exit", "emphasis",
            "reveal", "anticipation", "cascade", "text-cascade",
            "counter", "counter-motion", "hold", "pause", "parallax", "morph", "blend",
          ])
          .describe(
            "The kind of motion this beat is. Use 'reveal' for clip-path reveals (not entrance), " +
            "'cascade' or 'text-cascade' for staggered lists/type, " +
            "'anticipation' for a compress-then-launch, " +
            "'parallax' for multi-layer depth, 'morph'/'blend' for shape/colour transitions."
          ),
        startFrame: z.number().int().min(0).default(0),
        text: z.string().max(120).optional().describe("Headline to animate, if this beat is type-led."),
        textStyle: z.enum(["charByChar", "wordByWord", "maskReveal"]).default("charByChar"),
      }),
      execute: async ({ beatType, startFrame, text, textStyle }) => {
        const { id, preset } = presetForBeat(beatType)
        return {
          id,
          preset,
          snippet: presetSnippet(id, startFrame),
          textSnippet: text ? textAnimationSnippet(textStyle, text, startFrame) : null,
          timing: { duration: preset.duration, easing: preset.easing, stagger: preset.stagger ?? null },
          note: preset.stagger
            ? `This beat uses a ${preset.stagger}f stagger — offset each item in the mapped list by index * ${preset.stagger}.`
            : null,
        }
      },
    }),

    layout_plan: tool({
      description:
        "Plan element layout BEFORE writing code. Returns positioned elements with " +
        "conflict detection (overflow/overlap/z-conflict), ready-to-paste " +
        "absolute-position hints, AND visual composition guidance (rule of thirds, " +
        "focal point, reading direction, visual weight). Pass approximate sizes; " +
        "the engine clamps to the 60px safe margin. " +
        "Mark the hero element with type='text' and a large height to get rule-of-thirds placement. " +
        "Full-bleed backgrounds should be type='image' — they get zIndex=1 automatically.",
      inputSchema: z.object({
        elements: z
          .array(
            z.object({
              id: z.string().min(1),
              type: z.enum(["text", "image", "shape", "video"]),
              approximate_size: z.object({
                width: z.number().min(1).max(1920),
                height: z.number().min(1).max(1080),
              }),
              role: z
                .enum(["hero", "body", "label", "background", "accent"])
                .optional()
                .describe("Semantic role — 'hero' gets rule-of-thirds placement, 'background' gets zIndex=1."),
            })
          )
          .min(1)
          .max(20),
        strategy: z.enum(["hierarchy", "grid", "stack"]).default("hierarchy"),
        canvas: z
          .object({ width: z.number().default(1920), height: z.number().default(1080) })
          .optional()
          .describe("Defaults to the 1920x1080 composition canvas."),
      }),
      execute: async ({ elements, strategy, canvas }) => {
        const w = canvas?.width ?? CANVAS.width
        const h = canvas?.height ?? CANVAS.height
        const engine = new LayoutEngine()
        const sized = elements.map((e) => ({
          id: e.id,
          type: e.type,
          width: Math.round(e.approximate_size.width),
          height: Math.round(e.approximate_size.height),
        }))
        const plan = engine.autoLayout(sized, strategy)

        // Visual composition guidance — rule of thirds, focal point, reading direction
        const compositionHints = buildCompositionHints(sized, plan.elements, w, h)

        return {
          layout: plan.elements,
          conflicts: plan.conflicts,
          code_hints: plan.codeHints,
          composition: compositionHints,
        }
      },
    }),

    auto_enhance_motion: tool({
      description:
        "Upgrade linear animations in the current composition to designed motion. " +
        "Applies three tiers of enhancement: " +
        "(1) EASING — naked interpolate() calls get Easing.bezier(0.16, 1, 0.3, 1), " +
        "(2) CLAMPING — interpolate() calls on opacity or scale without extrapolateRight:\"clamp\" " +
        "get clamped so values never run past 0/1 after the animation ends (most common blank-frame bug), " +
        "(3) STAGGER REPORT — mapped lists without stagger are reported with the exact fix. " +
        "Re-validates after; saves only when no new errors appear.",
      inputSchema: z.object({}),
      execute: async () => {
        const { code } = store.current()
        if (!code) return { ok: false, error: "No composition to enhance — use write_composition." }

        let enhanced = code
        const enhancements: string[] = []

        // Tier 1: Add easing to naked interpolate() calls
        const { upgraded: eased, count: easingCount } = applyNakedEasing(enhanced)
        if (easingCount > 0) {
          enhanced = ensureEasingImport(eased).code
          enhancements.push(`Added Easing.bezier(0.16, 1, 0.3, 1) to ${easingCount} linear interpolate() call(s)`)
        }

        // Tier 2: Add extrapolateRight: "clamp" to opacity/scale interpolations
        // that are missing it — the most common cause of blank frames after the
        // animation ends (Issue 6 fix).
        const { clamped, clampCount } = applyExtrapolateClamp(enhanced)
        if (clampCount > 0) {
          enhanced = clamped
          enhancements.push(
            `Added extrapolateRight: "clamp" + extrapolateLeft: "clamp" to ${clampCount} opacity/scale interpolation(s) — prevents values running past [0,1] after animation ends`
          )
        }

        // Tier 3: Report unstaggered mapped lists
        const staggerSites = findUnstaggeredMaps(enhanced)
        if (staggerSites > 0) {
          enhancements.push(
            `${staggerSites} mapped list(s) still need a stagger — offset each item by index * 3 frames: ` +
            `opacity: spring({ frame: frame - (startFrame + i * 3), fps: 30, config: { damping: 18, mass: 0.5, stiffness: 180 } })`
          )
        }

        if (easingCount === 0 && clampCount === 0 && staggerSites === 0) {
          return {
            ok: true,
            version: store.current().version,
            enhancements: ["Already designed — every interpolation has easing, clamping, and stagger."],
          }
        }

        // Only save if something was mechanically changed (easing or clamping)
        if (easingCount > 0 || clampCount > 0) {
          const checks = checkComposition(enhanced)
          const errors = checks.filter((c) => c.level === "error")
          if (errors.length > 0) {
            return {
              ok: false,
              error: "Auto-enhance would break the code — fix manually instead.",
              errors: errors.map((e) => e.message),
            }
          }
          const n = store.write(enhanced, { bumpVersion: true })
          return { ok: true, version: n, enhancements }
        }

        // Stagger sites need manual intervention — just report
        return { ok: true, version: store.current().version, enhancements }
      },
    }),

    verify_no_errors: tool({
      description:
        "Final validation gate — confirms zero errors before preview. Blocking " +
        "on ERRORS and on a failed player report for THIS exact version. Layout " +
        "warnings come back as advisory and NEVER block: entrances, exits, " +
        "punch-ins and shared z-indexes are normal motion, and the player " +
        "report is the authority on whether they render. If ok:false names a " +
        "browser error, the fixHint field tells you the exact tool call to make.",
      inputSchema: z.object({}),
      execute: async () => {
        const { code, version } = store.current()
        if (!code) return { ok: false, blocking: true, errors: ["No composition yet."], advisory: [] }
        const browserFailure = currentBrowserFailure(store, agent)
        const gate = gateVerification(checkComposition(code), browserFailure)
        if (!gate.ok) {
          return {
            ok: false,
            blocking: true,
            errors: gate.errors,
            ...(browserFailure?.line !== undefined ? { line: browserFailure.line } : {}),
            ...(browserFailure?.message ? { fixHint: browserFixHint(browserFailure.message) } : {}),
            advisory: [],
            instruction: browserFailure
              ? "DO NOT PREVIEW. Fix the browser error first with edit_file (it names the line), then preview the new version."
              : "DO NOT PREVIEW. Fix these errors with edit_file or write_composition first.",
          }
        }
        return {
          ok: true,
          version,
          ready: true,
          advisory: gate.advisory,
          note: gate.advisory.length > 0
            ? "Advisory items never block preview — fix them only if cheap, or if the player shows a blank frame."
            : "Clean — no errors, no advisory warnings. Safe to call preview_composition.",
        }
      },
    }),
  }
}

/**
 * Mechanical repairs applied inline on every write_composition / quick_start,
 * so the model never spends a paced round-trip on what is deterministic:
 * lucide namespace, Easing import, random import, naked linear easing, and a
 * missing frame binding. Same helpers auto_fix_code uses — no drift.
 */
export function autoRepairInline(code: string): { code: string; applied: string[] } {
  let next = code
  const applied: string[] = []

  const lucide = applyLucideNamespace(next)
  if (lucide.names.length > 0) {
    next = lucide.code
    applied.push(`lucide namespace (${lucide.names.join(", ")})`)
  }

  // Non-deterministic Math.random() outside comments/strings → seeded random().
  // Same comment/string-aware scan auto_fix_code uses; without it the write
  // would be refused and cost the turn an extra paced round-trip.
  {
    const stripped = next
      .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
      .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
      .replace(/`(?:\\.|[^`\\])*`/g, (m) => " ".repeat(m.length))
      .replace(/"(?:\\.|[^"\\])*"/g, (m) => " ".repeat(m.length))
      .replace(/'(?:\\.|[^'\\])*'/g, (m) => " ".repeat(m.length))
    if (/Math\.random\s*\(/.test(stripped)) {
      const randomRe = /Math\.random\s*\(\s*\)/g
      let rebuilt = ""
      let lastIdx = 0
      let match: RegExpExecArray | null
      let count = 0
      while ((match = randomRe.exec(next)) !== null) {
        const atPos = stripped.slice(match.index, match.index + match[0].length)
        if (!/^\s+$/.test(atPos)) {
          rebuilt += next.slice(lastIdx, match.index) + "random(null)"
          lastIdx = match.index + match[0].length
          count++
        }
      }
      if (count > 0) {
        next = rebuilt + next.slice(lastIdx)
        applied.push(`Math.random → random(null) (${count}x)`)
      }
    }
  }

  // Page-default fontFamily → Fonts.*. Mechanical and always right: a literal
  // "Arial"/"system-ui" stack is never a deliberate motion choice.
  {
    const fontRe = /fontFamily:\s*["'](system-ui|sans-serif|serif|ui-sans-serif|Arial|Helvetica|Inter|Roboto)["']/gi
    const matches = [...next.matchAll(fontRe)]
    if (matches.length > 0) {
      const face = DISPLAY_FACES[0]
      next = next.replace(fontRe, `fontFamily: Fonts.${face}.family`)
      applied.push(`page-default font → Fonts.${face}.family (${matches.length}x)`)
    }
  }

  const naked = applyNakedEasing(next)
  if (naked.count > 0) {
    next = naked.upgraded
    applied.push(`${naked.count}x linear interpolate → Easing.bezier + clamp`)
  }
  const easing = ensureEasingImport(next)
  if (easing.added) {
    next = easing.code
    applied.push("Easing import")
  }
  const rnd = ensureRandomImport(next)
  if (rnd.added) {
    next = rnd.code
    applied.push("random import")
  }

  const needsFrame =
    /interpolate\(\s*frame\b/.test(next) &&
    !/useCurrentFrame\(\)/.test(next) &&
    !/(?:const|let|var)\s+frame\b/.test(next)
  if (needsFrame) {
    const bodyOpen = next.search(/(?:function\s+\w+[^{]*|=>\s*)\{/)
    if (bodyOpen !== -1) {
      const insertAt = next.indexOf("{", bodyOpen) + 1
      next = next.slice(0, insertAt) + "\n  const frame = useCurrentFrame();" + next.slice(insertAt)
      const m = /import\s*\{([^}]*)\}\s*from\s*["']remotion["']/.exec(next)
      if (m && !/useCurrentFrame/.test(m[1] ?? "")) {
        next = next.replace(m[0], `import {${m[1]!.replace(/\s+$/, "")}, useCurrentFrame } from "remotion"`)
      }
      applied.push("frame binding")
    }
  }

  return { code: next, applied }
}

/**
 * Shared edit engine behind edit_file (unique-match, partial apply) and
 * bulk_edit (all-occurrences per op, atomic batch).
 *
 * edit_file tolerates a failed op and saves the rest — one note touches
 * one thing. bulk_edit is atomic: if ANY op fails or the result has
 * errors, nothing is saved and the agent retries the batch.
 */
async function applyEditOps(
  store: CompositionStore,
  ops: Array<{ find: string; replace: string; all?: boolean }>,
  opts: { allowPartial: boolean }
): Promise<unknown> {
  let code = store.current().code
  if (!code) {
    return { ok: false, error: "There is no composition yet — use write_composition." }
  }

  const applied: Array<{ find: string; count: number }> = []
  const failed: Array<{ find: string; reason: string; suggestion?: Array<{ line: number; text: string }> }> = []

  for (const op of ops) {
    if (op.find === "") {
      failed.push({ find: "<empty>", reason: "`find` cannot be empty." })
      continue
    }
    const occurrences = code.split(op.find).length - 1
    if (occurrences === 0) {
      failed.push({
        find: op.find.slice(0, 80),
        reason: "No exact match. Copy the text from read_file, whitespace included.",
        suggestion: suggestCloseMatch(code, op.find),
      })
      continue
    }
    if (occurrences > 1 && !op.all) {
      failed.push({
        find: op.find.slice(0, 80),
        reason: `Matches ${occurrences} times — include more surrounding lines to make it unique, or use bulk_edit with all:true.`,
        suggestion: suggestCloseMatch(code, op.find).slice(0, 1),
      })
      continue
    }
    code = op.all ? code.split(op.find).join(op.replace) : code.replace(op.find, op.replace)
    applied.push({ find: op.find.slice(0, 60), count: occurrences > 1 && op.all ? occurrences : 1 })
  }

  if (applied.length === 0) {
    return { ok: false, applied: 0, failed }
  }

  // bulk_edit is atomic: a failed op poisons the batch, so nothing saves.
  // Each failed op carries the closest real lines (suggestion) — retry the
  // batch from those instead of re-guessing.
  if (!opts.allowPartial && failed.length > 0) {
    return {
      ok: false,
      applied: 0,
      appliedPreview: applied,
      failed,
      note: "bulk_edit is atomic — nothing was saved. Fix the failed ops using their `suggestion` lines and retry the batch.",
    }
  }

  const checks = checkComposition(code)
  const errors = checks.filter((c) => c.level === "error")
  if (errors.length > 0) {
    return {
      ok: false,
      applied: opts.allowPartial ? applied.length : 0,
      failed,
      errors: errors.map((e) => e.message),
      note: "Nothing was saved. Fix the errors and try again.",
    }
  }

  const n = store.write(code, { bumpVersion: true })
  return {
    ok: true,
    version: n,
    applied: applied.length,
    appliedDetail: applied,
    failed,
    warnings: checks.filter((c) => c.level === "warn").map((w) => w.message),
  }
}

/**
 * Pure verification gate, shared by the verify_no_errors tool and the tests:
 * static errors and a failed player report for the current version block;
 * layout warnings are advisory and never block.
 */
export function gateVerification(
  checks: Array<{ level: "error" | "warn"; message: string }>,
  browserFailure: { phase?: string; message?: string; line?: number } | null
): { ok: boolean; blocking: boolean; errors: string[]; advisory: string[] } {
  if (browserFailure) {
    return {
      ok: false,
      blocking: true,
      errors: [
        `The player failed this exact version in the browser (${browserFailure.phase ?? "unknown phase"}): ${browserFailure.message ?? "no message"}`,
      ],
      advisory: [],
    }
  }
  const errors = checks.filter((c) => c.level === "error").map((c) => c.message)
  if (errors.length > 0) return { ok: false, blocking: true, errors, advisory: [] }
  return {
    ok: true,
    blocking: false,
    errors: [],
    advisory: checks.filter((c) => c.level === "warn").map((c) => c.message),
  }
}

/**
 * The player's verdict on the CURRENT version, when it failed in the browser.
 * Stale reports (older version than the code on stage) are ignored — a newer
 * write already superseded them, and resurfacing them sends the model to fix
 * code that no longer exists.
 */
export function currentBrowserFailure(
  store: CompositionStore,
  agent?: Chat
): { phase?: string; message?: string; line?: number } | null {
  const audit = agent?.state?.audit
  if (!audit || audit.ok) return null
  if (audit.version !== store.current().version) return null
  const line = audit.message ? /\(line (\d+)\)/.exec(audit.message)?.[1] : undefined
  return {
    ...(audit.phase ? { phase: audit.phase } : {}),
    ...(audit.message ? { message: audit.message } : {}),
    ...(line !== undefined ? { line: Number(line) } : {}),
  }
}

/**
 * Maps a browser failure to the cheapest fix path, so a failed render turns
 * into one precise tool call instead of a full rewrite.
 */
export function browserFixHint(message: string): string {
  if (/"[^"]+" is not available/.test(message)) {
    return "A name the player scope cannot provide. Call auto_fix_code with this message — it converts lucide named imports to the Lucide namespace automatically; otherwise declare the name or import it from remotion."
  }
  if (/\(line (\d+)\)/.test(message)) {
    const line = /\(line (\d+)\)/.exec(message)?.[1]
    return `Compile error at line ${line}. Call read_file, look at that line, and fix it with edit_file — do not rewrite the whole composition.`
  }
  if (/runtime:/i.test(message)) {
    return "It compiled but threw while rendering a frame. The message names the failing access — guard it (optional chaining / default) with edit_file, then re-preview."
  }
  return "Fix the named issue with edit_file, then preview_composition again (new version), then read_render_report."
}

/** Closest real lines for a `find` that matched nothing, so a retry is precise. */
export function suggestCloseMatch(code: string, find: string): Array<{ line: number; text: string }> {
  const codeLines = code.split("\n")
  const findLines = find.split("\n")
  const first = findLines.find((l) => l.trim() !== "") ?? ""
  if (!first.trim()) return []
  const norm = (s: string) => s.trim().replace(/\s+/g, " ")
  const target = norm(first)
  const targetTokens = new Set(target.split(" ").filter(Boolean))
  if (targetTokens.size === 0) return []
  const scored = codeLines
    .map((line, i) => {
      const cand = norm(line)
      if (!cand) return { i, score: -1 }
      const candTokens = new Set(cand.split(" ").filter(Boolean))
      let overlap = 0
      for (const t of targetTokens) if (candTokens.has(t)) overlap++
      const overlapScore = overlap / targetTokens.size
      const lenScore = 1 - Math.min(1, Math.abs(cand.length - target.length) / Math.max(target.length, 1))
      return { i, score: overlapScore * 0.7 + lenScore * 0.3 }
    })
    .filter((s) => s.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  return scored.map(({ i }) => ({
    line: i + 1,
    text: codeLines.slice(i, i + findLines.length).join("\n").slice(0, 600),
  }))
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Named lucide imports compile but throw "<name> is not available" at mount —
 * the player scope only registers the Lucide namespace. Mechanical to repair:
 * one namespace import plus prefixed JSX usages.
 *
 * Fixed (Issue 8): correctly handles `import { Zap as Lightning }` aliases.
 * The JSX tag uses the local alias name, so we must map alias → original and
 * replace `<Lightning />` with `<Lucide.Zap />`, not `<Lucide.Lightning />`.
 */
export function applyLucideNamespace(code: string): { code: string; names: string[] } {
  // Collect { original, local } pairs from every lucide-react named import.
  // e.g. `import { Zap, ArrowRight as Arrow }` → [{original: "Zap", local: "Zap"}, {original: "ArrowRight", local: "Arrow"}]
  // NOTE: the specifier list is [^{}]* — never [\s\S]*?. The lazy-dot version
  // spanned `}` boundaries, so a file with `from "remotion"` above the lucide
  // line matched from the FIRST import and mangled both lines (real model
  // output always has several imports, so this broke nearly every repair).
  const pairs: Array<{ original: string; local: string }> = []
  const importRe = /import\s*\{([^{}]*)\}\s*from\s*["']lucide-react["']/g
  let m: RegExpExecArray | null
  while ((m = importRe.exec(code)) !== null) {
    for (const raw of (m[1] ?? "").split(",")) {
      const parts = raw.trim().split(/\s+as\s+/)
      const original = parts[0]?.trim()
      const local = parts[1]?.trim() ?? original
      if (original && local) pairs.push({ original, local })
    }
  }
  if (pairs.length === 0) return { code, names: [] }

  // Replace all lucide-react named imports with the namespace import.
  let next = code.replace(importRe, `import * as Lucide from "lucide-react"`)
  // Deduplicate if there were multiple named-import lines.
  next = next.replace(
    /(import \* as Lucide from "lucide-react";?\s*){2,}/g,
    `import * as Lucide from "lucide-react";\n`
  )

  // Replace JSX tags: use the LOCAL alias name in the regex (that's what's in the JSX),
  // but output <Lucide.ORIGINAL /> (the actual icon name in the Lucide namespace).
  for (const { original, local } of pairs) {
    next = next.replace(
      new RegExp(`<(/?)${escapeRegExp(local)}(?=[\\s/>])`, "g"),
      `<$1Lucide.${original}`
    )
  }

  return { code: next, names: pairs.map((p) => p.local) }
}

/** random() needs its import, or the Math.random repair trades one mount error for another. */
export function ensureRandomImport(code: string): { code: string; added: boolean } {
  if (!/\brandom\s*\(/.test(code)) return { code, added: false }
  if (/import\s*\{[^}]*\brandom\b[^}]*\}\s*from\s*["']remotion["']/.test(code)) {
    return { code, added: false }
  }
  const m = /import\s*\{([^}]*)\}\s*from\s*["']remotion["']/.exec(code)
  if (m) {
    return {
      code: code.replace(m[0], `import {${m[1]!.replace(/\s+$/, "")}, random } from "remotion"`),
      added: true,
    }
  }
  return { code: `import { random } from "remotion";\n${code}`, added: true }
}

/**
 * Agent upgrade: high-confidence easing repair shared by auto_fix_code and
 * auto_enhance_motion. Only touches interpolate() calls with exactly two
 * array args and NO options object (they end in `])`) — anything else is
 * left for the model.
 */
function applyNakedEasing(code: string): { upgraded: string; count: number } {
  let count = 0
  const upgraded = code.replace(
    /interpolate\(\s*frame\s*,\s*\[[^\]]*\]\s*,\s*\[[^\]]*\]\)/g,
    (m) => {
      count += 1
      return `${m.slice(0, -1)}, { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" })`
    }
  )
  return { upgraded, count }
}

/**
 * Adds extrapolateRight: "clamp" + extrapolateLeft: "clamp" to interpolate()
 * calls whose output range is [0, 1] or [0, n] (opacity, scale, clip-path
 * progress) but which already have an options object without clamping.
 *
 * This is the fix for Issue 6: the most common blank-frame bug is an opacity
 * or scale that runs past 1.0 or below 0.0 after the animation ends because
 * there is no extrapolation clamp. validate_composition previously missed this.
 */
function applyExtrapolateClamp(code: string): { clamped: string; clampCount: number } {
  let clampCount = 0
  // Match interpolate() calls that:
  // 1. Have an options object ({ ... }) as the 4th argument
  // 2. Do NOT already contain extrapolateRight
  // 3. Have an output range that looks like [0, 1] or [0, n] (opacity/scale/progress)
  const clamped = code.replace(
    /interpolate\(\s*frame\s*,\s*\[[^\]]*\]\s*,\s*\[([^\]]*)\]\s*,\s*\{([^}]*)\}\s*\)/g,
    (m, outputRange: string, options: string) => {
      // Skip if already clamped
      if (/extrapolateRight/.test(options)) return m
      // Only clamp output ranges that look like [0, n] — opacity, scale, progress
      const nums = outputRange.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
      if (nums.length < 2) return m
      const [first, last] = [nums[0]!, nums[nums.length - 1]!]
      // [0, 1], [0, 1.x], [0, x] where x <= 2 — animation progress values
      if (first !== 0 || last > 2 || last <= 0) return m
      clampCount++
      return m.replace(
        /,\s*\{([^}]*)\}\s*\)$/,
        `, { $1, extrapolateLeft: "clamp", extrapolateRight: "clamp" })`
      )
    }
  )
  return { clamped, clampCount }
}

/** Easing references need their import, or the repair trades an error for a warning. */
function ensureEasingImport(code: string): { code: string; added: boolean } {
  if (!/\bEasing\b/.test(code)) return { code, added: false }
  if (/import\s*\{[^}]*\bEasing\b[^}]*\}\s*from\s*["']remotion["']/.test(code)) {
    return { code, added: false }
  }
  const m = /import\s*\{([^}]*)\}\s*from\s*["']remotion["']/.exec(code)
  if (m) {
    return {
      code: code.replace(m[0], `import {${m[1].replace(/\s+$/, "")}, Easing } from "remotion"`),
      added: true,
    }
  }
  return { code: `import { Easing } from "remotion";\n${code}`, added: true }
}

/** Mapped lists with no stagger/delay/index-offset still need the human touch. */
function findUnstaggeredMaps(code: string): number {
  const maps = code.match(/\.map\(/g) ?? []
  if (maps.length === 0) return 0
  return /delay|stagger|index\s*[\*\+\-]/.test(code) ? 0 : maps.length
}

/**
 * Phase 3 batch dispatcher (§5.1.1). Single-implementation rule: every
 * batchable op calls the SAME pure helper as its standalone tool, so batch
 * and solo results can never drift apart. Writes are refused here — batching
 * a mutation would hide its ordering, which is exactly the failure mode the
 * single-cut store exists to prevent.
 */
async function batchExecute(
  store: CompositionStore,
  tool: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback)
  const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback)

  switch (tool) {
    case "load_skill": {
      const id = str(args.id)
      const cached = cacheGet<{ id: string; content: string }>(`skill:${id}`)
      if (cached) return { ...cached, cached: true }
      const skill = findSkill(id)
      if (!skill) throw new Error(`Unknown skill "${id}". Available: ${SKILL_IDS.join(", ")}`)
      const out = { id: skill.id, content: skill.content.slice(0, 24_000) }
      cacheSet(`skill:${id}`, out, TTL.skill)
      return { ...out, cached: false }
    }
    case "get_canvas":
      return { ...CANVAS, currentVersion: store.current().version, hasComposition: store.current().code.length > 0 }
    case "pre_validate_plan": {
      const beats = (args.beats as Array<{ from: number; to: number; what: string }>) ?? []
      const check = preValidatePlan(beats, CANVAS.maxFrames)
      const solved = constraintSolve(num(args.totalFrames, beats.at(-1)?.to ?? 0), beats, CANVAS.maxFrames)
      return { ...check, budget: solved.note, suggestedBeats: solved.beats }
    }
    case "constraint_solve":
      return constraintSolve(
        num(args.totalFrames, 0),
        (args.beats as Array<{ from: number; to: number; what: string }>) ?? [],
        CANVAS.maxFrames
      )
    case "dependency_resolve":
      return dependencyResolve((args.imports as string[]) ?? [])
    case "asset_search": {
      const key = `asset:${str(args.query)}:${str(args.type, "image")}`
      const cached = cacheGet<unknown>(key)
      if (cached) return { ...(cached as object), cached: true }
      const out = suggestAssets(str(args.query), (args.type as "image" | "video" | "audio") ?? "image")
      cacheSet(key, out, TTL.asset)
      return { ...out, cached: false }
    }
    case "asset_optimize": {
      const key = `opt:${str(args.url)}:${str(args.format, "webp")}:${num(args.quality, 80)}`
      const cached = cacheGet<unknown>(key)
      if (cached) return { ...(cached as object), cached: true }
      const out = optimizeAsset(
        str(args.url),
        (args.format as "webp" | "avif" | "mp4" | "original") ?? "webp",
        num(args.quality, 80)
      )
      cacheSet(key, out, TTL.asset)
      return { ...out, cached: false }
    }
    case "font_suggest": {
      const key = `font:${str(args.mood, "modern")}:${str(args.brand)}`
      const cached = cacheGet<unknown>(key)
      if (cached) return { ...(cached as object), cached: true }
      const out = suggestFonts(str(args.mood, "modern"), str(args.brand) || undefined)
      cacheSet(key, out, TTL.asset)
      return { ...out, cached: false }
    }
    case "intent_deep_analyze": {
      const key = `intent:${str(args.request).slice(0, 200)}`
      const cached = cacheGet<unknown>(key)
      if (cached) return { ...(cached as object), cached: true }
      const out = intentDeepAnalyze(str(args.request))
      cacheSet(key, out, TTL.intent)
      return { ...out, cached: false }
    }
    case "intent_questionnaire":
      return intentQuestionnaire(str(args.brief))
    case "decision_make":
      return decisionMake(
        (args.options as string[]) ?? [],
        (args.criteria as Record<string, number>) ?? undefined,
        (args.signals as Record<string, Record<string, number>>) ?? undefined
      )
    case "preference_apply":
      return preferenceApply(str(args.decision), (args.profile as Record<string, string>) ?? {})
    case "brand_learn":
      return brandLearn((args.examples as string[]) ?? [])
    case "design_analyze": {
      const { code, version } = store.current()
      if (!code) throw new Error("Nothing to analyze yet.")
      return { version, ...designAnalyze(code) }
    }
    case "performance_profile": {
      const { code, version } = store.current()
      if (!code) throw new Error("Nothing to profile yet.")
      return { version, ...performanceProfile(code) }
    }
    case "accessibility_audit": {
      const { code, version } = store.current()
      if (!code) throw new Error("Nothing to audit yet.")
      return { version, ...accessibilityAudit(code) }
    }
    case "validate_composition": {
      // NEVER cached: the source changed since the last call by definition.
      const { code, version } = store.current()
      if (!code) return { ok: false, errors: ["No composition to validate."], warnings: [] }
      const checks = checkComposition(code)
      return {
        ok: !checks.some((c) => c.level === "error"),
        version,
        errors: checks.filter((c) => c.level === "error").map((c) => c.message),
        warnings: checks.filter((c) => c.level === "warn").map((c) => c.message),
      }
    }
    case "list_versions": {
      const versions = store.versions()
      return {
        current: store.current().version,
        versions: versions.map((v) => ({
          n: v.n,
          lines: v.code.split("\n").length,
          bytes: v.code.length,
          title: v.plan?.title ?? null,
        })),
      }
    }
    case "blackboard_read": {
      const value = store.blackboardRead(str(args.key))
      return value === null ? { ok: false, error: `No entry "${str(args.key)}".` } : { ok: true, value }
    }
    case "blackboard_list":
      return { keys: store.blackboardList() }
    case "copy_generate":
      return copyGenerate(str(args.brief), str(args.tone, "modern"), num(args.length, 3))
    case "voiceover_generate":
      return voiceoverGenerate(str(args.script), num(args.seconds, 15), str(args.language, "en"))
    case "music_search":
      return musicSearch(
        str(args.mood, "modern"),
        num(args.duration, 30),
        typeof args.bpm === "number" ? args.bpm : undefined
      )
    case "sound_effects_library":
      return soundEffects(str(args.action, "pop"))
    case "subtitle_generate":
      return subtitleGenerate(
        (args.cues as Array<{ at: number; text: string }>) ?? [],
        str(args.language, "en")
      )
    case "icon_generate":
      return iconGenerate(str(args.concept, "spark"))
    case "background_generate":
      return backgroundGenerate(str(args.style, "gradient"), (args.colors as string[]) ?? undefined)
    case "export_preset":
      return exportPreset(str(args.preset, "youtube"), num(args.totalFrames, 150), CANVAS.fps)
    case "export_bundle":
      return exportBundle(num(args.totalFrames, 150))
    case "cdn_publish":
      return cdnPublish(str(args.title, "cut"))
    case "thumbnail_generate":
      return thumbnailSpec(num(args.frame, 0), num(args.totalFrames, 150))
    case "watermark_apply":
      return watermarkSpec(str(args.position, "bottom-right"))
    case "activity_log":
      return {
        versions: store.versions().map((v) => ({ n: v.n, title: v.plan?.title ?? null })),
        tags: store.tags(),
        comments: store.comments(),
      }
    case "three_scene_create":
      return threeSceneCreate(
        (args.kind as "orbit" | "dolly" | "pan" | "static") ?? "orbit",
        num(args.seconds, 5)
      )
    case "three_camera_path":
      return threeCameraPath(
        (args.type as "dolly" | "pan" | "orbit" | "fly-through") ?? "orbit",
        (args.keyframes as Array<[number, number, number]>) ?? []
      )
    case "three_model_animate":
      return threeModelAnimate(
        str(args.model, "model.glb"),
        (args.animation as "rotate" | "float" | "entrance") ?? "entrance",
        num(args.seconds, 5)
      )
    case "load_motion_preset": {
      // 50x fix: the batch path allowlisted only the original five beats, so
      // reveal/cascade/parallax/etc silently fell back to entrance — the batch
      // and solo results drifted. Accept the full 16-beat vocabulary.
      const ALL_BEATS = [
        "entrance", "transition", "settle", "exit", "emphasis",
        "reveal", "anticipation", "cascade", "text-cascade",
        "counter", "counter-motion", "hold", "pause", "parallax", "morph", "blend",
      ]
      const beat = ALL_BEATS.includes(str(args.beatType)) ? str(args.beatType) : "entrance"
      const { id, preset } = presetForBeat(beat)
      const start = num(args.startFrame, 0)
      const text = str(args.text)
      const textStyle = (["charByChar", "wordByWord", "maskReveal"].includes(str(args.textStyle))
        ? args.textStyle
        : "charByChar") as "charByChar" | "wordByWord" | "maskReveal"
      return {
        id,
        preset,
        snippet: presetSnippet(id, start),
        textSnippet: text ? textAnimationSnippet(textStyle, text, start) : null,
        timing: { duration: preset.duration, easing: preset.easing },
      }
    }
    case "layout_plan": {
      const engine = new LayoutEngine()
      const raw = (args.elements as Array<{
        id?: string
        type?: string
        approximate_size?: { width?: number; height?: number }
      }>) ?? []
      const els = raw.map((e) => ({
        id: str(e.id, "element"),
        type: (["text", "image", "shape", "video"].includes(e.type ?? "") ? e.type : "shape") as ElementType,
        width: Math.max(1, Math.round(num(e.approximate_size?.width, 100))),
        height: Math.max(1, Math.round(num(e.approximate_size?.height, 100))),
      }))
      const strategy = (["hierarchy", "grid", "stack"].includes(str(args.strategy)) ? args.strategy : "hierarchy") as LayoutStrategy
      const plan = engine.autoLayout(els, strategy)
      return { layout: plan.elements, conflicts: plan.conflicts, code_hints: plan.codeHints }
    }
    case "verify_no_errors": {
      // Read-only gate — safe to batch; NEVER cached (the source just changed).
      const { code, version } = store.current()
      if (!code) return { ok: false, blocking: true, errors: ["No composition yet."], warnings: [] }
      const checks = checkComposition(code)
      const errors = checks.filter((c) => c.level === "error").map((c) => c.message)
      const layoutWarnings = checks
        .filter((c) => c.level === "warn" && /overflow|overlap|z-index|zIndex|off-canvas/i.test(c.message))
        .map((c) => c.message)
      if (errors.length > 0 || layoutWarnings.length > 0) {
        return {
          ok: false,
          blocking: true,
          errors,
          warnings: layoutWarnings,
          instruction: "DO NOT PREVIEW. Fix these issues with edit_file or write_composition first.",
        }
      }
      return { ok: true, version, ready: true }
    }
    default:
      throw new Error(
        `"${tool}" is not batchable. Batch reads/computes; keep writes ` +
          `(plan_motion, write_composition, edit_file, preview_composition, restore_version, auto_fix_code) sequential.`
      )
  }
}
