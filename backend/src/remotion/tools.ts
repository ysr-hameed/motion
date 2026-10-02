import { tool, type ToolSet } from "ai"
import { z } from "zod"
import { findSkill, SKILL_IDS } from "./skills.generated"
import type { Chat } from "../chat"
import type { CompositionStore } from "./store"
import { checkComposition } from "./validate"

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
export function buildTools(store: CompositionStore, _agent?: Chat): ToolSet {
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
        "source validates — this is what the user actually watches, so a preview of " +
        "broken code wastes their time and hides the real cut.",
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
        return { ok: true, version: published, plan, bytes: code.length }
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
  }
}
