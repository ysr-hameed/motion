import { STEP_BUDGETS } from "../models"
import { callGateway, type GatewayImage } from "./gateway-client"
import { CANVAS, resolveFormat, type AspectFormat } from "../artifact"

/**
 * DIRECTOR — reads the brief and decides the cut before a line of code
 * exists: what the hero is, the beat order, the palette, how long.
 *
 * This is the only JSON in the pipeline, and it is deliberately tiny —
 * four short fields, no motion, no structure. It exists because deciding
 * and writing in the same pass produces competent, generic code; deciding
 * first lets the writer commit. Everything expressive happens in
 * TypeScript afterwards.
 */
export interface Direction {
  concept: string
  beats: string[]
  palette: { bg: string; hero: string; accent: string }
  durationSecs: number
  format: AspectFormat
  /** One line the writer treats as the non-negotiable centrepiece. */
  signature: string
  /**
   * Zero, one or two questions the director wants to put to the user.
   *
   * These never block anything — the cut is composed either way, and the
   * questions ride along in the chat as an invitation. The director picks
   * how many and writes its own options, because it is the only one who
   * knows which choices would have changed the cut.
   */
  questions: DirectorQuestion[]
}

export interface DirectorQuestion {
  text: string
  options: string[]
}

const DIRECTOR_SYSTEM = [
  "You are the DIRECTOR of a motion design studio. You read a brief and decide the cut.",
  "Output ONLY raw JSON. No fences, no commentary.",
  "",
  "JSON shape:",
  '{concept, beats[], palette:{bg,hero,accent}, durationSecs, format, signature, questions[]}',
  "",
  "concept — one line, what this cut IS, in the user's language.",
  "beats — 3 to 5 beats in play order. Each names what the viewer SEES and",
  "        WHEN it moves, in frames or beats: \"0-12f: grid wipes in from left\",",
  "        \"12-30f: word snaps in with overshoot\", \"60f: hold, glow breathes\".",
  "        Beats are the choreography contract the writer builds against.",
  "palette — three hex colours chosen for THIS brief, not defaults.",
  "         Deep near-black or a considered tone for bg, one dominant hero,",
  "         one accent used sparingly. Never grey on grey, never #000000.",
  "durationSecs — honour a duration named in the brief. Otherwise pick the",
  "         shortest length that tells the story: 3-6s for a statement, 6-10s",
  "         for a build, 10-20s for a sequence. Never pad.",
  "format — 16:9, 9:16 or 1:1. Take it from the brief, else use the canvas given.",
  "signature — THE one moment the viewer will remember. Name it concretely:",
  "         \"the word overshoots 12% and settles on the beat\", \"the ring",
  "         wipes open to reveal the number\". If the signature is boring, redo it.",
  "",
  "questions — [] in almost every case, and that is the correct answer.",
  "  The cut is composed regardless of what is or is not in here. A question",
  "  is not a request for permission; it is an opening the user can take up",
  "  in the chat if they want to steer. So ask only about something that",
  "  would have genuinely made this cut better, and never about something",
  "  you could reasonably decide yourself — styling, colour, pacing and mood",
  "  are yours to call, and asking about them is asking the user to do your",
  "  job. At most 2. Usually 0.",
  "  text: ONE short question, max 12 words, in the user's language.",
  "  options: 2-4 short answers, all genuinely reasonable and genuinely",
  "           different from each other, in the user's language. No \"Other\",",
  "           no \"Let me know\", no filler.",
  "",
  "LANGUAGE: concept, beats and signature are written in the user's language.",
  "Never default to English.",
  "Never apologise, never say you cannot. Every brief gets a direction.",
].join("\n")

