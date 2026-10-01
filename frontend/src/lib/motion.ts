export interface Question {
  text: string
  options: string[]
}

export interface ChatMsg {
  id: number
  role: "ai" | "user"
  text: string
  /**
   * A question the assistant put to the user, with options it chose.
   * Never blocks — the cut is already made. Rendered inline under the
   * message with its own send button and a custom-answer escape hatch.
   */
  question?: Question
  /** Conversational follow-ups the assistant wants to take up. */
  offers?: string[]
  /** Plan previews are muted + grouped; errors render distinctly with retry. */
  kind?: "plan" | "reply"
  tone?: "error"
}

export interface ClipSpec {
  prompt: string
  format: string
  duration: string
  style: string
}

export const FORMATS = ["16:9", "9:16", "1:1"]

export const DURATIONS = [5, 10, 15] as const
export const DEFAULT_DURATION = 5

/**
 * Machine-readable tail appended to the message the AGENT receives (never
 * shown as the user's own words in the thread). Explicit labels matter:
 * the director builds a stated length directly instead of asking via
 * ask_user, and takes a stated format as final.
 */
export function specSuffix(secs: number, format: string): string {
  return `(Duration: ${secs} seconds. Format: ${format}.)`
}

export const PROMPT_EXAMPLES = [
  "Neon countdown intro, 5 seconds",
  "Clean lower third for interviews",
  "Glitch transition with impact frame",
]

const STYLE_KEYS = [
  "countdown",
  "lower third",
  "glitch",
  "neon",
  "particles",
  "waveform",
  "kinetic",
  "paper cut",
  "ticker",
  "confetti",
  "gradient",
  "glow",
  "ring",
  "chart",
  "graph",
  "bars",
  "dashboard",
  "sale",
  "promo",
  "promotion",
  "announcement",
  "launch",
  "event",
  "earning",
  "revenue",
  "title",
  "intro",
  "wedding",
  "fitness",
  "party",
  "sport",
  "music",
  "food",
  "travel",
  "fashion",
  "luxury",
  "health",
  "tech",
]

export function parseSpec(prompt: string, fallbackFormat: string): ClipSpec {
  const dur = prompt.match(/(\d+)\s*s(?:ec(?:ond)?s?)?/i)
  const fmt = prompt.match(/16:9|9:16|1:1/)
  const lower = prompt.toLowerCase()
  const style =
    STYLE_KEYS.find((k) => lower.includes(k))?.replace(/^./, (c) =>
      c.toUpperCase()
    ) ?? "Auto"
  // Clamp renders to a sane 3–30s window.
  const secs = Math.min(30, Math.max(3, dur ? Number(dur[1]) : 5))
  return {
    prompt,
    format: fmt?.[0] ?? fallbackFormat,
    duration: `00:${String(secs).padStart(2, "0")}`,
    style,
  }
}

const SMALLTALK: Array<{ match: RegExp; replies: string[] }> = [
  {
    match: /^(hi+|hello|hey|yo|hiya|namaste|namaskar)\b[!.\s]*$/,
    replies: [
      "Hey! Tell me what to animate — a countdown, a title, a chart, anything.",
      "Hello! Describe the clip you want and I'll direct it.",
      "Hey there — what are we making today?",
    ],
  },
  {
    match: /^(thanks?|thank you|thx|dhanyavaad)\b/,
    replies: [
      "Anytime! Want another version or a brand-new cut?",
      "You're welcome — say the word for refinements.",
    ],
  },
  {
    match: /^(bye|goodbye|see you|alvida)\b/,
    replies: [
      "See you soon — your projects stay saved here.",
      "Bye! Come back whenever you need motion.",
    ],
  },
  {
    match: /^(ok|okay|alright|cool|nice|great|awesome|sahi|achha)\b[!.\s]*$/,
    replies: [
      "Got it — describe the clip whenever you're ready.",
      "Cool. What should we make?",
    ],
  },
  {
    match: /^(who are you|what can you do)\b/,
    replies: [
      "I'm SlyxUp — I turn plain words into motion you can play back and refine. Describe one and watch.",
    ],
  },
  {
    // Standalone help only — "help me make…" is a real brief, not chit-chat.
    match: /^(help|madad)\b[!?.\s]*$/,
    replies: [
      "Describe any clip — titles, countdowns, charts, announcements — and I'll compose it. The canvas picker sets the shape; I'll ask about the vibe only when I need it.",
    ],
  },
  {
    match: /^(what can you (make|do|create|build|generate)|what do you (make|do)|capabilit|features)\b/,
    replies: [
      "I direct motion cuts — neon countdowns, kinetic titles, earnings charts, lower thirds, announcements, stat reveals. Describe one (attach a reference if you have it), answer a question or two, and I'll compose it. Then refine it in plain words, version by version.",
    ],
  },
  {
    match: /^(how (does|do) (this|it|you|that) work|how to use|how do i)\b/,
    replies: [
      "Describe any clip, pick a canvas, and I compose the first cut — asking first if I need the vibe. Every change you ask for becomes a new version you can preview and keep.",
    ],
  },
]

/**
 * Instant local reply for chit-chat (never spends a director call on
 * "hi"). Returns null for real briefs. Short inputs only.
 */
export function smalltalkReply(text: string): string | null {
  const t = text.trim().toLowerCase()
  if (t.length === 0 || t.length > 60) return null
  for (const s of SMALLTALK) {
    if (s.match.test(t))
      return s.replies[Math.floor(Math.random() * s.replies.length)]
  }
  return null
}
