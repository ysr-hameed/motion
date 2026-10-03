/**
 * Phase 4 content generation (IMPLEMENTATION_PLAN.md §2.4).
 *
 * Deterministic and key-free: every generator returns a SPEC the model turns
 * into composition code (copy decks, timing math, component snippets). Live
 * provider calls (ElevenLabs, stock libraries) are Phase-5+ upgrades; until
 * then nothing here stalls a turn on a missing integration, and every stub
 * says so in its own output.
 */

export function copyGenerate(
  brief: string,
  tone = "modern",
  count = 3
): { headlines: string[]; taglines: string[]; note: string } {
  const b = brief.trim().replace(/\s+/g, " ").slice(0, 80) || "your story"
  const n = Math.min(5, Math.max(1, Math.round(count)))
  const heads: Record<string, string[]> = {
    modern: [`${b}, in motion`, `Meet ${b}`, `Designed to move`],
    playful: [`Say hi to ${b}!`, `${b} goes whee`, `Fun, faster: ${b}`],
    elegant: [`The art of ${b}`, `${b}, refined`, `Quietly extraordinary`],
    bold: [`${b}. LOUD.`, `STOP SCROLLING: ${b}`, `BUILT FOR IMPACT`],
    tech: [`${b} — now shipping`, `npm install ${b}`, `v2.0: ${b}`],
  }
  const tags: Record<string, string[]> = {
    modern: ["Motion that means it", "Less fade, more feeling", "Arrive with intent"],
    playful: ["Wiggle responsibly", "Bounce first, ask later", "Serious fun only"],
    elegant: ["Grace in every frame", "Timeless, timed well", "Softly certain"],
    bold: ["No blending in", "Volume up", "Unignorable by design"],
    tech: ["60fps or nothing", "Deterministic delight", "Shipped, not sketched"],
  }
  const key = /playful|fun/i.test(tone) ? "playful" : /elegant|luxury/i.test(tone) ? "elegant" : /bold|loud/i.test(tone) ? "bold" : /tech/i.test(tone) ? "tech" : "modern"
  return {
    headlines: heads[key]!.slice(0, n).map((h, i) => (i === 0 ? h : `${h} ${i + 1}`)),
    taglines: tags[key]!.slice(0, n),
    note: `Brand voice: ${tone}. Headline ≤5 words for hero scale (${130}-${200}px); tagline as sub (${64}-${96}px). Pick one pair — do not stack all three.`,
  }
}

export function voiceoverGenerate(
  script: string,
  seconds: number,
  language = "en"
): { words: number; estSeconds: number; cues: Array<{ at: number; text: string }>; note: string } {
  const words = script.trim().split(/\s+/).filter(Boolean)
  const estSeconds = Math.round((words.length / 2.5) * 10) / 10 // ~150 wpm
  const per = seconds / Math.max(1, words.length)
  const cues = words.map((text, i) => ({ at: Math.round(i * per * 30), text }))
  return {
    words: words.length,
    estSeconds,
    cues: cues.slice(0, 60),
    note:
      `ElevenLabs integration is not connected — record or synthesize "${language}" audio externally, ` +
      `then sync beats to these frame cues (${seconds}s @30fps). Script runs ~${estSeconds}s; ` +
      (estSeconds > seconds ? "TRIM the script or extend the cut." : "fits the cut.") +
      ` Stagger on-screen text to the same cues.`,
  }
}

interface Track {
  title: string
  mood: string
  bpm: number
  seconds: number
  url: string
  license: string
}

const LIBRARY: Track[] = [
  { title: "Upbeat electronic bed", mood: "energetic", bpm: 124, seconds: 120, url: "https://cdn.pixabay.com/audio/placeholder-124bpm.mp3", license: "Placeholder — license before publishing" },
  { title: "Warm corporate pulse", mood: "modern", bpm: 100, seconds: 150, url: "https://cdn.pixabay.com/audio/placeholder-100bpm.mp3", license: "Placeholder — license before publishing" },
  { title: "Playful bounce", mood: "playful", bpm: 132, seconds: 90, url: "https://cdn.pixabay.com/audio/placeholder-132bpm.mp3", license: "Placeholder — license before publishing" },
  { title: "Elegant piano air", mood: "elegant", bpm: 72, seconds: 180, url: "https://cdn.pixabay.com/audio/placeholder-72bpm.mp3", license: "Placeholder — license before publishing" },
  { title: "Bold impact hits", mood: "bold", bpm: 140, seconds: 60, url: "https://cdn.pixabay.com/audio/placeholder-140bpm.mp3", license: "Placeholder — license before publishing" },
]

