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
import { applyTemplate, TEMPLATES } from "./templates"
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
import { LayoutEngine } from "./layout-engine"
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

/**
 * Builds the tool set for one conversation.
 *
 * Every tool is scoped to a single composition, so none of them take a project
 * or file id — there is exactly one cut per conversation, and making the model
 * carry an id it could get wrong was a reliable source of mistakes.
 */
export function buildTools(store: CompositionStore, agent?: Chat): ToolSet {
  return {
    load_skill: tool({
      description:
        "Load the Remotion documentation for one topic. This is the reference for " +
        "the exact Remotion version installed here — the API moves, so working from " +
        "memory produces plausible code that does not render. Load a skill BEFORE " +
        "writing the code it covers, not when something is already broken. Always " +
        "worth loading: timing, sequencing, compositions. Then as needed: animations, " +
        "transitions, effects, shapes, audio, images, video, fonts, text, parameters, " +
        "multi-scene-video, spring, interpolate, easing.",
      inputSchema: z.object({
        id: z.enum(SKILL_IDS as [string, ...string[]]).describe("The skill id to load."),
      }),
      execute: async ({ id }) => {
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
        "in view. Use edit_file for small changes to a composition that already exists.",
      inputSchema: z.object({
        code: z
          .string()
          .describe("The complete TSX source of the composition, imports included."),
      }),
      execute: async ({ code }) => {
        const checks = checkComposition(code)
        const errors = checks.filter((c) => c.level === "error")
        // Refuse a file that cannot run, with the reason. The alternative is
        // storing broken source and discovering it at render time.
        if (errors.length > 0) {
          return {
            ok: false,
            rejected: true,
            errors: errors.map((e) => e.message),
            warnings: checks.filter((c) => c.level === "warn").map((w) => w.message),
          }
        }
        const n = store.write(code, { bumpVersion: true })
        return {
          ok: true,
          version: n,
          warnings: checks.filter((c) => c.level === "warn").map((w) => w.message),
        }
      },
    }),

    edit_file: tool({
      description:
        "Change a small, specific part of the existing composition. One note touches " +
        "one thing. Each op's `find` must be copied EXACTLY from read_file, " +
        "including indentation — it is a literal string match, and a near miss is " +
        "reported back as unapplied rather than silently ignored. Use write_composition " +
        "instead only for a genuine rewrite.",
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
      execute: async ({ ops }) => {
        let code = store.current().code
        if (!code) {
          return { ok: false, error: "There is no composition yet — use write_composition." }
        }

        const applied: string[] = []
        const failed: Array<{ find: string; reason: string }> = []

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
            })
            continue
          }
          if (occurrences > 1) {
            failed.push({
              find: op.find.slice(0, 80),
              reason: `Matches ${occurrences} times — include more surrounding lines to make it unique.`,
            })
            continue
          }
          code = code.replace(op.find, op.replace)
          applied.push(op.find.slice(0, 60))
        }

        if (applied.length === 0) {
          return { ok: false, applied: 0, failed }
        }

        const checks = checkComposition(code)
        const errors = checks.filter((c) => c.level === "error")
        if (errors.length > 0) {
          return {
            ok: false,
            applied: applied.length,
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
          failed,
          warnings: checks.filter((c) => c.level === "warn").map((w) => w.message),
        }
      },
    }),

    validate_composition: tool({
      description:
        "Run the correctness checks over the current source. Call after any change. " +
        "Returns errors that would stop it rendering and warnings about things that " +
        "usually mean a blank frame or a non-deterministic render.",
      inputSchema: z.object({}),
      execute: async () => {
        const { code, version } = store.current()
        if (!code) return { ok: false, errors: ["No composition to validate."], warnings: [] }
        const checks = checkComposition(code)
        return {
          ok: !checks.some((c) => c.level === "error"),
          version,
          errors: checks.filter((c) => c.level === "error").map((c) => c.message),
          warnings: checks.filter((c) => c.level === "warn").map((c) => c.message),
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
        "browser to compile and mount the cut (waiting costs no model calls). " +
        "verified means it renders and is the ONLY basis for telling the user " +
        "it works. failed carries the exact browser error — fix it and " +
        "re-preview. pending means the browser stayed silent: end the turn " +
        "saying the render is unconfirmed.",
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
            if (report.ok) {
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
            return {
              status: "failed",
              version: report.version,
              message: report.message ?? "The browser failed to render this version.",
              findings: report.findings,
            }
          }
          if (Date.now() >= deadline) {
            return {
              status: "pending",
              version: want,
              hint: "No browser report yet — the tab may be closed or still compiling. End the turn saying the render is UNCONFIRMED; never claim it works.",
            }
          }
          await new Promise((r) => setTimeout(r, 2000))
        }
      },
    }),

    review_motion: tool({
      description:
        "Critique the cut as a motion designer, against what a finished piece needs. " +
        "Call this after a preview and then act on what it finds. It looks for the " +
        "failures that make motion read as cheap: single-property fades, uniform " +
        "linear timing, nothing settling, no hierarchy, a last frame that simply " +
        "stops. Real motion has anticipation, overlap, layered depth, a curve with " +
        "intent, and a landing worth watching. Two or three precise findings beat a " +
        "generic list.",
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
        if (staggers === 0 && (code.match(/\.map\(/g) ?? []).length > 0) {
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
        "High-confidence fixes (Math.random→random, page-default font→Fonts, " +
        "linear interpolate→Easing.bezier) apply automatically. Medium/low-confidence " +
        "findings (missing frame binding, missing default export, overflow, " +
        "z-conflict, missing spring) return with a preview for approval instead. " +
        "A genuine rewrite still goes through write_composition.",
      inputSchema: z.object({
        errors: z.array(z.string()).min(1).describe("Error messages from validate_composition."),
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
        if (/Math\.random\s*\(/.test(code)) {
          code = code.replace(/Math\.random\(\)/g, "random(null)")
          applied.push({
            issue: "Non-deterministic Math.random()",
            fix: "Replaced with Remotion's seeded random(null)",
            confidence: "high",
            preview: { before: "Math.random()", after: "random(null)" },
          })
        }
        {
          const m = /fontFamily:\s*["'](system-ui|sans-serif|serif|ui-sans-serif|Arial|Helvetica)["']/i.exec(code)
          if (m) {
            const face = DISPLAY_FACES[0]
            code = code.replace(m[0], `fontFamily: Fonts.${face}.family`)
            applied.push({
              issue: `Page-default fontFamily "${m[1]}"`,
              fix: `Replaced with Fonts.${face}.family`,
              confidence: "high",
              preview: { before: m[0], after: `fontFamily: Fonts.${face}.family` },
            })
          }
        }
        {
          const { upgraded, count } = applyNakedEasing(code)
          if (count > 0) {
            code = ensureEasingImport(upgraded).code
            applied.push({
              issue: `${count} linear interpolate() call(s)`,
              fix: "Added Easing.bezier(0.16, 1, 0.3, 1)",
              confidence: "high",
              preview: {
                before: "interpolate(frame, [a, b], [c, d])",
                after: "interpolate(frame, [a, b], [c, d], { easing: Easing.bezier(0.16, 1, 0.3, 1) })",
              },
            })
          }
        }

        // --- medium/low-confidence: named for approval, never auto-applied ---
        const context = [
          ...errors,
          ...checkComposition(code)
            .filter((c) => c.level === "warn")
            .map((c) => c.message),
        ].join("\n")
        if (/frame variable|useCurrentFrame|needs a frame/i.test(context) && !/useCurrentFrame\(\)/.test(code)) {
          suggested.push({
            issue: "interpolate() reads `frame` with no frame binding",
            fix: "Add `const frame = useCurrentFrame();` inside the component (and import useCurrentFrame from remotion)",
            confidence: "medium",
            preview: { before: "(no frame binding)", after: "const frame = useCurrentFrame();" },
          })
        }
        if (/default export/i.test(context)) {
          suggested.push({
            issue: "Missing default export",
            fix: "Append `export default <TopLevelComponent>;` matching the component name",
            confidence: "medium",
            preview: { before: "(no default export)", after: "export default MyCut;" },
          })
        }
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

    template_apply_intelligent: tool({
      description:
        "Apply one of the 10 professional templates with smart customization: " +
        "structure, context swap, retiming, export guidance. Returns a SPEC — " +
        "turn it into a composition with plan_motion + write_composition. " +
        "Template ids: product-reveal, social-ad, logo-animation, explainer-intro, " +
        "event-promo, tutorial-intro, app-demo, brand-story, quote-card, podcast-intro.",
      inputSchema: z.object({
        template: z.string().describe("Template id, e.g. 'product-reveal'."),
        product: z.string().optional(),
        brand: z.string().optional(),
        mood: z.string().optional(),
        platform: z.string().optional(),
        seconds: z.number().min(2).max(30).optional(),
      }),
      execute: async ({ template, product, brand, mood, platform, seconds }) =>
        applyTemplate(template, { product, brand, mood, platform, seconds }),
    }),

    template_list: tool({
      description: "List the 10 professional templates with their beats and variants.",
      inputSchema: z.object({}),
      execute: async () => ({
        templates: TEMPLATES.map((t) => ({ id: t.id, name: t.name, variants: t.variants })),
      }),
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
        keyframes: z.array(z.tuple([z.number(), z.number(), z.number()])).default([]),
      }),
      execute: async ({ type, keyframes }) => threeCameraPath(type, keyframes),
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
        "Load a professional motion preset (timing + easing + transform) for a beat " +
        "type. Returns the numbers and a ready-to-paste snippet — copy them instead " +
        "of inventing curves. Beat types: entrance, transition, settle, exit, emphasis. " +
        "Pass text + textStyle (charByChar, wordByWord, maskReveal) for an animated " +
        "headline snippet on top of the preset.",
      inputSchema: z.object({
        beatType: z.enum(["entrance", "transition", "settle", "exit", "emphasis"]),
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
          timing: { duration: preset.duration, easing: preset.easing },
        }
      },
    }),

    layout_plan: tool({
      description:
        "Plan element layout BEFORE writing code. Returns positioned elements with " +
        "conflict detection (overflow/overlap/z-conflict) and ready-to-paste " +
        "absolute-position hints. Pass approximate sizes; the engine clamps to " +
        "the 60px safe margin.",
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
            })
          )
          .min(1)
          .max(20),
        strategy: z.enum(["hierarchy", "grid", "stack"]).default("hierarchy"),
      }),
      execute: async ({ elements, strategy }) => {
        const engine = new LayoutEngine()
        const plan = engine.autoLayout(
          elements.map((e) => ({
            id: e.id,
            type: e.type,
            width: Math.round(e.approximate_size.width),
            height: Math.round(e.approximate_size.height),
          })),
          strategy
        )
        return { layout: plan.elements, conflicts: plan.conflicts, code_hints: plan.codeHints }
      },
    }),

    auto_enhance_motion: tool({
      description:
        "Upgrade linear animations in the current composition to designed motion: " +
        "naked interpolate() calls get Easing.bezier(0.16, 1, 0.3, 1), and mapped " +
        "lists without stagger are reported with the fix. Re-validates after; " +
        "saves only when no new errors appear.",
      inputSchema: z.object({}),
      execute: async () => {
        const { code } = store.current()
        if (!code) return { ok: false, error: "No composition to enhance — use write_composition." }
        const { upgraded: eased, count } = applyNakedEasing(code)
        const withImport = count > 0 ? ensureEasingImport(eased).code : eased
        const staggerSites = findUnstaggeredMaps(withImport)
        if (count === 0 && staggerSites === 0) {
          return {
            ok: true,
            version: store.current().version,
            enhancements: ["Already designed — every interpolation has easing or a spring."],
          }
        }
        const checks = checkComposition(withImport)
        const errors = checks.filter((c) => c.level === "error")
        if (errors.length > 0) {
          return {
            ok: false,
            error: "Auto-enhance would break the code — fix manually instead.",
            errors: errors.map((e) => e.message),
          }
        }
        const enhancements = [
          ...(count > 0 ? [`Added Easing.bezier(0.16, 1, 0.3, 1) to ${count} linear interpolate() call(s)`] : []),
          ...(staggerSites > 0
            ? [
                `${staggerSites} mapped list(s) still need a stagger — offset each item by index * 3 frames (delay: startFrame + i * 3)`,
              ]
            : []),
        ]
        if (count > 0) {
          const n = store.write(withImport, { bumpVersion: true })
          return { ok: true, version: n, enhancements }
        }
        return { ok: true, version: store.current().version, enhancements }
      },
    }),

    verify_no_errors: tool({
      description:
        "Final validation gate — confirms zero errors before preview. Blocking: " +
        "if it returns ok:false, DO NOT call preview_composition; fix the named " +
        "issues with edit_file or write_composition first.",
      inputSchema: z.object({}),
      execute: async () => {
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
      },
    }),
  }
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
      return `${m.slice(0, -1)}, { easing: Easing.bezier(0.16, 1, 0.3, 1) })`
    }
  )
  return { upgraded, count }
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
    case "template_list":
      return { templates: TEMPLATES.map((t) => ({ id: t.id, name: t.name, variants: t.variants })) }
    case "template_apply_intelligent": {
      const ctx = args as { product?: string; brand?: string; mood?: string; platform?: string; seconds?: number }
      return applyTemplate(str(args.template), {
        product: ctx.product,
        brand: ctx.brand,
        mood: ctx.mood,
        platform: ctx.platform,
        seconds: typeof ctx.seconds === "number" ? ctx.seconds : undefined,
      })
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
      const beat = ["entrance", "transition", "settle", "exit", "emphasis"].includes(str(args.beatType))
        ? str(args.beatType)
        : "entrance"
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
