/**
 * Phase 3 request optimization (IMPLEMENTATION_PLAN.md §5): predictive cache.
 *
 * Policy:
 * - skills (web-motion docs): 1h, shared — content is static per deploy.
 * - asset/font/intent results: deterministic pure functions, cached by query.
 * - validation: NEVER cached (always fresh — the source just changed).
 * - DO isolates are long-lived, so this Map survives between turns in the
 *   same isolate, which is exactly the session locality we want. Worst case
 *   on eviction: a cache miss, never a wrong answer.
 */

interface Entry {
  value: unknown
  expires: number
}

const store = new Map<string, Entry>()

/** TTLs in ms. */
export const TTL = {
  skill: 3_600_000,
  asset: 300_000,
  intent: 60_000,
} as const

export function cacheGet<T>(key: string): T | null {
  const e = store.get(key)
  if (!e) return null
  if (e.expires < Date.now()) {
    store.delete(key)
    return null
  }
  return e.value as T
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  if (store.size > 500) {
    // Bounded: drop the oldest quarter rather than growing without limit.
    const keys = [...store.keys()].slice(0, 125)
    for (const k of keys) store.delete(k)
  }
  store.set(key, { value, expires: Date.now() + ttlMs })
}

/** Test seam (mirrors resetPacing in rate-limit.ts). */
export function resetCache(): void {
  store.clear()
}

/**
 * Prediction engine (§5.1.2): given a brief, name the tool calls the turn
 * will almost certainly need so the orchestrator can prefetch them in ONE
 * execute_batch instead of discovering them one request at a time.
 */
export function predictTools(brief: string): Array<{ tool: string; args: Record<string, unknown> }> {
  const b = brief.toLowerCase()
  const ops: Array<{ tool: string; args: Record<string, unknown> }> = [
    { tool: "intent_deep_analyze", args: { request: brief } },
    { tool: "load_skill", args: { id: "timing" } },
    { tool: "load_skill", args: { id: "sequencing" } },
    { tool: "load_skill", args: { id: "compositions" } },
  ]
  const mood = /playful|fun|friendly/i.test(b)
    ? "playful"
    : /elegant|luxury|premium|editorial/i.test(b)
      ? "elegant"
      : /bold|loud|sport|\bsale\b/i.test(b)
        ? "bold"
        : /tech|saas|developer|data/i.test(b)
          ? "tech"
          : "modern"
  ops.push({ tool: "font_suggest", args: { mood } })
  if (/image|photo|background|product|logo/i.test(b)) {
    ops.push({ tool: "asset_search", args: { query: brief.slice(0, 120), type: "image" } })
  }
  if (/music|audio|sound|energetic|upbeat/i.test(b)) {
    ops.push({ tool: "asset_search", args: { query: "upbeat background music", type: "audio" } })
  }
  if (/type|text|headline|title|kinetic/i.test(b)) {
    ops.push({ tool: "load_skill", args: { id: "text" } })
  }
  if (/audio|music|voiceover/i.test(b)) {
    ops.push({ tool: "load_skill", args: { id: "audio" } })
  }
  // Agent upgrade: motion briefs almost always need transition timing next,
  // so warm it with the other reads instead of discovering it a request later.
  if (/transition|entrance|easing|spring|bounce|reveal/i.test(b)) {
    ops.push({ tool: "load_skill", args: { id: "transitions" } })
  }
  // Template-port routing (creative-direction §5): name the exact guidance +
  // example skills each brief needs so the turn loads them instead of writing
  // curves and layouts from memory.
  if (/chart|graph|histogram|statistic|metric|dashboard|progress|countdown|meter/i.test(b)) {
    ops.push({ tool: "load_skill", args: { id: "charts-data-viz" } })
  }
  if (/spring|bounce|overshoot|settle|elastic|organic/i.test(b)) {
    ops.push({ tool: "load_skill", args: { id: "spring-physics" } })
  }
  if (/chat|message|whatsapp|imessage|dm\b|comment|conversation|testimonial/i.test(b)) {
    ops.push({ tool: "load_skill", args: { id: "messaging-chat-ui" } })
  }
  if (/promo|ad\b|ads\b|teaser|launch|social|tiktok|reel|hook|\bsale\b/i.test(b)) {
    ops.push({ tool: "load_skill", args: { id: "social-media-formats" } })
  }
  if (/typewriter|cursor|quote|code reveal/i.test(b)) {
    ops.push({ tool: "load_skill", args: { id: "example-typewriter-highlight" } })
  } else if (/carousel|rotating word|alternating/i.test(b)) {
    ops.push({ tool: "load_skill", args: { id: "example-word-carousel" } })
  } else if (/lottie/i.test(b)) {
    ops.push({ tool: "load_skill", args: { id: "example-lottie" } })
  } else if (/3d|three|sphere|spatial/i.test(b)) {
    ops.push({ tool: "load_skill", args: { id: "example-falling-spheres" } })
  } else if (/shape|abstract|bumper/i.test(b)) {
    ops.push({ tool: "load_skill", args: { id: "example-animated-shapes" } })
  }
  return ops
}
