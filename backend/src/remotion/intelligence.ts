/**
 * Phase 2 intelligence layer (IMPLEMENTATION_PLAN.md §3, §2.3).
 *
 * All helpers are pure and deterministic: keyword inference over the brief,
 * weighted scoring over explicit options, heuristic audits over source.
 * Nothing here calls a model or the network, so every tool below is safe
 * to run inside the paced turn without spending quota.
 */

export interface IntentSpec {
  goal: string
  tone: string
  lengthFrames: number
  lengthLabel: string
  industry: string
  audience: string
  platform: string
  known: string[]
  inferred: string[]
  gaps: string[]
  questions: Array<{ q: string; choices: string[] }>
  autofill: string[]
}

const GOALS: Array<[RegExp, string]> = [
  [/product|launch|reveal|showcase/i, "Product showcase"],
  [/ad\b|advert|promo|sale|offer/i, "Social media ad"],
  [/logo/i, "Logo reveal"],
  [/explain|how it works|intro to/i, "Explainer intro"],
  [/tutorial|lesson|course|walkthrough/i, "Tutorial intro"],
  [/event|countdown|save the date|conference/i, "Event promo"],
  [/brand|story|about us/i, "Brand story"],
  [/quote|testimonial/i, "Quote card"],
  [/podcast/i, "Podcast intro/outro"],
]

const TONES: Array<[RegExp, string]> = [
  [/playful|fun|quirky|friendly/i, "playful"],
  [/elegant|luxury|premium|editorial/i, "elegant"],
  [/bold|loud|sport|sale/i, "bold"],
  [/tech|saas|developer|data/i, "tech"],
  [/energetic|hype|hype|exciting|punch/i, "energetic"],
]

const PLATFORMS: Array<[RegExp, string]> = [
  [/story|stories|reel|tiktok|short|9:16|vertical/i, "Instagram Story / TikTok (vertical)"],
  [/youtube|16:9|widescreen/i, "YouTube (widescreen)"],
  [/feed|square|1:1/i, "Instagram Feed (square)"],
  [/hero|website|landing/i, "Website hero"],
  [/twitter|x post/i, "Twitter/X"],
]

export function intentDeepAnalyze(request: string): IntentSpec {
  const brief = request.trim()
  const goal = GOALS.find(([re]) => re.test(brief))?.[1] ?? "Product showcase"
  const tone = TONES.find(([re]) => re.test(brief))?.[1] ?? "modern"
  const secs = /(\d+)\s?s\b/i.exec(brief)?.[1]
  const lengthFrames = secs ? Math.min(900, Number(secs) * 30) : 450
  const lengthLabel = `${Math.round(lengthFrames / 30)}s (${lengthFrames}f)`
  const industry = /fitness|gym|sport/i.test(brief)
    ? "fitness"
    : /food|restaurant|recipe/i.test(brief)
      ? "food"
      : /fashion|clothing|beauty/i.test(brief)
        ? "fashion"
        : /finance|bank|invest/i.test(brief)
          ? "finance"
          : /saas|software|app|tech/i.test(brief)
            ? "tech"
            : "general"
  const platform = PLATFORMS.find(([re]) => re.test(brief))?.[1] ?? "unspecified (default 1920×1080)"
  const audience = /b2b|enterprise|team/i.test(brief) ? "B2B" : "B2C"

  const known = [`Type: ${goal}`, `Tone: ${tone}`, `Length: ${lengthLabel}`]
  const inferred = [
    `Industry: ${industry}${industry === "fitness" ? " → default to energetic music + bold type" : ""}`,
    `Audience: ${audience}`,
    `Platform: ${platform}`,
  ]
  const gaps: string[] = []
  if (platform.startsWith("unspecified")) gaps.push("primary platform")
  if (!/logo|brand|#[0-9a-f]{3,6}/i.test(brief)) gaps.push("brand assets (logo/colors — else extract or placeholder)")
  if (!/music|audio|silent/i.test(brief)) gaps.push("audio (else auto-select by mood)")

  const questions = [
    { q: "Which platform is primary?", choices: ["Instagram", "YouTube", "TikTok", "Website", "All"] },
    { q: "Visual style?", choices: ["Minimal", "Bold", "Tech"] },
    { q: "Brand assets?", choices: ["Upload logo", "Skip — use placeholder"] },
  ]

  const autofill = [
    "No brand colors → extract from logo/image or use a curated palette",
    "No music → auto-select by mood, BPM-matched, trimmed to duration",
    "No voiceover → use staggered text animation instead",
  ]

  return { goal, tone, lengthFrames, lengthLabel, industry, audience, platform, known, inferred, gaps, questions, autofill }
}

/** Smart questionnaire: only the gaps, as quick picks (IMPLEMENTATION_PLAN.md §6). */
export function intentQuestionnaire(brief: string): {
  known: string[]
  inferred: string[]
  ask: Array<{ q: string; choices: string[] }>
} {
  const spec = intentDeepAnalyze(brief)
  const ask = spec.gaps.length > 0 ? spec.questions.filter((q) => /platform|style|asset/i.test(q.q)) : []
  return { known: [...spec.known, ...spec.inferred], inferred: spec.autofill, ask }
}

export interface ScoredOption {
  option: string
  scores: Record<string, number>
  total: number
}

/** Weighted decision over explicit options — the reasoning is the deliverable. */
export function decisionMake(
  options: string[],
  criteria: Record<string, number> = { motion: 0.4, hierarchy: 0.3, timing: 0.2, brand: 0.1 },
  signals: Record<string, Record<string, number>> = {}
): { winner: string; ranked: ScoredOption[]; reasoning: string } {
  const ranked: ScoredOption[] = options.map((option) => {
    const sig = signals[option] ?? {}
    let total = 0
    for (const [criterion, weight] of Object.entries(criteria)) {
      total += (sig[criterion] ?? 0.5) * weight
    }
    return { option, scores: sig, total: Math.round(total * 100) / 100 }
  })
  ranked.sort((a, b) => b.total - a.total)
  const winner = ranked[0]?.option ?? options[0] ?? ""
  return {
    winner,
    ranked,
    reasoning: `Scored ${options.length} options on ${Object.keys(criteria).join(", ")}; "${winner}" wins at ${ranked[0]?.total ?? 0}. Alternatives logged, not discarded.`,
  }
}

/** Apply learned session preferences to a fresh decision. */
export function preferenceApply(
  decision: string,
  profile: Record<string, string> = {}
): { decision: string; applied: string[] } {
  const applied: string[] = []
  for (const [key, value] of Object.entries(profile)) {
    if (value) applied.push(`${key}: ${value}`)
  }
  return {
    decision: applied.length > 0 ? `${decision} (consistent with: ${applied.join("; ")})` : decision,
    applied,
  }
}

/** Extract reusable brand patterns from example descriptions. */
export function brandLearn(examples: string[]): {
  palette: string[]
  moods: string[]
  profile: string
} {
  const palette = [...new Set(examples.flatMap((e) => [...e.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0])))]
  const moods = [...new Set(examples.flatMap((e) => TONES.filter(([re]) => re.test(e)).map(([, t]) => t)))]
  return {
    palette,
    moods,
    profile: `Brand profile from ${examples.length} example(s): moods [${moods.join(", ") || "modern"}], palette [${palette.join(", ") || "extract from logo"}]. Reuse for every future cut.`,
  }
}