/** Repairs the shapes models actually emit into Direction. */
function coerce(raw: unknown, brief: string, fallbackFormat: string): Partial<Direction> {
  if (typeof raw !== "object" || raw === null) return {}
  let r = raw as Record<string, unknown>
  for (const key of ["direction", "plan", "result", "data"]) {
    const inner = r[key]
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      r = inner as Record<string, unknown>
      break
    }
  }
  const out: Partial<Direction> = {}

  const concept = [r.concept, r.idea, r.summary, r.title]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .find(Boolean)
  if (concept) out.concept = concept.slice(0, 220)

  const rawBeats = Array.isArray(r.beats) ? r.beats : []
  const beats = rawBeats
    .map((b) => {
      if (typeof b === "string") return b.trim()
      if (b && typeof b === "object") {
        const o = b as Record<string, unknown>
        const t = [o.text, o.beat, o.action, o.description, o.label]
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .find(Boolean)
        const time = typeof o.time === "string" ? o.time.trim() : ""
        return `${time ? `${time} — ` : ""}${t ?? ""}`.trim()
      }
      return ""
    })
    .filter((s) => s.length > 0)
    .slice(0, 5)
  if (beats.length > 0) out.beats = beats

  const hex = (v: unknown) =>
    typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : null
  const p = r.palette
  if (Array.isArray(p)) {
    out.palette = {
      bg: hex(p[0]) ?? "#08080C",
      hero: hex(p[1]) ?? "#22D3EE",
      accent: hex(p[2]) ?? "#F472B6",
    }
  } else if (p && typeof p === "object") {
    const o = p as Record<string, unknown>
    out.palette = {
      bg: hex(o.bg) ?? "#08080C",
      hero: hex(o.hero) ?? hex(o.primary) ?? "#22D3EE",
      accent: hex(o.accent) ?? hex(o.secondary) ?? "#F472B6",
    }
  }

  const dur = Number(r.durationSecs ?? r.duration ?? NaN)
  if (Number.isFinite(dur) && dur >= 1) out.durationSecs = Math.min(30, dur)

  const fmt = r.format
  if (fmt === "16:9" || fmt === "9:16" || fmt === "1:1") out.format = fmt

  const sig = [r.signature, r.hero_moment, r.heroMoment, r.moment]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .find(Boolean)
  if (sig) out.signature = sig.slice(0, 220)

  // Questions are an invitation, not a gate — so a malformed one is
  // dropped rather than repaired, and the rest of the direction is
  // unaffected either way.
  const rawQuestions = Array.isArray(r.questions) ? r.questions : []
  const questions: DirectorQuestion[] = rawQuestions
    .map((q): DirectorQuestion | null => {
      if (!q || typeof q !== "object") return null
      const o = q as Record<string, unknown>
      const text = [o.text, o.ask, o.question]
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .find(Boolean)
      const options = (Array.isArray(o.options) ? o.options : [])
        .map((x) => String(x).trim().slice(0, 40))
        .filter((x) => x.length > 1 && !/^(other|let me know|etc|none)$/i.test(x))
        .slice(0, 4)
      if (!text || text.length > 120 || options.length < 2) return null
      return { text, options }
    })
    .filter((q): q is DirectorQuestion => q !== null)
    .slice(0, 2)
  if (questions.length > 0) out.questions = questions

  void brief
  void fallbackFormat
  return out
}

/**
 * Fallback palettes, used only when the director call fails outright.
 *
 * These used to be Tailwind-500 values — #22D3EE cyan, #8B5CF8 purple,
 * #FF2D55 pink. Which is exactly the set the composer prompt now forbids,
 * so a director failure silently produced the generic look the whole
 * pipeline exists to avoid. Every one below is committed to a
 * temperature, keeps saturation in one place only, and uses a near-black
 * that is actually warm or cool rather than a flat #000 or #0A0A12.
 */
const PALETTES = {
  /** Cool, engineered, but mint and slate rather than cyan and indigo. */
  tech: { bg: "#08090C", hero: "#7AE0C8", accent: "#B4A6FF" },
  /** Vermilion and marigold on a warm ink. Loud without being neon. */
  bold: { bg: "#14100E", hero: "#E5484D", accent: "#F5C518" },
  /** Antique brass and bone. Restrained, expensive. */
  luxury: { bg: "#0D0B08", hero: "#C9A961", accent: "#E8DCC4" },
  /** Ink on bone, one burnt ember. Editorial rather than "minimal tech". */
  clean: { bg: "#F2EFE9", hero: "#14110E", accent: "#A33B2A" },
  /** Warm, low-light. Ember and clay. */
  warm: { bg: "#0F0A07", hero: "#E0783C", accent: "#D9A566" },
  /** Forest and clay, not emerald and teal. */
  eco: { bg: "#0A0F0C", hero: "#86A85B", accent: "#C4A882" },
  /** Cold slate with a single vermilion mark. */
  editorial: { bg: "#101418", hero: "#3E6B8A", accent: "#C4512E" },
} as const

/**
 * Vibe keyword -> palette, checked in order. A table rather than a chain
 * of `if (regex.test(t)) return` — same behaviour, and it stays readable
 * when the list grows.
 */
