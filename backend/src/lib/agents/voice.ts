import { STEP_BUDGETS } from "../models"
import { callGateway } from "./gateway-client"
import type { Direction } from "./director"
import { summariseComponent } from "../code-block"

/**
 * VOICE — the studio's voice, and its second opinion, in one call.
 *
 * These used to be two agents: a critic that read the finished file and
 * produced review notes, then a talker that wrote one sentence. Measured
 * on a real five-second cut that cost 40 seconds of wall clock for the
 * critic and ~16 for the talker, and produced two disconnected results
 * — review notes that read like a bug tracker, and a sentence bolted on
 * after them.
 *
 * One call that has seen the composition and writes both gives a
 * conversational reply and, optionally, a follow-up the user can take up,
 * in the same voice. The critic's judgement is not lost; it just stops
 * being a separate latency step and a separate register.
 */

const VOICE_SYSTEM = [
  "You are the voice of a motion studio, talking to the person who made the cut with you.",
  "",
  "Output ONLY raw JSON: {reply, offers}",
  "",
  "reply — ONE sentence, under 30 words, warm, like a colleague handing over work.",
  "",
  "  Say what is on screen, in the user's language. Name the thing that landed.",
  "  GOOD: 'The cup fills in one pour, then the logo settles over it.'",
  "",
  "  NEVER",
  "  - mention the pipeline, the model, code, JSON, tokens, versions, the UI or the review",
  "  - list what you did, or summarise the process — it is one sentence, not a report",
  "  - claim a change that is not in the file you were given",
  "  - apologise, hedge, or open with a greeting or a sign-off",
  "",
  "offers — 0 or 1 things you would genuinely put to the user, most impactful first.",
  "  An empty array is the correct and common answer. Never invent one to seem useful.",
  "",
  "  An offer is ONE short sentence, in the user's language, written the way you would",
  "  say it out loud. It must be something the user can see on screen and want changed,",
  "  phrased so it can be answered with one tap.",
  "",
  "  GOOD: 'The pour looks a bit thin — want it fuller?'",
  "  GOOD: 'Still 5 seconds long. Should I lose two?'",
  "  BAD — an internal review note, which is not conversation:",
  "        'The clip-path reveal is linear and does not ease.'",
  "  BAD — vague, or about something the user cannot act on:",
  "        'Consider improving the overall pacing and visual rhythm.'",
  "",
  "  NEVER raise: lack of 3D, lack of particles, a simple palette, few elements, a linear",
  "  timeline, or anything you cannot see in the file. Simplicity is a choice.",
].join("\n")

export interface Voice {
  reply: string
  offers: string[]
}

interface VoicePayload {
  reply?: string
  offers?: string[]
}

function coerce(raw: unknown): VoicePayload {
  if (typeof raw !== "object" || raw === null) return {}
  let r = raw as Record<string, unknown>
  for (const key of ["result", "data", "output", "response"]) {
    const inner = r[key]
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      r = inner as Record<string, unknown>
      break
    }
  }
  const reply = [r.reply, r.message, r.text]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .find(Boolean)
  const offers = Array.isArray(r.offers)
    ? r.offers
        .map((o) => {
          if (typeof o === "string") return o.trim()
          if (o && typeof o === "object") {
            const v = (o as Record<string, unknown>).offer ?? (o as Record<string, unknown>).note
            return typeof v === "string" ? v.trim() : ""
          }
          return ""
        })
        .filter((s) => s.length > 4 && s.length <= 160)
    : []
  return { reply, offers: offers.slice(0, 2) }
}

export async function runVoice(args: {
  model: string
  apiKey: string
  brief: string
  direction: Direction
  /** What actually landed on screen — never the plan, only the result. */
  summary: string
  /** The user's own change request, for a refinement reply. */
  note?: string
  stream?: boolean
  onToken?: (tokens: number) => void
  onDelta?: (delta: string) => void
  fallbackModels?: string[]
  onModel?: (model: string) => void
}): Promise<Voice> {
  try {
    const { result, model: served } = await callGateway<unknown>({
      model: args.model,
      apiKey: args.apiKey,
      system: VOICE_SYSTEM,
      user: [
        `BRIEF\n"${args.brief}"`,
        args.note ? `THEY ASKED FOR\n"${args.note}"` : "",
        `WHAT IS ON SCREEN\n${args.summary}`,
        `THE DIRECTION WAS\n${args.direction.concept} — ${args.direction.signature}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      budget: STEP_BUDGETS.voice,
      opts: {
        stream: args.stream,
        onToken: args.onToken,
        onDelta: args.onDelta,
        fallbackModels: args.fallbackModels,
      },
    })
    args.onModel?.(served)
    const p = coerce(result)
    const reply = p.reply?.replace(/^```[a-z]*\n?|```$/g, "").trim() ?? ""
    if (reply.length >= 8) {
      const clipped = reply.length > 280 ? `${reply.slice(0, 280).trimEnd()}…` : reply
      return { reply: clipped, offers: p.offers ?? [] }
    }
  } catch {
    /* fall through to the deterministic voice */
  }
  return {
    reply: fallbackVoice(args),
    // A failed call must not invent a follow-up.
    offers: [],
  }
}

function fallbackVoice(args: Parameters<typeof runVoice>[0]): string {
  if (args.note) return "Done — saved as a new version. Tell me what to tweak."
  const concept = args.direction.concept.trim()
  if (!concept) return "Here it is — tell me what to change."
  return concept.length > 240 ? `${concept.slice(0, 240).trimEnd()}…` : concept
}

/** Kept for the composer summary, which both paths need. */
export { summariseComponent }
