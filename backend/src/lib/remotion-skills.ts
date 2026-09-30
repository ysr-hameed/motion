import { SKILLS, SKILLS_REMOTION_VERSION } from "./remotion-skills.generated"

/**
 * The composer's knowledge, selected per brief.
 *
 * Before this, the prompt carried a hand-written API summary that had
 * already drifted from the runtime in three places — it told the model to
 * animate `transform` (Remotion wants `scale`/`translate`/`rotate`), led
 * with `spring({frame})` instead of `Easing.spring()`, and never mentioned
 * `Interactive`, which is now the recommended way to author anything a user
 * should be able to edit. A summary is only as good as its last sync.
 *
 * So the knowledge is Remotion's own, vendored (see
 * `scripts/sync-remotion-skills.mjs`), and selection is a keyword match —
 * deterministic, zero tokens, and it keeps the prompt to what this cut
 * actually needs instead of all 106 KB.
 */

/** Skills every composition needs, whatever the brief. */
const ALWAYS_ON = ["SKILL", "timing", "sequencing", "compositions"] as const

/**
 * Brief keywords -> skill ids. First match wins per id; ids are deduped.
 * Deliberately generous: pulling in a relevant 3 KB file is far cheaper
 * than the composition coming back wrong.
 */
const TOPICS: Array<{ id: string; match: RegExp }> = [
  { id: "transitions", match: /transition|cuts?\s+to|scene (change|switch)|between scenes|wipe|dissolve|fade between|montage|multi-?scene/i },
  { id: "multi-scene-video", match: /multi|montage|story|sequence of|chapter|episode|narrative|explainer/i },
  { id: "audio", match: /audio|music|sound|voice|soundtrack|sfx|beat|song|track/i },
  { id: "voiceover", match: /voice ?over|narration|narrator|spoken|tts|dub/i },
  { id: "sfx", match: /\bsfx\b|sound effect|whoosh|impact sound/i },
  { id: "silence-detection", match: /silence|silent (gap|pause|section)|cut the dead air|remove the dead/i },
  { id: "audio-visualization", match: /waveform|equaliser|equalizer|audio react|spectrum|visuali[sz]er|\bfft\b|music video/i },
  { id: "images", match: /image|photo|picture|logo|poster|thumbnail|jpe?g|png|still/i },
  { id: "cropping", match: /crop|aspect|letterbox|pillarbox|fit|frame (the )?(image|video)/i },
  { id: "videos", match: /video|clip|footage|b-roll|mp4|movie/i },
  { id: "embedding-videos", match: /embed|trim|clip a video|segment|playhead|cut a video/i },
  { id: "gifs", match: /gif/i },
  { id: "lottie", match: /lottie|after effects|ae |bodymovin|rigged/i },
  { id: "3d", match: /3d|three|perspective|rotatex|rotatey|depth|cube|camera/i },
  { id: "motion-blur", match: /motion blur|trail|smear|streak/i },
  { id: "effects", match: /glitch|chromatic|aberration|bloom|glow|blur|distort|glitch|noise|grain|vignette|shadow|reflect/i },
  { id: "light-leaks", match: /light leak|flare|anamorphic|lens|bokeh/i },
  { id: "text-highlights", match: /highlight|underline|karaoke|caption|word by word|lyric/i },
  { id: "measuring-text", match: /fit (the )?text|text (box|measure|width)|wrap|truncate|font size|auto ?fit/i },
  { id: "measuring-dom-nodes", match: /measure|bounding ?box|get bounding|fit to (the )?(node|box)/i },
  { id: "google-fonts", match: /google font|loadfont|@remotion\/google-fonts|webfont/i },
  { id: "local-fonts", match: /local font|custom font|upload.*font|ttf|otf|woff/i },
  { id: "html-in-canvas", match: /html in canvas|dom to canvas|screenshot|rasteri[sz]e a dom/i },
  { id: "calculate-metadata", match: /calculateMetadata|dynamic (props|metadata)|duration.*from|props.*schema/i },
  { id: "parameters", match: /parameter|input prop|getInputProps|zod schema|user input|configurable/i },
  { id: "connected-compositions", match: /connect|outpaint|video inside|composition inside/i },
  { id: "video-editing", match: /video edit|edit the (video|footage|clip)|concat|timeline edit|trim the|reel out|rough cut/i },
  { id: "ffmpeg", match: /ffmpeg|convert|transcode|codec|reencode/i },
  { id: "saas", match: /saas|product|multi-tenant|embed.*player|user upload|api/i },
]

/** Hard ceiling. Beyond this the prompt stops being read carefully. */
const MAX_SELECTED = 7

export interface SelectedSkill {
  id: string
  content: string
}

/**
 * Which skills a brief needs. Always-on ones first, then the best
 * matches, capped so a brief stuffed with keywords cannot blow the budget.
 */
export function selectSkills(brief: string): SelectedSkill[] {
  const chosen: string[] = []
  for (const id of ALWAYS_ON) if (SKILLS[id]) chosen.push(id)

  const hits: Array<{ id: string; score: number }> = []
  for (const topic of TOPICS) {
    if (!SKILLS[topic.id] || chosen.includes(topic.id)) continue
    const m = brief.match(topic.match)
    if (m) hits.push({ id: topic.id, score: m[0].length })
  }
  // Strongest keyword signal first; ties break on id so selection is
  // stable across runs.
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  for (const h of hits.slice(0, Math.max(0, MAX_SELECTED - chosen.length))) {
    chosen.push(h.id)
  }

  return chosen
    .map((id) => ({ id, content: SKILLS[id]! }))
    .filter((s) => s.content.trim().length > 0)
}

/** The knowledge block injected into the composer's system prompt. */
export function renderSkills(skills: SelectedSkill[]): string {
  if (skills.length === 0) return ""
  return [
    "# REMOTION REFERENCE",
    "",
    "This is Remotion's own documentation, current for the exact version you are",
    "writing against. Follow it over any habit or memory you have — the API has",
    "moved and several rules here contradict what older training data says.",
    "",
    ...skills.map((s) => `<skill name="${s.id}">\n${s.content.trim()}\n</skill>`),
  ].join("\n")
}

/** One call: brief in, formatted knowledge block out. */
export function buildKnowledge(brief: string): string {
  return renderSkills(selectSkills(brief))
}

/** Ids available, for the public capabilities endpoint. */
export function skillIds(): string[] {
  return Object.keys(SKILLS).sort()
}

export { SKILLS_REMOTION_VERSION }