const VIBE_PALETTES: ReadonlyArray<readonly [RegExp, (typeof PALETTES)[keyof typeof PALETTES]]> = [
  [/\b(light|white|ivory|cream|paper|print)\b/, PALETTES.clean],
  [/luxur|premium|gold|elegant|serif|fashion|beauty|watch/, PALETTES.luxury],
  [/\b(bold|punch|energetic|sport|fight|fire|hype|launch|sale)\b/, PALETTES.bold],
  [/\b(eco|green|sustain|nature|plant|wellness|organic|forest)\b/, PALETTES.eco],
  [/\b(financial|finance|earn|revenue|crypto|data|dashboard|business|report|analyst)\b/i, PALETTES.editorial],
  [/\b(warm|sunset|food|coffee|summer|festival|romantic|spa)\b/, PALETTES.warm],
  [/\b(clean|minimal|simple|professional|saas|product)\b/, PALETTES.clean],
]

function paletteFor(brief: string): { bg: string; hero: string; accent: string } {
  const t = brief.toLowerCase()
  for (const [pattern, palette] of VIBE_PALETTES) {
    if (pattern.test(t)) return palette
  }
  return PALETTES.tech
}

function beatCount(brief: string): number {
  const n = brief.match(/(\d+)\s*(?:s\b|sec|second)/i)?.[1]
  if (n) return Math.min(5, Math.max(3, Math.round(Number(n) / 2)))
  const words = brief.split(/\s+/).length
  return words > 40 ? 4 : 3
}

/** Deterministic direction — used when the model call fails outright. */
export function fallbackDirection(brief: string, format: string): Direction {
  const fmt = resolveFormat(brief, format)
  const p = paletteFor(brief)
  const secs = Number(brief.match(/(\d+)\s*s(?:ec)?/i)?.[1] ?? 5)
  const durationSecs = Math.min(30, Math.max(3, Math.round(secs)))
  const n = beatCount(brief)
  const beats = [
    `0-${Math.round(durationSecs * 0.25)}f: the stage establishes — background and texture arrive first`,
    `${Math.round(durationSecs * 0.25)}-${Math.round(durationSecs * 0.5)}f: the hero enters with weight and overshoot`,
    `${Math.round(durationSecs * 0.5)}-${Math.round(durationSecs * 0.8)}f: the signature moment lands`,
    `${Math.round(durationSecs * 0.8)}f-end: resolve and exit on a held final beat`,
  ].slice(0, n)
  return {
    concept: brief.slice(0, 220) || "Motion cut",
    beats,
    palette: p,
    durationSecs,
    format: fmt,
    signature: "the hero overshoots and settles on the beat",
    questions: [],
  }
}


export async function runDirector(args: {
  model: string
  apiKey: string
  brief: string
  format: string
  fps: number
  memoryHint?: string
  /** Earlier turns of the same session, oldest first. */
  priorContext?: string
  stream?: boolean
  onToken?: (tokens: number) => void
  onDelta?: (delta: string) => void
  images?: GatewayImage[]
  fallbackModels?: string[]
  onModel?: (model: string) => void
}): Promise<Direction> {
  const base = fallbackDirection(args.brief, args.format)
  const { width, height } = CANVAS[base.format]
  const continuing = !!args.priorContext
  const user =
    (continuing
      ? `This is a continuing session. Earlier turns:\n${args.priorContext}\n\n` +
        `The new instruction is a follow-up on that, not a fresh brief. ` +
        `Keep whatever is still true (subject, brand, format, palette) and change ` +
        `only what the follow-up is about. If the follow-up does not contradict ` +
        `anything, treat it as a refinement of the same idea rather than a new one.\n\n`
      : "") +
    `Brief: "${args.brief}"\n` +
    `Canvas: ${base.format} (${width}x${height}) at ${args.fps}fps` +
    (args.memoryHint ? `\nHouse direction: ${args.memoryHint}` : "") +
    (args.images?.length
      ? `\n${args.images.length} reference image(s) attached — let them set the subject, palette and mood.`
      : "")

  try {
    const { result, model: served } = await callGateway<unknown>({
      model: args.model,
      apiKey: args.apiKey,
      system: DIRECTOR_SYSTEM,
      user,
      budget: STEP_BUDGETS.director,
      opts: {
        stream: args.stream,
        onToken: args.onToken,
        onDelta: args.onDelta,
        images: args.images,
        fallbackModels: args.fallbackModels,
      },
    })
    args.onModel?.(served)
    const c = coerce(result, args.brief, args.format)
    const format =
      c.format && c.format !== base.format && !/\d\s*:\s*\d/.test(args.brief)
        ? c.format
        : base.format
    const durationSecs = Math.min(30, Math.max(2, c.durationSecs ?? base.durationSecs))
    return {
      concept: c.concept ?? base.concept,
      beats: c.beats ?? base.beats,
      palette: c.palette ?? base.palette,
      durationSecs,
      format,
      signature: c.signature ?? base.signature,
      questions: c.questions ?? [],
    }
  } catch {
    return base
  }
}
