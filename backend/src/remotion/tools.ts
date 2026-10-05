import { tool, type ToolSet } from "ai"
import { z } from "zod"
import { findSkill, SKILL_IDS } from "./skills.generated"
import type { Chat } from "../chat"
import type { CompositionStore } from "./store"
import {
  combinedSource,
  defaultMeta,
  jsSnippet,
  parseBundle,
  partSummary,
  serializeBundle,
  type BundlePart,
  type WebBundle,
} from "./bundle"
import { basicMotionBlocks, checkComposition, preValidatePlan } from "./validate"
import { optimizeAsset, resolveFont, suggestAssets, suggestFonts } from "./assets"
import { intentDeepAnalyze } from "./intelligence"
import {
  backgroundGenerate,
  copyGenerate,
  iconGenerate,
  subtitleGenerate,
} from "./content"
import { keyframeSnippet, presetForBeat, presetSnippet, textAnimationSnippet } from "./motion-library"
import { LayoutEngine, buildCompositionHints } from "./layout-engine"
import type { ElementType, LayoutStrategy } from "./layout-engine"

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

/**
 * The stored `code` is a JSON web bundle. Heuristics that scan "the cut"
 * (review, audits, auto-fix) run on the combined html+css+js source; a
 * legacy Remotion row falls back to the raw string so the failure reads
 * as legacy instead of crashing the scan.
 */
export function analysisSource(code: string): string {
  const p = parseBundle(code)
  if (p.ok && p.bundle) return combinedSource(p.bundle)
  return code
}

/** Loads the current bundle or returns the legacy/empty failure payload. */
function requireBundle(store: CompositionStore):
  | { ok: true; bundle: WebBundle }
  | { ok: false; error: string } {
  const { code } = store.current()
  if (!code) return { ok: false, error: "No bundle yet — use write_composition with html/css/js parts." }
  const p = parseBundle(code)
  if (p.legacy) {
    return {
      ok: false,
      error:
        "Legacy Remotion TSX is on stage — the player no longer mounts it. " +
        "Start a fresh cut with write_composition (html/css/js); do not edit the TSX.",
    }
  }
  if (!p.ok || !p.bundle) {
    return { ok: false, error: `Stored bundle is corrupt (${p.error}). Rewrite it with write_composition.` }
  }
  return { ok: true, bundle: p.bundle }
}