export function musicSearch(
  mood: string,
  seconds: number,
  bpm?: number
): { matches: Array<Track & { trim: string }>; note: string } {
  const m = mood.toLowerCase()
  const ranked = [...LIBRARY].sort((a, b) => {
    const score = (t: Track) =>
      (t.mood === m ? 0 : 1) * 100 + (bpm ? Math.abs(t.bpm - bpm) : 0);
    return score(a) - score(b)
  })
  return {
    matches: ranked.slice(0, 3).map((t) => ({
      ...t,
      trim: t.seconds >= seconds ? `Trim to ${seconds}s with 15f fade-out` : `Loops ${(seconds / t.seconds).toFixed(1)}× to fill ${seconds}s — crossfade loops`,
    })),
    note: "Offline catalogue placeholders — swap in licensed tracks before cdn_publish. Beat-sync: beat frames = 60/bpm×30.",
  }
}

const SFX: Record<string, string[]> = {
  pop: ["short sine blip at entrance frame", "12f decay, -6dB under bed"],
  whoosh: ["filtered noise sweep across transition beats", "match sweep length to beat length"],
  click: ["UI tick on each stagger step", "stagger × 3f, alternating pitch ±2%"],
  thud: ["low sine drop on logo landing", "align to spring settle frame, not entrance"],
  chime: ["bright arp on resolve frame", "hold 30f, fade 15f"],
}

export function soundEffects(action: string): { action: string; suggestions: string[] } {
  const key = Object.keys(SFX).find((k) => action.toLowerCase().includes(k)) ?? "pop"
  return {
    action,
    suggestions: SFX[key]!.map((s) => `${key}: ${s}`),
  }
}

export function subtitleGenerate(
  cues: Array<{ at: number; text: string }>,
  language = "en"
): { language: string; captions: Array<{ from: number; to: number; text: string }>; note: string } {
  const captions = cues.map((c, i) => ({
    from: c.at,
    to: cues[i + 1] ? cues[i + 1]!.at - 2 : c.at + 60,
    text: c.text,
  }))
  return {
    language,
    captions,
    note: "Render with @remotion/captions <Caption> per window; keep ≤42 chars/line, hold ≥30f. Auto-transcription is not connected — these cues come from the script.",
  }
}

const ICONS = [
  "ArrowRight", "Play", "Pause", "Check", "X", "Plus", "Minus", "Star", "Heart",
  "Zap", "Rocket", "Sparkles", "Music", "Mic", "Video", "Image", "Type", "Palette",
] as const

export function iconGenerate(concept: string): { concept: string; icons: string[]; snippet: string } {
  const c = concept.toLowerCase()
  const pick = (re: RegExp, names: string[]) => (re.test(c) ? names : [])
  const icons = [
    ...pick(/play|start|video|motion/i, ["Play", "Video", "Sparkles"]),
    ...pick(/music|audio|sound/i, ["Music", "Mic"]),
    ...pick(/go|next|move|fast/i, ["ArrowRight", "Zap", "Rocket"]),
    ...pick(/love|like|fav/i, ["Heart", "Star"]),
    ...pick(/add|new|create/i, ["Plus", "Sparkles"]),
  ].slice(0, 3)
  const final = icons.length > 0 ? icons : ["Sparkles", "Zap", "Check"]
  return {
    concept,
    icons: [...final, `(full set: ${ICONS.join(", ")})`],
    snippet: `import { ${final[0]} } from "lucide-react"; // <${final[0]} size={48} color="#fff" /> — lucide-react is in scope, stroke-width 2 default`,
  }
}

export function backgroundGenerate(
  style: string,
  colors: string[] = ["#0a0a0f", "#1a1a2e"]
): { style: string; snippet: string; note: string } {
  const [a, b] = [colors[0] ?? "#0a0a0f", colors[1] ?? "#1a1a2e"]
  const s = style.toLowerCase()
  const snippet = /noise|grain|texture/i.test(s)
    ? `import { Noise } from "@remotion/noise";\n<AbsoluteFill style={{ background: "linear-gradient(135deg, ${a}, ${b})" }} />\n<Noise opacity={0.12} /> // seeded — deterministic across renders`
    : /grid|lines/i.test(s)
      ? `<AbsoluteFill style={{ background: "repeating-linear-gradient(0deg, ${a} 0 2px, ${b} 2px 120px)" }} />`
      : `<AbsoluteFill style={{ background: "radial-gradient(ellipse at 30% 20%, ${b}, ${a} 70%)" }} /> // animated: interpolate frame → backgroundPosition`
  return {
    style,
    snippet,
    note: `Procedural ${s || "gradient"} background in ${a}→${b}. Animated gradients interpolate the gradient stops/position by frame — never CSS transitions (they do not render).`,
  }
}
