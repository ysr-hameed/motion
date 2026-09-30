import { STEP_BUDGETS } from "../models"
import { callGateway, type GatewayImage } from "./gateway-client"
import { CANVAS, type AspectFormat, type Canvas } from "../artifact"
import type { Direction } from "./director"
import { buildKnowledge } from "../remotion-skills"
import { contractsFor, fontRules, DIRECTION_RULES } from "../remotion-guide"
import { fontCatalogue } from "../font-catalogue.generated"

/**
 * CHOREOGRAPHER — writes the composition.
 *
 * This agent replaced a writer that could only pick from 18 layer types
 * and 80 properties. It now writes arbitrary Remotion, so the ceiling is
 * the API, not our schema.
 *
 * Its knowledge is Remotion's own, selected per brief, because the prompt
 * used to carry a hand-written API summary that had drifted from the
 * runtime. What this file adds is the part documentation cannot know:
 * which canvas, how long, and what the user actually asked for.
 */

function formatName(a: Canvas): AspectFormat {
  const r = a.width / a.height
  if (r > 1.2) return "16:9"
  if (r < 0.85) return "9:16"
  return "1:1"
}

export async function runChoreographer(args: {
  model: string
  apiKey: string
  brief: string
  direction: Direction
  canvas: Canvas
  /** Previous composition, for a rewrite (never for a first cut). */
  previous?: string
  previousNote?: string
  memoryHint?: string
  stream?: boolean
  onToken?: (tokens: number) => void
  onDelta?: (delta: string) => void
  images?: GatewayImage[]
  fallbackModels?: string[]
  onModel?: (model: string) => void
}): Promise<string> {
  const d = args.direction
  const { width, height } = CANVAS[d.format]
  const parts: string[] = []
 
  parts.push(
    `BRIEF\n"${args.brief}"\n\nDIRECTION\nconcept: ${d.concept}\nbeats:\n${d.beats
      .map((b, i) => `  ${i + 1}. ${b}`)
      .join("\n")}\nsignature moment: ${d.signature}\npalette: bg ${d.palette.bg}, hero ${d.palette.hero}, accent ${d.palette.accent}`
  )

  if (args.previous) {
    parts.push(
      `EXISTING COMPOSITION\nYou are changing this. Keep what still works.\n\n${args.previous}`
    )
    if (args.previousNote) parts.push(`THE REQUESTED CHANGE\n${args.previousNote}`)
  }

  parts.push(`Stage is ${formatName(args.canvas)} — ${width}x${height}.`)
  parts.push(contractsFor({ ...args.canvas, width, height }))
  parts.push(fontRules(fontCatalogue()))
  parts.push(DIRECTION_RULES)
  if (args.memoryHint) parts.push(`HOUSE DIRECTION\n${args.memoryHint}`)
  if (args.images?.length)
    parts.push(
      `REFERENCE IMAGES\n${args.images.length} attached. Study them and match the subject, palette and composition.`
    )

  parts.push("NOW WRITE THE FILE. TypeScript + JSX only, no commentary.")

  const { result, model: served } = await callGateway<string>({
    model: args.model,
    apiKey: args.apiKey,
    system: buildKnowledge(args.brief),
    user: parts.join("\n\n"),
    budget: STEP_BUDGETS.choreographer,
    opts: {
      stream: args.stream,
      onToken: args.onToken,
      onDelta: args.onDelta,
      images: args.images,
      fallbackModels: args.fallbackModels,
      // Code, not JSON — see CallOpts.raw.
      raw: true,
    },
  })

  args.onModel?.(served)
  return typeof result === "string" ? result : String(result ?? "")
}
