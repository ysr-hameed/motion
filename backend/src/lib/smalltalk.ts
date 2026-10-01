/**
 * Deterministic smalltalk short-circuit for the agent chat route.
 *
 * Rule 0 in the system prompt asks the model not to burn tools on
 * greetings — but hope is not a control. When the latest user turn is
 * *only* chit-chat, the route answers here with a canned line and never
 * calls the model at all: zero gateway cost, zero CPU loop, and the model
 * can never "inspect the project" in response to a "hi".
 *
 * Deliberately conservative: bare acknowledgements ("ok", "nice") and
 * anything with an actionable verb still go to the model WITH history,
 * because "ok" is often the answer to a pending ask_user question and
 * swallowing it would break the approval flow.
 */

const GREETING_ONLY = /^(hi+|hello|hey|yo|hiya|namaste|namaskar|good\s?(morning|afternoon|evening))( there)?[!.\s]*$/i
const THANKS_ONLY = /^(thanks?|thank\s?you|thx|dhanyavaad|shukriya)(\s+(so|very)\s+much|\s+a\s+lot)?[!.\s]*$/i
const BYE_ONLY = /^(bye|goodbye|see\s?you|alvida|good\s?night)( there)?[!.\s]*$/i
const CAPABILITIES =
  /\b(what can you do|what do you do|help(\b| me)|who are you|what are you|your name|about you|how does this work)\b/i

/** Verbs that make a message a task, even next to a greeting. */
const ACTION_VERB =
  /\b(make|create|generate|build|fix|change|edit|add|update|remove|delete|animate|render|use|try|write|design|show|give|need|want|make it|do it)\b/i

const REPLIES = {
  greeting: [
    "Hey! Tell me what to animate — a countdown, a title, a chart, anything.",
    "Hello! Describe the clip you want and I'll compose it.",
  ],
  thanks: [
    "Anytime! Want another version, or a brand-new cut?",
    "You're welcome — say the word for refinements.",
  ],
  bye: ["See you soon — your projects stay saved here."],
  capabilities: [
    "I compose motion clips — countdowns, titles, charts, lower-thirds and more. Describe one (pick a length and shape), and watch it land on stage. Then refine it in plain words.",
  ],
} as const

function pick<T>(arr: readonly T[], salt: string): T {
  let h = 0
  for (const ch of salt) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return arr[h % arr.length]!
}

/**
 * A conversational reply for pure chit-chat, or null when the message
 * needs the model. Never throws. Keeps it short: greetings and thanks
 * cap at ~120 chars so a "hello" can never smuggle a task past us.
 */
export function smalltalkReply(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const text = raw.trim()
  if (!text || text.length > 140) return null
  if (ACTION_VERB.test(text)) return null
  if (GREETING_ONLY.test(text)) return pick(REPLIES.greeting, text)
  if (THANKS_ONLY.test(text)) return pick(REPLIES.thanks, text)
  if (BYE_ONLY.test(text)) return pick(REPLIES.bye, text)
  if (text.length < 120 && CAPABILITIES.test(text)) return pick(REPLIES.capabilities, text)
  return null
}