/** Structured design audit — the data behind design_analyze. */
export function designAnalyze(code: string): { score: number; findings: string[] } {
  if (!code.trim()) return { score: 0, findings: ["Nothing to analyze yet."] }
  let score = 70
  const findings: string[] = []
  if (/\bspring\(/.test(code)) score += 10
  else findings.push("Add a spring() arrival so at least one element settles with overshoot.")
  if (/Easing\./.test(code)) score += 8
  else findings.push("Replace default linear curves with Easing.bezier(...) per move.")
  if (/translate[XY]|scale|rotate/i.test(code)) score += 6
  else findings.push("Opacity is doing all the work — layer one element moving in space.")
  if (/delay|stagger|index\s*\*/i.test(code)) score += 4
  else if (/\.map\(/.test(code)) findings.push("Mapped list has no stagger — offset each item by index × 3 frames.")
  if (findings.length === 0) findings.push("Structure is sound — push the ending: does the last frame resolve or just stop?")
  return { score: Math.min(100, score), findings: findings.slice(0, 3) }
}

export function performanceProfile(code: string): {
  score: number
  bottlenecks: string[]
  recommendations: string[]
} {
  const heavy = (code.match(/Noise|motion-blur|Loop|displacement/gi) ?? []).length
  const interpolates = (code.match(/interpolate\(/g) ?? []).length
  const score = Math.max(40, 100 - heavy * 12 - Math.max(0, interpolates - 20))
  const bottlenecks = heavy > 0 ? [`${heavy} heavy effect(s) (noise/blur/loop/displacement)`] : []
  if (interpolates > 20) bottlenecks.push(`${interpolates} interpolate() calls — batch static values`)
  return {
    score,
    bottlenecks,
    recommendations:
      bottlenecks.length > 0
        ? ["Prefer transforms + opacity over per-frame blur/noise", "Precompute static values outside the frame callback"]
        : ["Frame budget is healthy — no action needed"],
  }
}

export function accessibilityAudit(code: string): { score: number; report: string[] } {
  const report: string[] = []
  let score = 90
  if (/interpolate\(\s*frame\s*,\s*\[\d+\s*,\s*\d+\]/g.test(code)) {
    // Rapid full-contrast flashes would show as sub-6-frame opacity 0→1→0 cycles.
    if (/opacity[^;]{0,80}0[^;]{0,40}1[^;]{0,40}0/.test(code)) {
      score -= 20
      report.push("Possible rapid flashing — keep flashes ≥3 frames apart (WCAG 2.3.1).")
    }
  }
  if (!/prefers-reduced-motion/i.test(code)) {
    report.push("No reduced-motion path — offer a static-safe variant for motion-sensitive viewers.")
  } else {
    score += 5
  }
  report.push("Contrast: verify text over video meets 4.5:1 at the darkest frame.")
  report.push("Screen readers: the cut is visual — ship captions/transcript alongside.")
  return { score: Math.min(100, score), report }
}