const PART = z.enum(["html", "css", "js"])

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
        "Load the web-motion documentation for one topic. This is the reference " +
        "for the exact bundle runtime in the sandbox — the helpers are fixed, so " +
        "working from memory produces plausible code that does not render. Load a skill BEFORE " +
        "writing the code it covers, not when something is already broken. Design " +
        "skills (taste, not API): creative-direction, kinetic-typography, " +
        "cinematic-motion, layout-composition, charts-data-viz, spring-physics, " +
        "messaging-chat-ui, social-media-formats — load creative-direction once per " +
        "new full-path cut, the others when the beat needs them (see its §5 routing " +
        "table). Example skills (complete working cuts to imitate, never copy " +
        "verbatim): example-typewriter-highlight, example-word-carousel, " +
        "example-text-rotation, example-histogram, example-gold-price-chart, " +
        "example-progress-bar, example-animated-shapes, example-falling-spheres, " +
        "example-lottie. Prefer an example skill whose mechanic matches the " +
        "brief (chart example for a chart brief) — a wrong guess costs a full " +
        "model call plus thousands of context tokens on every later call — " +
        "but nothing is forbidden: any skill may load when the beat genuinely " +
        "needs it. API skills: " +
        "timing, sequencing, runtime-helpers. Then as needed: animations, " +
        "transitions, effects, shapes, audio, images, video, fonts, text, parameters, " +
        "multi-scene-video, spring, interpolate, easing, code-syntax, " +
        "shapes-paths, noise-grain, captions.",
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
        // Example skills are complete working cuts — the model imitates their
        // structure, so the first 10k chars carry the signal and the rest is
        // weight that slows every later model call. API/design skills keep
        // the full 24k reference.
        const budget = skill.id.startsWith("example-") ? 10_000 : 24_000
        return { id: skill.id, content: skill.content.slice(0, budget) }
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
        "Read the current bundle (html + css + js parts). Read before you edit — " +
        "an edit whose find string is guessed will not apply. Pass part to " +
        "read one part only and save context.",
      inputSchema: z.object({
        part: PART.optional().describe("One part only: html, css, or js. Omit for all three."),
      }),
      execute: async ({ part }) => {
        const { plan, version } = store.current()
        const loaded = requireBundle(store)
        if (!loaded.ok) {
          return { version, plan, parts: null, error: loaded.error }
        }
        const b = loaded.bundle
        const summary = partSummary(b)
        const all = { html: b.html, css: b.css, js: b.js }
        return {
          version,
          plan,
          meta: b.meta,
          parts: part ? { [part]: all[part] } : all,
          summary,
          snippet: jsSnippet(b, 12),
        }
      },
    }),

    write_composition: tool({
      description:
        "Write the WHOLE bundle in one call: html (markup for #wm-stage) + css " +
        "(scoped stylesheet) + js (a script defining function render(t, ctx), " +
        "optionally function init(ctx)). Build the complete scene here — every " +
        "element, every beat. Do NOT dribble it out in chunks. Use edit_file " +
        "for small changes to a bundle that already exists. " +
        "This tool is the ONLY place bundle code may ever appear — never write " +
        "markup, CSS, JS, or code fences in chat text. If you catch yourself typing code " +
        "outside this call, stop and put it here instead. " +
        "Motion contract: every move is a pure function of t (seconds) via the ctx " +
        "helpers (ctx.interpolate, ctx.Easing, ctx.spring, ctx.rand). No imports, " +
        "no exports, no <script> tags, no wall-clock time, no event handlers, " +
        "no <!-- or <script sequences even in comments. Keep it minimal: match " +
        "complexity to the brief — a simple cut is a few elements and a short " +
        "render(), never a framework.",
      inputSchema: z.object({
        html: z
          .string()
          .describe("Inner markup mounted into #wm-stage. No <html>/<head>/<body>, no <script> tags."),
        css: z
          .string()
          .describe("Scoped stylesheet. Cite Google Font families by name — the runtime loads them."),
        js: z
          .string()
          .describe("Plain script defining function render(t, ctx) (and optionally function init(ctx)). Helpers arrive on ctx."),
        duration: z
          .number()
          .min(2)
          .max(30)
          .optional()
          .describe("Cut length in seconds. Defaults to 5."),
        title: z.string().max(120).optional().describe("Short name for the cut."),
      }),
      execute: async ({ html, css, js, duration, title }) => {
        // Mechanical repairs run INLINE on every write, so a turn that
        // needed write → validate → auto_fix_code → rewrite now lands in
        // one call. Same pure helpers auto_fix_code uses — no drift.
        const bundle: WebBundle = {
          version: 1,
          html: html ?? "",
          css: css ?? "",
          js: js ?? "",
          meta: defaultMeta({
            ...(title ? { title } : {}),
            ...(typeof duration === "number" ? { duration } : {}),
          }),
        }
        const repaired = autoRepairBundle(bundle)
        const code = serializeBundle(repaired.bundle)
        const checks = checkComposition(code)
        const errors = checks.filter((c) => c.level === "error")
        // Refuse a bundle that cannot run, with the reason. The alternative
        // is storing broken source and discovering it at render time.
        if (errors.length > 0) {
          return {
            ok: false,
            rejected: true,
            errors: errors.map((e) => e.message),
            warnings: checks.filter((c) => c.level === "warn").map((w) => w.message),
            ...(repaired.applied.length > 0 ? { autoRepaired: repaired.applied } : {}),
          }
        }
        // Basic-motion gate: correct code that reads as a slide deck is
        // refused with the fix, not stored.
        const basicBlocks = basicMotionBlocks(checks)
        if (basicBlocks.length > 0) {
          return {
            ok: false,
            rejected: true,
            errors: basicBlocks,
            warnings: checks.filter((c) => c.level === "warn").map((w) => w.message),
            ...(repaired.applied.length > 0 ? { autoRepaired: repaired.applied } : {}),
            note: "Nothing was saved — add the named motion craft and call write_composition again. Do not paste code into chat.",
          }
        }
        const n = store.write(code, { bumpVersion: true })
        return {
          ok: true,
          version: n,
          parts: partSummary(repaired.bundle),
          snippet: jsSnippet(repaired.bundle, 12),
          warnings: checks.filter((c) => c.level === "warn").map((w) => w.message),
          ...(repaired.applied.length > 0 ? { autoRepaired: repaired.applied } : {}),
        }
      },
    }),

    edit_file: tool({
      description:
        "Change a small, specific part of the existing bundle. One note touches " +
        "one thing. Each op names its part (html, css, or js) and its `find` must be " +
        "copied EXACTLY from read_file, including indentation — it is a literal " +
        "string match. When an op misses, the result names the closest real lines " +
        "(suggestion): retry from those instead of re-guessing. Use " +
        "write_composition instead only for a genuine rewrite. For multi-part " +
        "changes (retiming several beats, several small fixes) use bulk_edit.",
      inputSchema: z.object({
        ops: z
          .array(
            z.object({
              part: PART.describe("Which bundle part this op edits: html, css, or js."),
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
        "Apply a batch of related edits to the bundle in one call — retiming " +
        "several beats, fixing the same mistake in many places. Each op names " +
        "its part (html, css, or js) and its `find` is an exact literal match from " +
        "read_file; ops apply in order, the whole batch validates once, and " +
        "the version bumps once. Any op may match MANY occurrences to " +
        "rename/replace across the part (that is the difference from edit_file, " +
        "which requires a unique match). Atomic: one missed op saves nothing, " +
        "but the failure names the closest real lines (suggestion) — retry the " +
        "batch from those. Prefer this over five sequential " +
        "edit_file calls.",
      inputSchema: z.object({
        ops: z
          .array(
            z.object({
              part: PART.describe("Which bundle part this op edits: html, css, or js."),
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
              const fonts = (report as { fonts?: Array<{ family: string; ok: boolean }> }).fonts ?? []
              const fellBack = fonts.filter((f) => !f.ok).map((f) => f.family)
              return {
                status: "verified",
                version: report.version,
                ...(report.message ? { detail: report.message } : {}),
                findings: report.findings,
                ...(fonts.length > 0 ? { fonts } : {}),
                hint:
                  fellBack.length > 0
                    ? `Renders BUT these families fell back (never loaded — showing fallback type): ${fellBack.join(", ")}. A user-named font on fallback is NOT done: resolve it with font_resolve and re-verify.`
                    : report.findings.length > 0
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
        "overlapping elements, off-canvas overflow, single-beat plans, " +
        "plan-vs-code drift (promised pulse/stagger/highlight missing), decor " +
        "placed outside its container, and data that contradicts a rising brief.",
      inputSchema: z.object({
        focus: z
          .string()
          .optional()
          .describe("Optional: a specific concern, e.g. 'the middle beat feels flat'."),
      }),
      execute: async ({ focus }) => {
        const { code, plan, version } = store.current()
        if (!code) return { error: "Nothing to review yet." }
        const loaded = requireBundle(store)
        if (!loaded.ok) return { error: loaded.error }
        const src = combinedSource(loaded.bundle)

        const findings: string[] = []
        const frames = (src.match(/interpolate\(\s*(f|t)\b[^[]*\[[^\]]*\]/g) ?? []).length
        const springs = (src.match(/\bspring\(/g) ?? []).length
        const easings = (src.match(/Easing\./g) ?? []).length
        const transforms = (src.match(/translate|scale|rotate|skew/gi) ?? []).length
        const opacities = (src.match(/opacity/gi) ?? []).length
        const staggers = (src.match(/delay|offset|stagger\w*|index\s*\*|\bi\s*\*\s*\w+/gi) ?? []).length
        const maps = (src.match(/\.map\(|for\s*\(|data-repeat/gi) ?? []).length

        // NOTE: springs count as easing — a cut landing everything on spring()
        // with plain clamps is organic, not robotic. Only flag linear when
        // there is neither Easing nor spring.

        if (frames > 0 && easings === 0 && springs === 0) {
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
        while ((m = posRe.exec(src)) !== null) {
          const window = src.slice(m.index, m.index + 500)
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
        for (const m of src.matchAll(/interpolate\(\s*frame\s*,\s*\[([^\]]*)\]\s*,\s*\[([^\]]*)\]/g)) {
          const outs = (m[2] ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
          if (outs.length === 0) continue
          const peak = Math.max(...outs.map((n) => Math.abs(n)))
          const ctx = src.slice(Math.max(0, (m.index ?? 0) - 220), (m.index ?? 0) + 120)
          if (/translate/i.test(ctx) && peak > 1920) {
            findings.push(
              `translate range reaches ${peak}px — past the 1920px canvas edge. ` +
                `Only fix if the element never appears on screen.`
            )
            break
          }
        }

        // --- Plan-vs-code drift: every beat's promised motion must exist ----
        // A plan that promises a pulse the code never implements is a lie the
        // validator cannot see. Each signal below is a promise the plan makes
        // and the exact code pattern that keeps it.
        if (plan && plan.beats.length > 0) {
          const beatText = plan.beats.map((b) => `f${b.from}-${b.to}: ${b.what}`).join("\n")
          const drift: Array<{ re: RegExp; need: RegExp; fix: string }> = [
            {
              re: /breath|pulse|pulsing|idle|drift|alive|heartbeat/i,
              need: /Math\.(sin|cos)\s*\(/,
              fix: "it promises idle life (pulse/breathing) but no t-driven drift exists. Add a deterministic Math.sin(t * 2.4) drift of 2-4px after the landing.",
            },
            {
              re: /stagger|cascade|one by one|each \w+ in turn/i,
              need: /(?:index|i)\s*\*\s*\d|STAGGER|staggerStart/i,
              fix: "it promises staggered entrances but no index-based offset exists. Offset each start frame (e.g. 12 + i * 6).",
            },
            {
              re: /spring|bounce|overshoot|settle|elastic/i,
              need: /\bspring\s*\(/,
              fix: "it promises spring motion but no spring() call exists. Land at least the hero element with a spring.",
            },
            {
              re: /highlight/i,
              need: /highlight/i,
              fix: "it promises a highlight but no highlight layer exists. Add the marked layer with a spring scaleX reveal.",
            },
          ]
          for (const { re, need, fix } of drift) {
            if (re.test(beatText) && !need.test(src)) {
              findings.push(`Plan-vs-code drift: the plan promises motion that the code never implements — ${fix}`)
            }
          }
        }

        // Decor placed outside its own container: absolute + top/bottom at or
        // past 100% renders as a floating line or a lost element. Observed
        // live as a "baseline" hovering above its chart.
        {
          const outside = /position:\s*['"]absolute['"][\s\S]{0,800}?(?:bottom|top):\s*['"]?(?:calc\(\s*100%|100%)/i.exec(code)
          if (outside) {
            findings.push(
              "An absolutely-positioned element sits at top/bottom 100% (or more) of its container — " +
                "it renders OUTSIDE, as a floating line or a lost element. Anchor decor to the content " +
                "edge (e.g. the bars' zero line above the label padding), never to 100%."
            )
          }
        }

        // Data that contradicts a rising brief: invented DATA dipping while the
        // intent/plan says rising/growing/peak reads as a mistake, not noise.
        {
          const trendWords = /ris(e|ing)|grow|peak|ascending|record high/i
          const briefText = `${plan?.intent ?? ""} ${plan?.beats.map((b) => b.what).join(" ") ?? ""}`
          const values = [...src.matchAll(/value:\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))
          if (values.length >= 4 && trendWords.test(briefText)) {
            const dipAt = values.findIndex((v, i) => i > 0 && v < (values[i - 1] ?? 0))
            if (dipAt !== -1) {
              findings.push(
                `The brief promises rising/growing data but the invented DATA dips at index ${dipAt} ` +
                  `(${values[dipAt - 1]} → ${values[dipAt]}). Make the series monotonic unless the brief names a dip — ` +
                  `an unexplained dip reads as an error.`
              )
            }
          }
        }

        // Long cuts that never breathe: the plan runs 120f+ with no
        // frame-driven drift anywhere — after the landings the frame reads as
        // paused footage instead of a living hold.
        {
          const beats = plan?.beats ?? []
          const total = beats.length > 0 ? Math.max(...beats.map((b) => b.to)) : 0
          if (total >= 120 && !/Math\.(sin|cos)\s*\(/.test(src)) {
            findings.push(
              `The cut runs ${total} frames with no idle drift — after the landings the frame freezes. ` +
                `Add 2-4px of deterministic Math.sin(t * 2.4) breathing so the hold stays alive.`
            )
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
        const last = beats.at(-1)?.to ?? 0
        const want = totalFrames ?? last
        return {
          ...check,
          budget:
            want > CANVAS.maxFrames
              ? `Over the ${CANVAS.maxFrames}f cap — tighten the last beat to end at or before it.`
              : `Fits the ${CANVAS.maxFrames}f cap with room to spare.`,
        }
      },
    }),



    auto_fix_code: tool({
      description:
        "Apply confidence-scored repairs to the current bundle, then re-validate. " +
        "High-confidence fixes (Math.random→ctx.rand, page-default font→Unbounded, " +
        "linear interpolate→ctx.Easing.easeOut, missing f binding, missing render) " +
        "apply automatically. Pass it EITHER validate_composition errors OR a browser " +
        "failure message from read_render_report — it understands both. Medium/low-confidence " +
        "findings (overflow, z-conflict, missing spring) return with a preview for approval. " +
        "A genuine rewrite still goes through write_composition.",
      inputSchema: z.object({
        errors: z.array(z.string()).min(1).describe("Error messages from validate_composition, or a browser failure message from read_render_report."),
      }),
      execute: async ({ errors }) => {
        const loaded = requireBundle(store)
        if (!loaded.ok) return { ok: false, error: loaded.error }
        const bundle = { ...loaded.bundle, meta: { ...loaded.bundle.meta } }
        interface Fix {
          issue: string
          fix: string
          confidence: "high" | "medium" | "low"
          preview: { before: string; after: string }
        }
        const applied: Fix[] = []
        const suggested: Fix[] = []

        // --- high-confidence: objective errors, safe to apply ----------------

        // Math.random() outside comments/strings → seeded ctx.rand.
        {
          const stripped = bundle.js
            .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
            .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
            .replace(/`(?:\\.|[^`\\])*`/g, (m) => " ".repeat(m.length))
            .replace(/"(?:\\.|[^"\\])*"/g, (m) => " ".repeat(m.length))
            .replace(/'(?:\\.|[^'\\])*'/g, (m) => " ".repeat(m.length))
          const randomRe = /Math\.random\s*\(\s*\)/g
          let m: RegExpExecArray | null
          let count = 0
          let next = ""
          let lastIdx = 0
          while ((m = randomRe.exec(bundle.js)) !== null) {
            const atPos = stripped.slice(m.index, m.index + m[0].length)
            if (!/^\s+$/.test(atPos)) {
              next += bundle.js.slice(lastIdx, m.index) + "ctx.rand(t.toFixed(3))()"
              lastIdx = m.index + m[0].length
              count++
            }
          }
          if (count > 0) {
            bundle.js = next + bundle.js.slice(lastIdx)
            applied.push({
              issue: `Non-deterministic Math.random() (${count} occurrence${count > 1 ? "s" : ""})`,
              fix: "Replaced with seeded ctx.rand(t) — stable across scrubs and export",
              confidence: "high",
              preview: { before: "Math.random()", after: "ctx.rand(t.toFixed(3))()" },
            })
          }
        }

        // Page-default font stacks → Unbounded (a deliberate face).
        {
          const fontRe = /font-family\s*:\s*['"]?(system-ui|sans-serif|serif|ui-sans-serif|Arial|Helvetica|Inter|Roboto)['"]?/gi
          const matches = [...bundle.css.matchAll(fontRe), ...bundle.js.matchAll(fontRe)]
          if (matches.length > 0) {
            bundle.css = bundle.css.replace(fontRe, "font-family: 'Unbounded', sans-serif")
            bundle.js = bundle.js.replace(fontRe, "font-family: 'Unbounded', sans-serif")
            if (!bundle.meta.fonts?.includes("Unbounded")) {
              bundle.meta.fonts = [...(bundle.meta.fonts ?? []), "Unbounded"]
            }
            applied.push({
              issue: `Page-default font stack (${matches.length} occurrence${matches.length > 1 ? "s" : ""})`,
              fix: "Replaced all with 'Unbounded' (runtime auto-loads it)",
              confidence: "high",
              preview: { before: matches[0]![0].slice(0, 60), after: "font-family: 'Unbounded', sans-serif" },
            })
          }
        }

        // Naked ctx.interpolate (no options) → easeOut. The runtime clamps
        // by default, so only easing is added.
        {
          const { upgraded, count } = applyNakedEasing(bundle.js)
          if (count > 0) {
            bundle.js = upgraded
            applied.push({
              issue: `${count} linear interpolate() call(s)`,
              fix: "Added { easing: ctx.Easing.easeOut }",
              confidence: "high",
              preview: {
                before: "ctx.interpolate(f, [a, b], [c, d])",
                after: "ctx.interpolate(f, [a, b], [c, d], { easing: ctx.Easing.easeOut })",
              },
            })
          }
        }

        // Missing f binding: ctx.interpolate(f, ...) with no frame binding.
        {
          const needsF =
            /ctx\.interpolate\(\s*f\b/.test(bundle.js) &&
            !/ctx\.frame/.test(bundle.js) &&
            !/(?:const|let|var)\s+f\b/.test(bundle.js)
          if (needsF) {
            const m = /function\s+render\s*\([^)]*\)\s*\{/.exec(bundle.js)
            if (m) {
              const at = m.index + m[0].length
              bundle.js = bundle.js.slice(0, at) + "\n  var f = ctx.frame;" + bundle.js.slice(at)
              applied.push({
                issue: "ctx.interpolate(f, ...) reads `f` but no frame binding exists",
                fix: "Added `var f = ctx.frame;` at the top of render()",
                confidence: "high",
                preview: { before: "(no frame binding)", after: "var f = ctx.frame;" },
              })
            }
          }
        }

        // Missing render(t, ctx) entry point — named, never auto-applied.
        {
          const clean = bundle.js
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/[^\n]*/g, "")
          if (!/function\s+render\s*\(/.test(clean)) {
            suggested.push({
              issue: "No render(t, ctx) entry point",
              fix: "Define `function render(t, ctx) { var f = ctx.frame; ... }` setting inline styles from t",
              confidence: "medium",
              preview: { before: "(no render function)", after: "function render(t, ctx) { ... }" },
            })
          }
        }

        // --- medium/low-confidence: named for approval, never auto-applied ---
        const context = [
          ...errors,
          ...checkComposition(serializeBundle(bundle))
            .filter((c) => c.level === "warn")
            .map((c) => c.message),
        ].join("\n")
        if (/overflow|off-canvas|outside the .* canvas/i.test(context)) {
          suggested.push({
            issue: "Layout overflow",
            fix: "Scale the element down or pull its range inside 1920x1080",
            confidence: "medium",
            preview: { before: "element outside canvas bounds", after: "range inside the safe margin" },
          })
        }
        if (/z-index|zIndex/i.test(context)) {
          suggested.push({
            issue: "z-index conflict",
            fix: "Separate layers: background=1, content=10, overlays=20, UI=40",
            confidence: "medium",
            preview: { before: "shared zIndex", after: "distinct zIndex per layer" },
          })
        }
        if (/spring|settle|landing/i.test(context) && /\bspring\(/.test(combinedSource(bundle)) === false) {
          suggested.push({
            issue: "Nothing settles",
            fix: "Arrive with ctx.spring() or an overshoot preset (load_motion_preset settle)",
            confidence: "low",
            preview: { before: "ease to a stop", after: "spring landing with overshoot" },
          })
        }

        const checks = checkComposition(serializeBundle(bundle))
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
        const n = store.write(serializeBundle(bundle), { bumpVersion: true })
        return { ok: true, version: n, parts: partSummary(bundle), applied, suggested }
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
        "registry already in scope. Returns the exact fontFamily snippet to use. " +
        "When the user names a style in words (handwritten, mono, serif), pass " +
        "it as style — a user-named style ALWAYS overrides the mood pairing, " +
        "and the result carries the sizing compensation (scripts run small).",
      inputSchema: z.object({
        mood: z.string().default("modern").describe("modern, playful, elegant, bold, or tech."),
        brand: z.string().optional(),
        style: z.string().optional().describe("User's own style words, e.g. 'handwritten', 'mono code', 'elegant serif'."),
      }),
      execute: async ({ mood, brand, style }) => suggestFonts(mood, brand, style),
    }),

    font_resolve: tool({
      description:
        "Ground truth for a font name: normalises 'handwritten', 'Caveat', " +
        "'playfair display' etc. to the exact Fonts.<key>.family snippet and " +
        "says whether it is curated or loaded on demand. Call it the moment a " +
        "brief names a font or style — never guess the key from memory, and " +
        "never claim a font change worked without a verified render showing it.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Font or style name, e.g. 'handwritten', 'caveat', 'Playfair Display'."),
      }),
      execute: async ({ name }) => resolveFont(name),
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
        if (/code|coding|terminal|snippet|api|sdk|developer/i.test(b)) examples.push("code-syntax")
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
                  "Load the FIRST example skill before writing code — it is a complete working cut. Imitate its structure/timing/easing, then convert to bundle scope (html markup, scoped CSS, render(t, ctx) with ctx.* helpers, Google Fonts by family name).",
              }
            : {}),
        }
      },
    }),








    // --- Phase 3: orchestration (§1.2, §5) ---------------------------------





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




    subtitle_generate: tool({
      description:
        "Turn frame cues into caption windows rendered as positioned divs toggled by t. " +
        "Auto-transcription is not connected — cues come from the script.",
      inputSchema: z.object({
        cues: z.array(z.object({ at: z.number().int().min(0), text: z.string() })).min(1),
        language: z.string().default("en"),
      }),
      execute: async ({ cues, language }) => subtitleGenerate(cues, language),
    }),

    icon_generate: tool({
      description:
        "Pick consistent icons for a concept, with an inline-SVG snippet. " +
        "No icon package exists in the sandbox — inline <svg> is the only safe icon.",
      inputSchema: z.object({ concept: z.string() }),
      execute: async ({ concept }) => iconGenerate(concept),
    }),

    background_generate: tool({
      description:
        "Procedural animated background snippet (gradient/noise/grid CSS) in brand " +
        "colors. Driven from t in render() — never wall-clock CSS transitions.",
      inputSchema: z.object({
        style: z.string().describe("gradient, noise, or grid"),
        colors: z.array(z.string()).max(4).optional(),
      }),
      execute: async ({ style, colors }) => backgroundGenerate(style, colors),
    }),

    // --- Phase 4: export & distribution (§2.5) ------------------------------








    // --- Phase 4: collaboration (§2.6) --------------------------------------





    // --- Phase 4: 3D foundation (§7.1) --------------------------------------



    // --- Agent upgrade: motion design system (AGENT_UPGRADE_PLAN Phases 2-3) --
    load_motion_preset: tool({
      description:
        "Load a professional motion preset (timing + easing + transform snippet) for " +
        "a beat type. Returns ready-to-paste code for render(t, ctx) — copy the numbers " +
        "instead of inventing curves. REQUIRED before writing any ctx.spring() or " +
        "ctx.Easing.bezier(): never hand-roll timing values. " +
        "Original five: entrance, transition, settle, exit, emphasis. " +
        "Extended beat vocabulary: reveal (clip-path wipe, not a fade), " +
        "anticipation (pre-movement compress), cascade (list stagger), " +
        "text-cascade (per-char spring), counter / counter-motion (opposite movement = depth), " +
        "hold / pause (rest beat), parallax (multi-layer speed), morph / blend (shape/colour transition). " +
        "Pass text + textStyle for an animated headline snippet on top of the preset " +
        "(textStyle counter = Stargazer odometer 0→N for stats/milestones).",
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
        textStyle: z.enum(["charByChar", "wordByWord", "maskReveal", "counter"]).default("charByChar"),
      }),
      execute: async ({ beatType, startFrame, text, textStyle }) => {
        const { id, preset } = presetForBeat(beatType)
        const end = startFrame + preset.duration
        const mid = Math.round(startFrame + preset.duration * 0.4)
        return {
          id,
          preset,
          snippet: presetSnippet(id, startFrame),
          textSnippet: text ? textAnimationSnippet(textStyle, text, startFrame) : null,
          // Keyframes-first: every beat ships a 3-stop sequence, not a
          // single A→B move. Anticipation → action → settle is what makes
          // motion read as designed rather than slid.
          keyframes: keyframeSnippet("beat", [startFrame, mid, end], [0, 1.06, 1]),
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
 * Mechanical repairs applied inline on every write_composition,
 * so the model never spends a paced round-trip on what is deterministic.
 * Operates per bundle part; same helpers auto_fix_code uses — no drift.
 */
export function autoRepairBundle(bundle: WebBundle): { bundle: WebBundle; applied: string[] } {
  const next: WebBundle = { ...bundle, meta: { ...bundle.meta } }
  const applied: string[] = []

  // Page-default font stacks → Unbounded, in every part.
  {
    const fontRe = /font-family\s*:\s*['"]?(system-ui|sans-serif|serif|ui-sans-serif|Arial|Helvetica|Inter|Roboto)['"]?/gi
    const matches = [...next.css.matchAll(fontRe), ...next.js.matchAll(fontRe), ...next.html.matchAll(fontRe)]
    if (matches.length > 0) {
      next.css = next.css.replace(fontRe, "font-family: 'Unbounded', sans-serif")
      next.js = next.js.replace(fontRe, "font-family: 'Unbounded', sans-serif")
      next.html = next.html.replace(fontRe, "font-family: 'Unbounded', sans-serif")
      if (!next.meta.fonts?.includes("Unbounded")) {
        next.meta.fonts = [...(next.meta.fonts ?? []), "Unbounded"]
      }
      applied.push(`page-default font → 'Unbounded' (${matches.length}x)`)
    }
  }

  // Non-deterministic Math.random() outside comments/strings → ctx.rand(t).
  {
    const stripped = next.js
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
      while ((match = randomRe.exec(next.js)) !== null) {
        const atPos = stripped.slice(match.index, match.index + match[0].length)
        if (!/^\s+$/.test(atPos)) {
          rebuilt += next.js.slice(lastIdx, match.index) + "ctx.rand(t.toFixed(3))()"
          lastIdx = match.index + match[0].length
          count++
        }
      }
      if (count > 0) {
        next.js = rebuilt + next.js.slice(lastIdx)
        applied.push(`Math.random → ctx.rand(t) (${count}x)`)
      }
    }
  }

  const naked = applyNakedEasing(next.js)
  if (naked.count > 0) {
    next.js = naked.upgraded
    applied.push(`${naked.count}x linear interpolate → ctx.Easing.easeOut`)
  }

  // Missing f binding for ctx.interpolate(f, ...).
  {
    const needsF =
      /ctx\.interpolate\(\s*f\b/.test(next.js) &&
      !/ctx\.frame/.test(next.js) &&
      !/(?:const|let|var)\s+f\b/.test(next.js)
    if (needsF) {
      const m = /function\s+render\s*\([^)]*\)\s*\{/.exec(next.js)
      if (m) {
        const at = m.index + m[0].length
        next.js = next.js.slice(0, at) + "\n  var f = ctx.frame;" + next.js.slice(at)
        applied.push("frame binding (var f = ctx.frame)")
      }
    }
  }

  return { bundle: next, applied }
}

/** Legacy alias — repairs a serialized bundle string. */
export function autoRepairInline(code: string): { code: string; applied: string[] } {
  const p = parseBundle(code)
  if (!p.ok || !p.bundle) return { code, applied: [] }
  const r = autoRepairBundle(p.bundle)
  return { code: serializeBundle(r.bundle), applied: r.applied }
}

/**
 * Shared edit engine behind edit_file (unique-match, partial apply) and
 * bulk_edit (all-occurrences per op, atomic batch). Each op names the bundle
 * part it edits; matching is literal within that part.
 *
 * edit_file tolerates a failed op and saves the rest — one note touches
 * one thing. bulk_edit is atomic: if ANY op fails or the result has
 * errors, nothing is saved and the agent retries the batch.
 */
async function applyEditOps(
  store: CompositionStore,
  ops: Array<{ part: BundlePart; find: string; replace: string; all?: boolean }>,
  opts: { allowPartial: boolean }
): Promise<unknown> {
  const loaded = requireBundle(store)
  if (!loaded.ok) {
    return { ok: false, error: loaded.error }
  }
  const parts: Record<BundlePart, string> = {
    html: loaded.bundle.html,
    css: loaded.bundle.css,
    js: loaded.bundle.js,
  }

  const applied: Array<{ part: BundlePart; find: string; count: number }> = []
  const failed: Array<{ part?: BundlePart; find: string; reason: string; suggestion?: Array<{ line: number; text: string }> }> = []

  for (const op of ops) {
    if (op.part !== "html" && op.part !== "css" && op.part !== "js") {
      failed.push({ find: String(op.find ?? "").slice(0, 80), reason: "`part` must be html, css, or js." })
      continue
    }
    if (op.find === "") {
      failed.push({ part: op.part, find: "<empty>", reason: "`find` cannot be empty." })
      continue
    }
    if (op.replace === op.find) {
      // A no-op edit changes nothing but burns a turn: refuse it with the
      // reason instead of "applying" it.
      failed.push({
        part: op.part,
        find: op.find.slice(0, 80),
        reason: "No-op: `find` and `replace` are identical — nothing would change. Send only ops that change text.",
      })
      continue
    }
    const text = parts[op.part]
    const occurrences = text.split(op.find).length - 1
    if (occurrences === 0) {
      failed.push({
        part: op.part,
        find: op.find.slice(0, 80),
        reason: `No exact match in the ${op.part} part. Copy the text from read_file, whitespace included.`,
        suggestion: suggestCloseMatch(text, op.find),
      })
      continue
    }
    if (occurrences > 1 && !op.all) {
      failed.push({
        part: op.part,
        find: op.find.slice(0, 80),
        reason: `Matches ${occurrences} times in ${op.part} — include more surrounding lines to make it unique, or use bulk_edit with all:true.`,
        suggestion: suggestCloseMatch(text, op.find).slice(0, 1),
      })
      continue
    }
    parts[op.part] = op.all ? text.split(op.find).join(op.replace) : text.replace(op.find, op.replace)
    applied.push({ part: op.part, find: op.find.slice(0, 60), count: occurrences > 1 && op.all ? occurrences : 1 })
  }

  if (applied.length === 0) {
    return { ok: false, applied: 0, failed }
  }

  // bulk_edit is atomic: a failed op poisons the batch, so nothing saves.
  if (!opts.allowPartial && failed.length > 0) {
    return {
      ok: false,
      applied: 0,
      appliedPreview: applied,
      failed,
      note: "bulk_edit is atomic — nothing was saved. Fix the failed ops using their `suggestion` lines and retry the batch.",
    }
  }

  const code = serializeBundle({ ...loaded.bundle, ...parts })
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
  if (/must define function render/i.test(message)) {
    return "The js part has no render(t, ctx). Call read_file with part js, add `function render(t, ctx) { var f = ctx.frame; ... }` with edit_file, then re-preview."
  }
  if (/runtime:/i.test(message)) {
    return "It evaluated but threw while rendering a frame. The message names the failing access — guard it (optional chaining / default, check ctx.el ids exist in the html part) with edit_file on part js, then re-preview."
  }
  return "Fix the named issue with edit_file (naming the right part: html, css, or js), then preview_composition again (new version), then read_render_report."
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
 * High-confidence easing repair shared by auto_fix_code and the inline
 * write path. Only touches ctx.interpolate() calls with exactly
 * two array args and NO options object (they end in `])`) — anything else
 * is left for the model. The runtime clamps by default, so only easing
 * is added.
 */
function applyNakedEasing(code: string): { upgraded: string; count: number } {
  let count = 0
  const upgraded = code.replace(
    /ctx\.interpolate\(\s*[\w$.]+\s*,\s*\[[^\]]*\]\s*,\s*\[[^\]]*\]\)/g,
    (m) => {
      count += 1
      return `${m.slice(0, -1)}, { easing: ctx.Easing.easeOut })`
    }
  )
  return { upgraded, count }
}

/** Mapped lists with no stagger/delay/index-offset still need the human touch. */
function findUnstaggeredMaps(code: string): number {
  const maps = code.match(/\.map\(/g) ?? []
  if (maps.length === 0) return 0
  return /delay|stagger|index\s*[\*\+\-]/.test(code) ? 0 : maps.length
}
