import { STEP_BUDGETS } from "../models"
import { callGateway } from "./gateway-client"
import type { Canvas } from "../artifact"
import { hasDefaultExport } from "../code-block"
import { buildKnowledge } from "../remotion-skills"

/**
 * REPAIRER — fixes a composition that will not run.
 *
 * Given the real error (a TypeScript diagnostic from the transpiler, a
 * render-time throw, or a lint finding) it returns a corrected file.
 * Cold temperature, no design brief, no creativity: this agent is not
 * allowed to restyle while it fixes. Whatever the fix, the cut the user
 * is looking at must survive it.
 */
 
const REPAIR_SYSTEM = [
  "You are the REPAIRER. A Remotion composition does not run. Fix it.",
  "",
  "ABSOLUTE RULES",
  "- Fix ONLY what is broken. Do not restyle, retime, recopy, or \"improve\"",
  "  anything. The user's cut must survive this pass looking identical.",
  "- Do not change visible text, colours, layout or timing unless the error",
  "  is in that exact thing.",
  "- Keep the same component names, the same structure, the same canvas.",
  "",
  "Output ONLY raw JSON, no fences:",
  '{reply, code: "<the full corrected file as a TypeScript string>"}',
  "reply: one short sentence in the user's language, or an empty string.",
  "",
  "COMMON CAUSES",
  "- Unbalanced braces, a truncated file, a JSX tag never closed.",
  "- An import of a name that does not exist. Check every name you use",
  "  against the real API before keeping it.",
  "- A hook called outside a component, or conditionally.",
  "- interpolate() without extrapolateLeft/Right: \"clamp\" — add them.",
  "- A Sequence with a negative or zero durationInFrames.",
  "- window/document/navigator at module scope — move it into an effect.",
  "- Math.random() — replace with random(\"some-seed\") from remotion.",
  "- A division by durationInFrames that can be 0 — guard it.",
  "- Reading past the end of an array — add a fallback value.",
  "- A font family or image path that does not exist — use a real one.",
].join("\n")

export async function runRepairer(args: {
  model: string
  apiKey: string
  code: string
  /** Real diagnostics from the transpiler, the render, or the linter. */
  errors: string[]
  canvas?: Canvas
  brief?: string
  stream?: boolean
  onToken?: (tokens: number) => void
  onDelta?: (delta: string) => void
  fallbackModels?: string[]
  onModel?: (model: string) => void
}): Promise<{ code: string; reply: string; fixed: boolean }> {
  const parts = [
    `ERRORS\n${args.errors.slice(0, 12).map((e) => `- ${e}`).join("\n")}`,
    args.canvas
      ? `CANVAS\n${args.canvas.width}x${args.canvas.height} · ${args.canvas.durationInFrames} frames @ ${args.canvas.fps}fps`
      : "",
    args.brief ? `ORIGINAL BRIEF\n"${args.brief}"` : "",
    `FILE\n${args.code}`,
    "Return the corrected file.",
  ].filter(Boolean)

  try {
    const { result, model: served } = await callGateway<unknown>({
      model: args.model,
      apiKey: args.apiKey,
      // Repair writes Remotion too, so it gets the reference — but the
      // brief selects a narrow slice, and a 12 KB API summary is not what
      // fixes a missing brace.
      system: `${REPAIR_SYSTEM}\n\n${buildKnowledge(args.brief ?? args.code.slice(0, 200))}`,
      user: parts.join("\n\n"),
      budget: STEP_BUDGETS.repairer,
      opts: {
        stream: args.stream,
        onToken: args.onToken,
        onDelta: args.onDelta,
        fallbackModels: args.fallbackModels,
      },
    })
    args.onModel?.(served)
    let r = (result ?? {}) as Record<string, unknown>
    for (const key of ["result", "data", "output"]) {
      const inner = r[key]
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        r = inner as Record<string, unknown>
        break
      }
    }
    const code = typeof r.code === "string" ? r.code.trim() : ""
    if (code.length > 40 && hasDefaultExport(code)) {
      const reply = typeof r.reply === "string" ? r.reply.trim().slice(0, 200) : ""
      return { code, reply, fixed: true }
    }
  } catch {
    /* fall through */
  }
  return { code: args.code, reply: "", fixed: false }
}
