/**
 * How the director's read of the brief becomes something a person reads.
 *
 * This is the only user-facing copy the studio writes itself. Everything
 * else the user sees comes from the model, in their language: the reply,
 * the questions and their options, and the follow-ups it wants to take up.
 */

/**
 * The director's read of the brief, as a chat message.
 *
 * It posts the moment the director exists — before a line of the
 * composition is written — so it is the one thing the user can read while
 * the model is busy. It has to earn that: the concept in a line, the
 * beats as a short list, and nothing else. No stage names, no
 * "Direction:" label, and no repetition of any of it after the cut lands.
 */
/**
 * Strip writer-contract timecodes ("0-12f:", "12-30f —", "60f:") and other
 * frame/beat scaffolding so the chat reads like a person, not a build log.
 */
function cleanBeat(raw: string): string {
  let b = raw.trim()
  // Leading timecodes: "0-12f:", "12-30f —", "60f:", "0-2s:", "[0-12f]" etc.
  b = b
    .replace(/^[([]?\d+\s*[-–—~to]+\s*\d+\s*(f|frames?|s|secs?|beats?)?[\])]?\s*[:–—|]+\s*/i, "")
    .replace(/^\d+\s*(f|frames?|s|secs?)\s*[:–—]+\s*/i, "")
    .replace(/^(beat\s*\d+|step\s*\d+|shot\s*\d+)\s*[:–—]+\s*/i, "")
    .trim()
  // Collapse "word snaps in with overshoot (12-30f)" style tails.
  b = b.replace(/\s*[([]\d+\s*[-–]\s*\d+\s*(f|frames?|s)?[\])]\s*$/i, "").trim()
  if (!b) return ""
  return b.charAt(0).toUpperCase() + b.slice(1)
}

export function planMessage(
  plan: { concept?: string; beats?: string[]; signature?: string } | null | undefined
): string {
  if (!plan) return ""
  const concept = plan.concept?.trim() ?? ""
  const beats = (plan.beats ?? [])
    .map(cleanBeat)
    .filter(Boolean)
    // Dedupe against the concept so the reply doesn't repeat the plan.
    .filter((b) => b.toLowerCase() !== concept.toLowerCase())
    .slice(0, 3)
  const signature = plan.signature?.trim() ?? ""
  if (!concept && beats.length === 0) return ""
  const lines: string[] = []
  if (concept) lines.push(`Making this — ${concept}`)
  for (const b of beats) lines.push(`• ${b}`)
  if (signature && signature.toLowerCase() !== concept.toLowerCase())
    lines.push(`\nHighlight: ${signature}`)
  return lines.join("\n")
}
