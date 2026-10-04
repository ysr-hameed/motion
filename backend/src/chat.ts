import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat"
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  type GenerateTextOnFinishCallback,
  type ToolSet,
} from "ai"
import { createPacedFetch, setRequestsPerWindow } from "./rate-limit"

/**
 * Reads the gateway quota override (GATEWAY_RPM) so a key upgrade takes
 * effect without a code change. Missing or invalid → the 5 rpm default.
 */
function gatewayRpm(env: Env): number {
  const raw = Number((env as unknown as Record<string, unknown>).GATEWAY_RPM)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5
}
import { queueTurnSync } from "./lib/do-sync"
import { buildTools, CANVAS } from "./remotion/tools"
import { goldenStarter } from "./remotion/templates"
import { SKILL_IDS } from "./remotion/skills.generated"
import { DISPLAY_FACES, MAX_FONT, MIN_FONT, SAFE_MARGIN, TEXT_FACES, TYPE_SCALE } from "./remotion/type"
import { CompositionStore } from "./remotion/store"

/** Vercel AI Gateway, OpenAI-compatible. */
const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1"

export type ThinkingLevel = "off" | "low" | "high"

export type ModelTier = "auto" | "free" | "balanced" | "advance"

export interface ModelOption {
  id: string
  label: string
  blurb: string
  /** Shelf: auto router, free tier, cheap balanced, or strongest (output ≤ $0.30/1M). */
  tier: ModelTier
  /** True when the gateway serves this model text-only (image/file parts 400). */
  textOnly: boolean
  /** Effort levels this model accepts via the gateway reasoning option. */
  supportsEffort?: ThinkingLevel[]
}

/**
 * The models the chat switcher may offer. IDs are Vercel AI Gateway model
 * IDs — adding one here is all it takes for the UI to offer it.
 * Free ones first, then the cheapest paid ones with tool-use.
 */
/**
 * Every entry below answered a live generation probe ("Reply with exactly:
 * OK") on this gateway key. Removed after probing: qwen3.8-27b,
 * deepseek-v4-flash-0731, glm-5.3-flash, deepseek-v4.1-flash-fast and
 * qwen3.8-flash (free-tier key: "no access"), plus laya-free (not an LLM).
 */
export const MODELS: ModelOption[] = [
  {
    id: "auto",
    label: "Auto",
    blurb: "Picks per turn: vision/cuts → Qwen 3.7, plain chat → Ling 3.1",
    tier: "auto",
    textOnly: false,
  },
  {
    id: "alibaba/qwen3.7-flash",
    label: "Qwen 3.7 Flash",
    blurb: "Default · best coder · vision · 991K ctx",
    tier: "advance",
    textOnly: false,
    supportsEffort: ["off", "low", "high"],
  },
  {
    id: "alibaba/qwen3-coder-30b-a3b",
    label: "Qwen 3 Coder 30B",
    blurb: "Code specialist · text only",
    tier: "advance",
    textOnly: true,
  },
  {
    id: "mistral/mistral-small",
    label: "Mistral Small",
    blurb: "Strong all-rounder · text only",
    tier: "advance",
    textOnly: true,
  },
  {
    id: "alibaba/qwen3.5-flash",
    label: "Qwen 3.5 Flash",
    blurb: "Fast · text only",
    tier: "balanced",
    textOnly: true,
  },
  {
    id: "zai/glm-4.7-flash",
    label: "GLM 4.7 Flash",
    blurb: "Fast · text only",
    tier: "balanced",
    textOnly: true,
  },
  {
    id: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    blurb: "Fast · text only",
    tier: "balanced",
    textOnly: true,
  },
  {
    id: "mistral/ministral-8b",
    label: "Ministral 8B",
    blurb: "Small · text only",
    tier: "balanced",
    textOnly: true,
  },
  {
    id: "stepfun/step-3.5-flash",
    label: "Step 3.5 Flash",
    blurb: "Fast · text only",
    tier: "balanced",
    textOnly: true,
  },
  {
    id: "mistral/mistral-nemo",
    label: "Mistral Nemo",
    blurb: "Simple chats · text only",
    tier: "balanced",
    textOnly: true,
  },
  {
    id: "inclusionai/ling-3.1-flash",
    label: "Ling 3.1 Flash",
    blurb: "Free · text only",
    tier: "free",
    textOnly: true,
  },
  {
    id: "inclusionai/ling-3.1-flash-free",
    label: "Ling 3.1 Flash (free tier)",
    blurb: "Free routing · text only",
    tier: "free",
    textOnly: true,
  },
  {
    id: "inclusionai/ling-3.0-flash-sante",
    label: "Ling 3.0 Sante",
    blurb: "Free · text only",
    tier: "free",
    textOnly: true,
  },
  {
    id: "inclusionai/ling-3.0-flash-sante-free",
    label: "Ling 3.0 Sante (free tier)",
    blurb: "Free routing · text only",
    tier: "free",
    textOnly: true,
  },
  {
    id: "inclusionai/ling-3.0-flash",
    label: "Ling 3.0 Flash",
    blurb: "Free · text only",
    tier: "free",
    textOnly: true,
  },
  {
    id: "poolside/laguna-s-2.1-free",
    label: "Laguna S 2.1",
    blurb: "Free · text only · slow",
    tier: "free",
    textOnly: true,
  },
]

/**
 * Auto routing: vision attachments or an in-progress cut need the strongest
 * coder (Qwen 3.7); motion-brief words do too; everything else gets the
 * fastest free chat model. Deterministic per turn — no extra model call.
 */
export function resolveAuto(messages: Array<{ content?: unknown }>, hasCut: boolean): string {
  // Code-writing quality decides the cut, so the bias is strongly toward the
  // strongest coder: attachments, an in-progress cut, a design-word brief, or
  // simply a long message (briefs are long, chit-chat is short) all route to
  // Qwen. Only short plain chat gets the fastest free model.
  const motionWords = /video|motion|reveal|animat|logo|intro|sting|headline|kinetic|lower.?third|clip|scene|beat|compose|brief|typewrit|countdown|waveform|ticker|promo|product|brand|title|typogra|font|cinematic|trailer|teaser|launch|poster|mask|movie|film|slideshow|ad\b|ads\b|cut\b/i
  let briefLike = false
  let hasFiles = false
  let longest = 0
  const scan = (text: string) => {
    if (text.length > longest) longest = text.length
    if (motionWords.test(text)) briefLike = true
  }
  for (const m of messages) {
    const c = (m as { content?: unknown }).content
    if (typeof c === "string") {
      scan(c)
      continue
    }
    if (!Array.isArray(c)) continue
    for (const part of c as Array<{ type?: string; text?: string }>) {
      if (part?.type === "image" || part?.type === "file") hasFiles = true
      if (part?.type === "text" && typeof part.text === "string") scan(part.text)
    }
  }
  if (hasFiles || hasCut || briefLike || longest > 140) return DEFAULT_MODEL
  return "inclusionai/ling-3.1-flash"
}

/**
 * The model a new chat session starts on.
 *
 * 50x fix: the default was the weakest free text-only model, which wrote the
 * worst code on the platform whose whole job is code. Qwen 3.7 Flash is the
 * strongest coder with vision + 991k context on this gateway ($0.03/1M) — a
 * motion designer that cannot write bundles is not a motion designer.
 */
export const DEFAULT_MODEL = "alibaba/qwen3.7-flash"

/**
 * Ceiling on model round trips per turn.
 *
 * Pacing is adaptive now (see rate-limit.ts): steps stream back-to-back at
 * ~1-3s while quota remains and only slow down when the gateway says the
 * bucket is dry. So this is headroom, not a time budget: skills, plan,
 * write, validate, preview and a closing sentence is ~7 steps, and a
 * rejected write that has to be re-issued pushes it past ten. Setting this
 * lower silently truncated turns before the agent ever spoke, which read as
 * a crash. 12 keeps the headroom while capping runaway cost; loop caps
 * (pending-report ×2, code-dump guard) stop runaways instead of this number.
 */
const MAX_STEPS = 12

const FRAME_RANGE = `frames 0 to ${CANVAS.maxFrames - 1}`

/**
 * The model's own notes about pacing, so a wait reads as deliberate rather
 * than broken — the paced fetch can hold a turn for several seconds.
 *
 * Workflow decision tree (the prompt itself is the source of truth; this
 * comment is for the engineer, not the model):
 *
 *   NEW BRIEF (FAST PATH — default)
  *     quick_start → preview_composition → read_render_report
 *     → ONE SENTENCE   (3 tool calls; golden file already has spring,
 *     easing, clamps, stagger, Fonts.*, Lucide namespace)
 *     Refine AFTER the verified preview with edit_file — never rewrite.
 *
 *   NEW BRIEF (FULL PATH — only when no template fits)
 *     intent_deep_analyze → layout_plan (2+ elements)
 *     → load_motion_preset per beat → plan_motion
 *     → write_composition (auto-repairs inline) → verify_no_errors [BLOCKING]
 *     → preview_composition → read_render_report → ONE SENTENCE
 *
 *   FOLLOW-UP EDIT ("change the colour", "fix the headline")
 *     read_file → edit_file / bulk_edit → validate_composition
 *     → verify_no_errors [BLOCKING] → preview_composition
 *     → read_render_report → ONE SENTENCE
 *
 *   FOLLOW-UP DIRECTION ("faster", "more dramatic", "add depth")
 *     load_motion_preset for affected beats → edit_file (timing only)
 *     → validate_composition → verify_no_errors [BLOCKING]
 *     → preview_composition → read_render_report → ONE SENTENCE
 *
 * Key constraints surfaced by testing:
 * - prefetch_tools wipes the blackboard — call it ONLY on a new brief.
 * - Every tool call costs ~12 s of wall time; 12 steps total per turn.
 *   Batch independent reads with execute_batch; never call a tool you will
 *   not use.
 * - verify_no_errors is a hard gate. Never call preview_composition on
 *   ok:false or on a pending/failed prior player report.
 * - load_motion_preset is REQUIRED per beat — never write spring() or
 *   Easing.bezier() values from memory.
 * - Auto-fix loop runs at most twice: validate → auto_fix_code / 
 *   auto_enhance_motion → verify_no_errors. After two passes, fix by hand.
 * - The turn MUST end with one spoken sentence after read_render_report.
 *   A turn that closes on a tool call reads as a crash.
 */
const SYSTEM = `You are SlyxUp Motion — a senior motion designer who writes production-ready
web motion bundles (HTML + CSS + JS). You produce real bundle parts through tools, never pseudocode.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE CUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Canvas ${CANVAS.width}×${CANVAS.height} at ${CANVAS.fps}fps, ${FRAME_RANGE}. Clips under 30s.
One bundle per conversation: html (markup for #wm-stage) + css (scoped
stylesheet) + js (a script defining function render(t, ctx), optionally
function init(ctx)). No <html>/<head>/<body> in the html part, no <script>
tags anywhere except meta.assets, no import/export statements — helpers
arrive on ctx: ctx.interpolate, ctx.Easing, ctx.spring, ctx.rand,
ctx.el/ctx.q/ctx.qa, ctx.frame/ctx.t/ctx.fps.
Time is t (seconds) and NOTHING else: every move is a pure function of t.
Wall-clock (Date.now, performance.now, setInterval), Math.random(), event
handlers, and CSS keyframes on their own clock all break scrub and export —
the validator refuses them. In render(), start with \`var f = ctx.frame;\`
and read windows in frames, springs in seconds: ctx.spring(t - startSec, {...}).
Fonts: cite Google families by name in CSS (font-family: 'Unbounded') — the
runtime auto-loads them. NEVER system-ui/sans-serif/Arial/Helvetica/Inter/Roboto.
Icons: inline <svg> ONLY (24×24, stroke=currentColor). No icon packages exist
in the sandbox — never <img> an icon, never a CDN icon font.
Constants first: ALL tunable values (COLORS, TEXT, TIMING, LAYOUT) as
UPPER_SNAKE_CASE consts at the top of render() — users customize without
reading logic.
Use CSS shorthand transforms: scale / translate / rotate — NOT transform strings.
Animate translate/scale/opacity + letterSpacing only — never fontSize.
Beats overlap in time: next element starts 10-15f before the previous ends.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOTION PRINCIPLES (load_skill("cinematic-motion") for detail)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANTICIPATION: dip opposite first (scale 0.92→1.08→1.00, 4-6f wind-up).
SETTLE: ctx.spring() landings, never linear. Damping 10-18 bouncy, 25-40 tight.
OVERLAP: next element starts 10-15f before previous ends. Stagger siblings 4-6f.
DEPTH: at least one Z-space move. Parallax: bg moves 20% of fg speed.
CURVES: every ctx.interpolate() gets an easing or a spring — NEVER linear.
  Ease-out entrances: ctx.Easing.bezier(0.16, 1, 0.3, 1). Ease-in exits: (0.4, 0, 1, 1).
  ctx.interpolate clamps by default — no extrapolate options exist.
KEYFRAMES-FIRST: this is a motion GRAPHICS generator — every hero move is a
  3-stop keyframe sequence (anticipation → overshoot → settle), never a
  single A→B slide. load_motion_preset returns the keyframes snippet per
  beat: anticipation dip (0.94), overshoot peak (1.06–1.12), spring landing.
  A cut with only 2-stop moves reads as basic no matter the palette.
NARRATIVE: frame 1 has a focal element. Info arrives in order of importance.
  Final frame resolves — never a hard stop mid-motion.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKFLOW — be economical. FAST PATH is 3 calls: quick_start → preview → report.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━────────
ANOTHER VARIANT ("make this another type", "different style", "try X"):
quick_start with a DIFFERENT mood word + same product/headline/seconds,
then preview → report. NEVER the full path — new skills, presets and plans
for a restyle burn minutes for what one call already does. The starter
picks palette + fonts + layout FROM THE MOOD, so a new mood IS a new cut.
Only go full path when the user names a new MECHANIC (typewriter,
countdown, ticker, chart) the current shape cannot do.

NEW BRIEF — FAST PATH (default, 3 calls):
1. quick_start(product, headline, mood, seconds) — plans+writes+validates a
   DESIGNED cut in one call: palette + font pair + layout are picked from
   the mood, timing from seconds. Always pass mood (one word) and seconds.
   SKIP quick_start when the brief names a specific mechanic (countdown,
   waveform, ticker, chart): the starter is the wrong shape and you will
   rewrite it anyway — go FULL PATH. Lower-thirds, typewriter and kinetic
   masks HAVE starters (overlay / terminal / mask variants) — use them.
   SKIP prefetch_tools, intent_deep_analyze, layout_plan, load_motion_preset, plan_motion.
2. preview_composition() — only after quick_start ok:true
3. read_render_report() — waits for browser compile+mount
4. ONE SENTENCE — state the verified result and stop.
Refine AFTER verified preview with edit_file. NEVER rewrite a verified cut.

NEW BRIEF — FULL PATH (only when no template fits):
1. creative_direct(brief) — intent+palette+fonts+beat→preset map in ONE call.
   Then layout_plan(...) when 2+ elements share the frame.
   Load the FIRST example skill it names before writing — imitate its
   structure/timing/easing, converted to bundle scope (markup + CSS + render(t, ctx)).
   NEVER write ctx.spring()/ctx.Easing.bezier() values from memory — copy from presets.
   load_skill("creative-direction") once; "kinetic-typography" when type-led;
   "cinematic-motion" for aliveness; "layout-composition" for 3+ elements.
2. plan_motion(beats) — real frame numbers, real props, real easing
3. write_composition(html, css, js, duration, title) — WHOLE bundle; mechanical repairs apply inline.
4. verify_no_errors — ★ BLOCKING GATE
5. preview_composition() — only after verify_no_errors ok:true
6. read_render_report()
7. ONE SENTENCE

FOLLOW-UP EDIT: read_file → edit_file/bulk_edit → validate_composition →
  verify_no_errors [BLOCKING] → preview_composition → read_render_report → ONE SENTENCE

FOLLOW-UP DIRECTION ("faster", "more dramatic"): load_motion_preset → edit_file
  (retiming only) → validate_composition → verify_no_errors → preview → report → SENTENCE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY GATES ★ NON-NEGOTIABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
★ verify_no_errors ok:true REQUIRED before preview_composition. Blocks on errors
  AND failed player report. Layout warnings are advisory — fix only if cheap.
★ Auto-fix: validate → auto_fix_code/auto_enhance → verify_no_errors. Max TWO rounds.
★ Must contain: ≥1 ctx.spring(), easing on every animated element,
  stagger (start + i×4-6f) in every generated list, no
  system-ui/sans-serif/Arial/Helvetica/Inter/Roboto font-family (validator error).
  Linear-only timing and stagger-less lists are refused at write — never submit them.
★ review_motion findings are fix instructions, not advisory. Fix before verify.
★ Browser-measured overlap/overflow (read_render_report findings) describe REAL
  pixels on a real render — fix them with edit_file before the closing sentence.
  Only entrances/exits passing through off-canvas are exempt.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TYPOGRAPHY (load_skill("typography") for full catalogue)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Frame ${CANVAS.width}×${CANVAS.height}. Scale: hero ${TYPE_SCALE.hero[0]}-${TYPE_SCALE.hero[1]}px,
sub ${TYPE_SCALE.sub[0]}-${TYPE_SCALE.sub[1]}px, body ${TYPE_SCALE.body[0]}-${TYPE_SCALE.body[1]}px,
caption ${TYPE_SCALE.caption[0]}-${TYPE_SCALE.caption[1]}px, kicker ${TYPE_SCALE.kicker[0]}-${TYPE_SCALE.kicker[1]}px.
Nothing under ${MIN_FONT}px or over ${MAX_FONT}px. Display lineHeight 0.95-1.05, body 1.3-1.5.
Keep elements ≥${SAFE_MARGIN}px from frame edge.

FONTS — ANY Google Fonts family works, not just the curated list. Cite
the family by name in CSS (font-family: 'Playfair Display') — the sandbox
runtime fetches the stylesheet and waits for it automatically. Curated starting points:
display: ${DISPLAY_FACES.join(", ")}
text/UI: ${TEXT_FACES.join(", ")}
Pairings: modern→Unbounded+Manrope, bold→Anton+Archivo, playful→Bricolage Grotesque+Karla,
editorial→Syne+Newsreader, elegant→Instrument Serif+Newsreader, fashion→Fraunces+Karla,
futuristic→Space Grotesk+Space Mono, poster→Bebas Neue+Outfit, romantic→Dancing Script or
Great Vibes, marker→Caveat or Pacifico.
One display (or script) + one text face per composition. Never two display faces.
Never Inter or Roboto unless the user explicitly names them — pick something
with character. Never system-ui/sans-serif/Arial/Helvetica (validator error).
USER-NAMED STYLE IS LAW: when the brief names a font or style
("handwritten", "caveat", "mono", "serif"), call font_resolve FIRST and use
its snippet EXACTLY — no substitutes, no "similar" faces. Script faces render
~30% smaller: size heroes at 1.4x. Then PROVE it: read_render_report now
carries a fonts status per family (loaded vs fallback) — a verified render
with the family on fallback is NOT done. Never claim a font change worked
from an edit result alone; only a loaded status counts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ASSETS & Z-INDEX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Remote <img>/<video> URLs: always add crossOrigin="anonymous" — export
snapshots cannot paint them without it. https only (the sandbox CSP blocks http).
Never invent URLs. Use a CSS gradient or text stand-in if no real URL.
Third-party JS/CSS loads ONLY via meta.assets (pinned https CDN, ≤6 files).
Z-index: background=1, content=10, overlays=20, UI/40. DOM order usually paints fine.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEHAVIOUR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Say nothing between tool calls. Never narrate the request.
Never narrate tool calls in chat text: no markdown tables, no per-tool
recaps ("| edit_file | ok:true |"), no "Verified fix" paragraphs, no
repeating what a tool just returned. The UI renders the tool log itself —
anything you restate in chat is noise on top of it. The ONLY words in a
turn are the single closing sentence after read_render_report.
CODE LIVES IN TOOLS, NEVER IN CHAT. write_composition / edit_file / bulk_edit
are the only places bundle code may ever appear. Never output markup, CSS, JS,
code fences, or diffs as chat text — a cut pasted into chat cannot preview,
cannot validate, and reads as broken. If a code block starts forming in your reply,
stop it and issue the tool call instead.
Never claim a write succeeded unless the tool result says ok:true.
preview_composition ok:true = PUBLISHED, not rendered. Only read_render_report
status "verified" means the cut runs in the browser.
Change only what the request touches. "Faster" = retiming, not restyling.
If a tool errors, fix the named thing and call once more. Do not repeat a failing call.
read_file BEFORE every edit_file/bulk_edit — find strings are copied, never
guessed. After 2 failed edits on one target, stop and read_file again.
Never write diagnostic/probe/throwaway code to "inspect" the runtime (a
throw that dumps globals, a mystery CDN to see what loads). Scope
questions are answered by load_skill docs, not by experiments in the cut.
Fonts are Google families cited in CSS (script faces: 'Dancing Script',
'Caveat', 'Pacifico', 'Great Vibes', 'Satisfy', 'Shadows Into Light').
Never @import a font in CSS, never invent a loader — the runtime injects
the stylesheet for every cited family.
A rejected write_composition means nothing was saved — fix errors and rewrite.
NEVER interrogate the user for product/headline/mood/seconds — infer them
from the brief and build immediately (defaults: product = the subject or
SlyxUp, headline = the subject in words, mood = cinematic, seconds = 5).
Ask at most ONE question per turn and only when the SUBJECT itself is
unknowable ("make something cool" with zero context). A brief like "motion
show code: broken JS then fixed" already contains everything: build it.
Questions cost a full round trip; a wrong guess costs one edit. Always
guess and build.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLOSING RULE (non-negotiable)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After read_render_report, write exactly ONE sentence: which version is live, or the
exact browser failure and what you changed. Nothing before or after. If pending/failed,
say so plainly and stop. A turn ending on tool calls reads as a crash.
SHOW-DON'T-CLAIM: the closing sentence must describe what the TOOLS PROVED,
never what you intended. If the user asked for X, the sentence names the
version where read_file/validate/report CONFIRMED X is present — "v11 uses
caveat (report: loaded)". If no tool confirmed it, say what is still missing
instead of claiming done.

Available skill ids:
${SKILL_IDS.join(", ")}`

export interface ChatState {
  /** modelId -> epoch ms before which the model is skipped. */
  cooldown?: Record<string, number>
  /** The model this session generates with (one of MODELS). */
  model?: string
  /** Reasoning effort for this session. Defaults to "low". */
  thinking?: ThinkingLevel
  /** The latest render report posted by the browser for a published version. */
  audit?: RenderReport
}

/**
 * Default effort: OFF. Reasoning tokens are the "keeps thinking for 5
 * minutes" complaint — Ling reasons by default and only stops on
 * `reasoning_effort: "none"`. Speed is the product here; the agent has
 * validators, presets and repair loops for correctness, it does not need to
 * think out loud first. Users who want deeper reasoning pick High.
 */
export const DEFAULT_THINKING: ThinkingLevel = "off"

/**
 * Maps the session's thinking level to a gateway reasoning option.
 *
 * Only ever sends values a model is known to accept. Crucially, Ling-family
 * free models reason BY DEFAULT and only accept "none" — any other value
 * 400s, and undefined leaves reasoning ON (the 5-minute hang). So low/off
 * both map to "none" on specs without explicit supportsEffort: never leave
 * a free model on its slow default.
 */
export function effortFor(
  spec: ModelOption | undefined,
  thinking: ThinkingLevel | undefined
): "none" | "low" | "high" | undefined {
  const level = thinking ?? DEFAULT_THINKING
  // High is capped at medium: full reasoning dumps ~10k words and stalls
  // the turn for minutes while rarely changing the cut — validators,
  // presets and repair loops carry correctness, not chain-of-thought.
  // "High" therefore means low effort, deliberately.
  if (level === "high") return spec?.supportsEffort?.includes("low") ? "low" : "none"
  if (level === "low") {
    if (spec?.supportsEffort?.includes("low")) return "low"
    // Free/text-only models with no declared effort levels: kill reasoning.
    return "none"
  }
  // "off" — Ling accepts "none"; flagged models map off to their minimum.
  if (/ling/i.test(spec?.id ?? "")) return "none"
  if (spec?.supportsEffort?.includes("off")) return "none"
  // Unknown spec: still prefer no reasoning — fast default beats slow default.
  return "none"
}

/** What the browser reported about a published version: the only render truth. */
export interface RenderReport {
  version: number
  /** True when the cut compiled AND mounted in the player. */
  ok: boolean
  /** Compile-only reports set phase:"compile" — never enough to verify. */
  phase?: "compile" | "mount" | "layout" | "runtime"
  /** Compile/runtime failure text, or compile timing on success. */
  message?: string
  /** Frame a layout measurement was taken at, if any. */
  frame?: number
  /** Layout findings measured on the real render (advisory, not blocking). */
  findings: string[]
  /** Per-family font load truth: loaded vs silent fallback. */
  fonts?: Array<{ family: string; ok: boolean }>
  at: number
}

/**
 * The latest read_render_report outcome in this turn's steps, if any.
 * prepareStep uses it to decide whether the turn may close (verified),
 * must verify first (no read yet), or stays open for the fix round.
 */
function lastReadStatus(
  steps: readonly {
    toolResults?: readonly { toolName?: string; output?: unknown }[]
  }[],
): "verified" | "failed" | "pending" | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    const results = steps[i]?.toolResults ?? []
    for (let j = results.length - 1; j >= 0; j--) {
      const r = results[j]
      if (r?.toolName === "read_render_report") {
        const status = (r.output as { status?: unknown } | null)?.status
        if (status === "verified") return "verified"
        if (status === "failed") return "failed"
        return "pending"
      }
    }
  }
  return null
}

/**
 * Template-port sanitize (mechanism, not words): did the last step dump
 * bundle code as chat text instead of calling a code tool?
 *
 * The template never has this failure mode — streamed text IS its product —
 * but here text code cannot preview or validate. When detected (and no code
 * tool ran yet this turn), prepareStep forces write_composition so the model
 * puts the code where it belongs instead of ending on a code block.
 * Defensive by design: any doubt returns false and the turn flows as before.
 */
function chatCodeDumped(steps: readonly unknown[]): boolean {
  try {
    const last = steps[steps.length - 1] as { content?: unknown } | undefined
    const content = last?.content
    if (!Array.isArray(content)) return false
    for (const part of content as Array<{ type?: unknown; text?: unknown }>) {
      if (part?.type !== "text" || typeof part.text !== "string") continue
      const t = part.text
      if (/```(?:html|css|js|tsx|ts|jsx)?\s*\n?\s*(?:<div|render\s*\(|function\s+render)/i.test(t)) return true
      if (
        /function\s+render\s*\(\s*t\b/i.test(t) &&
        /ctx\.interpolate\(|ctx\.spring\(|getElementById/i.test(t)
      )
        return true
    }
  } catch {
    return false
  }
  return false
}

/**
 * Pending render reports since the last code change. Each read already waits
 * ~24s for the browser; looping preview→read→preview→read on an unchanged
 * cut burns paced model calls (~12s each) for nothing — observed live as
 * three identical pending rounds before the turn closed. After two, the turn
 * must end with the honest unconfirmed sentence instead of a third loop.
 * Defensive: any doubt returns 0 and the turn flows as before.
 */
function pendingReadsSinceChange(
  steps: readonly {
    toolCalls?: readonly { toolName?: string }[]
    toolResults?: readonly { toolName?: string; output?: unknown }[]
  }[],
): number {
  try {
    let pending = 0
    for (const step of steps) {
      for (const call of step.toolCalls ?? []) {
        if (
          call?.toolName === "write_composition" ||
          call?.toolName === "edit_file" ||
          call?.toolName === "bulk_edit" ||
          call?.toolName === "quick_start"
        ) {
          pending = 0
        }
      }
      for (const r of step.toolResults ?? []) {
        if (r?.toolName === "read_render_report") {
          const status = (r.output as { status?: unknown } | null)?.status
          if (status === "pending") pending += 1
          else pending = 0
        }
      }
    }
    return pending
  } catch {
    return 0
  }
}

export class Chat extends AIChatAgent<Env, ChatState> {
  maxPersistedMessages = 500
  initialState: ChatState = {}

  private store: CompositionStore | undefined

  /**
   * Raw DDL for the composition store.
   *
   * The Agents SDK's `sql` helper is typed for SELECT and `ctx` is protected,
   * so the store needs one explicit way to create its tables. Exposed as a
   * narrow method rather than a cast so the seam stays obvious.
   */
  execDdl(statement: string): void {
    this.ctx.storage.sql.exec(statement)
  }

  /**
   * Serves the current bundle to the browser's sandbox player.
   *
   * This is a separate HTTP sub-path rather than part of the chat transcript,
   * because the player needs the source and the model does not: shipping the
   * whole file through a tool result would put thousands of tokens of code
   * into the context on every preview, which is exactly the bloat that made
   * the previous implementation expensive.
   *
   * Everything not claimed here falls through to AIChatAgent, which owns
   * /get-messages and the rest of its own routing.
   */
  async onRequest(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname
    const store = this.store ?? new CompositionStore(this)

    if (path.endsWith("/composition")) {
      const { code, plan, version } = store.current()
      return Response.json({ code, plan, version })
    }

    // Instant starter: publish a golden composition with ZERO model calls, so
    // the user sees designed motion in under 2s while the agent refines it.
    // Goldens are pre-validated files (spring, easing, clamps, stagger), the
    // same ones quick_start publishes — the agent then edits, never rewrites.
    if (path.endsWith("/starter") && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          product?: string
          brand?: string
          headline?: string
          mood?: string
          seconds?: number
        }
        const golden = goldenStarter({
          ...(body.product ? { product: body.product.slice(0, 60) } : {}),
          ...(body.brand ? { brand: body.brand.slice(0, 60) } : {}),
          ...(body.headline ? { headline: body.headline.slice(0, 140) } : {}),
          ...(body.mood ? { mood: body.mood.slice(0, 30) } : {}),
          ...(typeof body.seconds === "number" ? { seconds: Math.min(30, Math.max(2, Math.round(body.seconds))) } : {}),
        })
        store.setPlan(golden.plan)
        const n = store.write(golden.code, { bumpVersion: true })
        return Response.json({ ok: true, version: n, title: golden.plan.title })
      } catch {
        return Response.json({ ok: false, error: "bad starter request" }, { status: 400 })
      }
    }

    // The browser posts render reports for every published version: compile
    // success/failure, player runtime errors, and layout measurements from the
    // real render. Kept off the chat transcript; the agent reads it through
    // read_render_report, which is the only render claim it may ever make.
    // Reports are ordered by version — a stale tab's late report for an older
    // cut never overwrites a newer one.
    if (path.endsWith("/audit") && request.method === "POST") {
      const body = (await request.json()) as {
        version?: number
        ok?: boolean
        phase?: "compile" | "mount" | "layout" | "runtime"
        message?: string
        line?: number
        frame?: number
        findings?: string[]
        fonts?: Array<{ family?: unknown; ok?: unknown }>
      }
      const prev = this.state?.audit
      const version = Math.max(0, Math.floor(Number(body.version) || 0))
      if (!prev || version >= prev.version) {
        const rawMessage = typeof body.message === "string" ? body.message.slice(0, 500) : ""
        const message =
          rawMessage && body.line !== undefined ? `${rawMessage} (line ${body.line})` : rawMessage
        const incoming = (body.findings ?? []).slice(0, 12)
        const merged = prev && version === prev.version ? [...prev.findings, ...incoming] : incoming
        // Font load truth from the browser: which cited families actually
        // resolved vs silently fell back. Latest report wins per family.
        const incomingFonts = Array.isArray(body.fonts)
          ? body.fonts
            .filter((f) => typeof f?.family === "string" && (f.family as string).length > 0)
            .slice(0, 12)
            .map((f) => ({ family: (f.family as string).slice(0, 60), ok: f.ok === true }))
          : []
        const prevFonts = prev && version === prev.version ? (prev.fonts ?? []) : []
        const byFamily = new Map(prevFonts.map((f) => [f.family, f]))
        for (const f of incomingFonts) byFamily.set(f.family, f)
        const fonts = [...byFamily.values()].slice(0, 12)
        // A stale compile-only report must never overwrite a newer
        // mount/runtime verdict for the same version.
        const incomingRank = body.ok === false ? 2 : body.phase === "compile" ? 0 : 1
        const prevRank = !prev || prev.version !== version ? -1 : prev.ok === false ? 2 : (prev.phase ?? "layout") === "compile" ? 0 : 1
        if (incomingRank < prevRank) {
          return new Response(null, { status: 204 })
        }
        this.setState({
          ...(this.state ?? {}),
          audit: {
            version,
            ok: body.ok !== false,
            ...(body.phase ? { phase: body.phase } : {}),
            ...(message ? { message } : {}),
            ...(typeof body.frame === "number" ? { frame: body.frame } : {}),
            findings: [...new Set(merged)].slice(0, 12),
            ...(fonts.length > 0 ? { fonts } : {}),
            at: Date.now(),
          },
        })
      }
      return new Response(null, { status: 204 })
    }

    // Per-session model selection for the chat switcher. POST {model} with
    // one of the allowlisted IDs; GET returns the current model plus the
    // list. The session id in the URL is an unguessable capability URL, the
    // same trust level as /audit and /rating — no user session needed.
    if (path.endsWith("/model")) {
      if (request.method === "POST") {
        let body: { model?: unknown; thinking?: unknown }
        try {
          body = (await request.json()) as { model?: unknown; thinking?: unknown }
        } catch {
          return Response.json({ ok: false, error: "bad json" }, { status: 400 })
        }
        const next = { ...(this.state ?? {}) }
        if (body.model !== undefined) {
          const id = String(body.model ?? "")
          if (!MODELS.some((m) => m.id === id)) {
            return Response.json({ ok: false, error: "unknown model", available: MODELS }, { status: 400 })
          }
          next.model = id
        }
        if (body.thinking !== undefined) {
          const t = String(body.thinking ?? "")
          if (t !== "off" && t !== "low" && t !== "high") {
            return Response.json({ ok: false, error: "unknown thinking level" }, { status: 400 })
          }
          next.thinking = t
        }
        this.setState(next)
        return Response.json({ ok: true, model: next.model ?? DEFAULT_MODEL, thinking: next.thinking ?? DEFAULT_THINKING })
      }
      return Response.json({
        model: this.state?.model ?? DEFAULT_MODEL,
        thinking: this.state?.thinking ?? DEFAULT_THINKING,
        available: MODELS,
      })
    }

    // Single-model generation probe: one tiny text completion (16 tokens,
    // no tools) to prove the gateway serves this id end-to-end. POST only,
    // id must look like a gateway model id. Spend is ~a hundredth of a cent
    // per probe on flash pricing — this is how new ids earn a MODELS entry.
    if (path.endsWith("/model-probe") && request.method === "POST") {
      try {
        const body = (await request.json()) as { id?: unknown }
        const id = String(body.id ?? "")
        if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9._-]+$/i.test(id) || id.length > 120) {
          return Response.json({ ok: false, error: "bad model id" }, { status: 400 })
        }
        const { generateText } = await import("ai")
        setRequestsPerWindow(gatewayRpm(this.env))
        const openai = createOpenAICompatible({
          name: "gateway",
          baseURL: GATEWAY_BASE,
          apiKey: this.env.AI_GATEWAY_API_KEY,
          fetch: createPacedFetch() as typeof fetch,
        })
        const started = Date.now()
        const out = await generateText({
          model: openai(id),
          prompt: "Reply with exactly: OK",
          maxOutputTokens: 16,
          maxRetries: 0,
        })
        return Response.json({ ok: true, id, text: out.text.slice(0, 60), ms: Date.now() - started })
      } catch (err) {
        return Response.json({ ok: false, error: String(err).slice(0, 300) }, { status: 502 })
      }
    }

    // Live gateway catalogue probe: which configured model ids the gateway
    // actually serves right now. Read-only, no generation, no spend — the
    // picker uses it for its "Test all" status, and it is how new free-tier
    // ids get confirmed before being added to MODELS.
    if (path.endsWith("/models-live")) {
      try {
        const res = await fetch(`${GATEWAY_BASE}/models`, {
          headers: { Authorization: `Bearer ${this.env.AI_GATEWAY_API_KEY}` },
        })
        if (!res.ok) {
          return Response.json({ ok: false, error: `gateway ${res.status}` }, { status: 502 })
        }
        const data = (await res.json()) as { data?: Array<Record<string, unknown>> }
        const ids = (data.data ?? []).map((m) => String((m as { id?: string }).id ?? "")).filter(Boolean)
        const set = new Set(ids)
        const full = new URL(request.url).searchParams.get("full") === "1"
        return Response.json({
          ok: true,
          count: ids.length,
          // "auto" is a local routing sentinel, not a gateway id — it is
          // always available, so it never appears as a red dot.
          status: MODELS.filter((m) => m.id !== "auto").map((m) => ({ id: m.id, live: set.has(m.id) })),
          ...(full ? { catalog: data.data ?? [] } : {}),
        })
      } catch (err) {
        return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 })
      }
    }

    if (path.endsWith("/versions")) {      const { version } = store.current()
      return Response.json({
        current: version,
        versions: store.versions().map((v) => ({
          n: v.n,
          lines: v.code.split("\n").length,
          bytes: v.code.length,
          title: v.plan?.title ?? null,
        })),
      })
    }

    // Phase 2 satisfaction capture (§8.3): ★ rating per version, off-transcript.
    if (path.endsWith("/rating") && request.method === "POST") {
      try {
        const body = (await request.json()) as { version?: number; stars?: number }
        const stars = Math.min(5, Math.max(1, Math.round(Number(body.stars) || 0)))
        if (stars >= 1) store.recordRating(Number(body.version) || 0, stars)
      } catch {
        // Advisory — never fail the request path on a rating.
      }
      return new Response(null, { status: 204 })
    }

    // Phase 5 product analytics: fire-and-forget client events (compile ms,
    // preset picks). Advisory rows in composition_analytics — never 4xx here,
    // so a tracking call can never break the UI that sent it.
    if (path.endsWith("/event") && request.method === "POST") {
      try {
        const body = (await request.json()) as { name?: string; detail?: string }
        if (typeof body.name === "string" && body.name) {
          store.trackEvent(body.name.slice(0, 60), String(body.detail ?? "").slice(0, 300))
        }
      } catch {
        // Advisory only.
      }
      return new Response(null, { status: 204 })
    }

    return super.onRequest(request) as Promise<Response>
  }

  private coolDown(modelId: string) {
    this.setState({
      ...(this.state ?? {}),
      cooldown: { ...(this.state?.cooldown ?? {}), [modelId]: Date.now() + 90_000 },
    })
  }

  async onChatMessage(
    onFinish: GenerateTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions
  ) {
    const apiKey = this.env.AI_GATEWAY_API_KEY
    if (!apiKey) {
      throw new Error(
        "AI_GATEWAY_API_KEY is not set. Add it to .dev.vars locally, " +
          "or run `wrangler secret put AI_GATEWAY_API_KEY` on the deployed Worker."
      )
    }

    this.store ??= new CompositionStore(this as never)
    const tools = buildTools(this.store, this as never)
    const store = this.store
    const turnStarted = Date.now()
    // Best-effort brief for analytics: last user text, truncated in recordTurn.
    const brief = (() => {
      try {
        const last = [...this.messages].reverse().find((m) => m.role === "user")
        const parts = (last?.parts ?? []) as Array<Record<string, unknown>>
        const text = parts
          .filter((p) => p.type === "text" && typeof p.text === "string")
          .map((p) => p.text as string)
          .join(" ")
        return text || "(non-text brief)"
      } catch {
        return "(unknown brief)"
      }
    })()

    // One paced fetch per turn: every model call, including each tool-loop
    // step, goes through it, so the 5-req/min gateway limit is respected
    // without the agent having to know it exists.
    /**
     * openai-compatible, not @ai-sdk/openai.
     *
     * The gateway speaks the OpenAI wire format but serves Qwen, whose
     * reasoning arrives in a `delta.reasoning` field. @ai-sdk/openai only maps
     * OpenAI's own Responses API reasoning, so the chain of thought was being
     * dropped and the UI showed no thinking at all. The compatible provider maps
     * `delta.reasoning` directly, which is exactly what a third-party
     * OpenAI-compatible endpoint needs.
     */
    setRequestsPerWindow(gatewayRpm(this.env))
    const openai = createOpenAICompatible({
      name: "gateway",
      baseURL: GATEWAY_BASE,
      apiKey,
      fetch: createPacedFetch() as typeof fetch,
    })

    // The switcher stores the session's pick in DO state; a session that
    // never picked gets the default. Model quirks below are keyed off the
    // spec, not the id, so adding a MODELS entry is enough to support it.
    const modelMessages = (await convertToModelMessages(this.messages)) as Array<any>
    const picked = this.state?.model ?? DEFAULT_MODEL
    const activeModel =
      picked === "auto"
        ? resolveAuto(modelMessages, store.current().code.length > 0)
        : picked
    const spec = MODELS.find((m) => m.id === activeModel)
      ?? MODELS.find((m) => m.id === DEFAULT_MODEL)
      ?? MODELS[0]

    const result = streamText({
      model: openai(activeModel),
      system: SYSTEM,
      tools,
      messages: pruneMessages({
        // Text-only models (Ling on this gateway) 400 image/PDF file parts,
        // while a manual text-only curl succeeds. The frontend still attaches
        // references as file parts, so downgrade them to a text note instead
        // of failing the whole turn. Vision models keep the parts as-is.
        messages: (spec.textOnly
          ? modelMessages.map((m) => {
              const content = (m as { content?: unknown }).content
              if (!Array.isArray(content)) return m
              let stripped = false
              const kept: Array<any> = []
              for (const part of content as Array<{ type?: string }>) {
                if (part?.type === "image" || part?.type === "file") {
                  stripped = true
                  continue
                }
                kept.push(part)
              }
              if (!stripped) return m
              return {
                ...m,
                content: [
                  ...kept,
                  { type: "text", text: "[Reference image/PDF omitted: this model accepts text only. Describe the reference in words.]" },
                ],
              }
            })
          : modelMessages) as never,
        // Ling has a 262k context window (not 991k like Qwen), so pruning is
        // only here to keep each request cheap — not a hard constraint.
        // Reasoning and old tool output are dead weight once a newer turn exists.
        reasoning: "before-last-message",
        toolCalls: "before-last-2-messages",
      }),
      stopWhen: stepCountIs(MAX_STEPS),
      /**
       * Reasoning effort follows the session's thinking level, mapped through
       * effortFor() — which only ever emits values the model is known to
       * accept. Ling 3.1 Flash reasons by default and only accepts
       * `reasoning_effort: "none"` (anything else 400s); flagged models take
       * off/low/high. Unknown combinations resolve to undefined (the model's
       * own default), so an unsupported preference can never fail a turn.
       */
      ...(effortFor(spec, this.state?.thinking)
        ? { providerOptions: { gateway: { reasoningEffort: effortFor(spec, this.state?.thinking) } } }
        : {}),
      /**
       * Guarantee the turn ends in verified words.
       *
       * Observed in testing: the model ran the whole workflow correctly —
       * skills, plan, write, validate, review, preview — and then kept finding
       * more work, burning every step on tool calls. The transcript ended on a
       * tool result with no sentence, which reads as a crash to the person
       * watching it. Worse, preview_composition ok:true was read as "it
       * renders" when the browser had not even compiled yet.
       *
       * So the end of the turn is staged: after a preview the model gets ONLY
       * read_render_report (it waits for the browser, so one call settles
       * it). After a verified report it gets no tools, so the turn closes
       * with a sentence about a cut that provably renders. After a failed or
       * pending report the tools stay open for the fix round.
       */
      prepareStep: ({ steps }) => {
        const calls = steps.flatMap((s) => s.toolCalls.map((c) => c.toolName))
        // Code dumped as chat text is not a cut — force it into the one tool
        // that can hold it. The model already composed the code, so re-issuing
        // it as write_composition costs one step instead of a lost turn.
        if (
          chatCodeDumped(steps) &&
          !calls.includes("write_composition") &&
          !calls.includes("quick_start") &&
          !calls.includes("edit_file") &&
          !calls.includes("bulk_edit")
        ) {
          return { toolChoice: { type: "tool", toolName: "write_composition" } }
        }
        // Speed fix: NO forced review_motion. write_composition already
        // refuses basic motion (linear-only, stagger-less maps) and runs
        // mechanical repairs inline — forcing a review after every write
        // cost a full extra model round-trip for little signal. The model
        // can still call review_motion when a cut feels flat, but the fast
        // path (quick_start → preview → report) stays at 3 calls.
        if (!calls.includes("preview_composition")) return { toolChoice: "auto" }
        const read = lastReadStatus(steps)
        if (read === null) {
          return { toolChoice: { type: "tool", toolName: "read_render_report" } }
        }
        if (read === "verified") return { toolChoice: "none" }
        if (read === "pending" && pendingReadsSinceChange(steps) >= 2) {
          return { toolChoice: "none" }
        }
        return { toolChoice: "auto" }
      },
      // A rate limit answers "Retry after 40s"; the paced fetch already waits
      // that long, so a second layer of retrying only multiplies the delay.
      maxRetries: 0,
      abortSignal: options?.abortSignal,
      onFinish: (result) => {
        // Phase 1 analytics (§8): one advisory row per turn. Tool-call and
        // error counts come from the finished steps, not from a second query.
        try {
          const steps = result.response.messages ?? []
          let toolCalls = 0
          for (const m of steps) {
            const content = (m as { content?: unknown }).content
            if (Array.isArray(content)) {
              for (const c of content as Array<{ type?: string }>) {
                if (c.type === "tool-call") toolCalls += 1
              }
            }
          }
          const ms = Date.now() - turnStarted
          store.recordTurn({
            brief,
            totalTimeMs: ms,
            toolCalls,
            errors: 0,
            exported: false,
          })
          // Phase 5 monitoring: one JSON line per turn. Workers observability
          // (enabled in wrangler.jsonc) ships console output, so this IS the
          // dashboard feed until a vendor (Sentry etc.) is wired with a DSN.
          console.log(
            JSON.stringify({
              msg: "turn-finished",
              ms,
              toolCalls,
              model: activeModel,
              version: store.current().version,
            })
          )
          // D1 metadata + analytics sync (advisory, fire-and-forget). The D1
          // row is created by the browser's authenticated attach call, so
          // this only PATCHes fields and can never invent ownership.
          try {
            const current = store.current()
            const beats = (current.plan as { beats?: Array<{ to?: number }> } | null)?.beats
            const lastTo = beats?.length ? beats[beats.length - 1]?.to : undefined
            const compositionId =
              (this.ctx.id as { name?: string }).name ?? this.ctx.id.toString()
            queueTurnSync(
              this as never,
              compositionId,
              {
                title: (current.plan as { title?: string } | null)?.title ?? null,
                duration_s:
                  typeof lastTo === "number" ? Math.round((lastTo / CANVAS.fps) * 10) / 10 : null,
                fps: CANVAS.fps,
                width: CANVAS.width,
                height: CANVAS.height,
              },
              { brief, total_time_ms: ms, tool_calls: toolCalls, errors_count: 0 },
            )
          } catch {
            // Sync must never break the turn's closing sentence.
          }
        } catch {
          // Metrics must never break the turn's closing sentence.
        }
        return onFinish(result)
      },
      onError: (error) => {
        this.coolDown(activeModel)
        const err = error as unknown as Record<string, unknown>
        console.error(
          JSON.stringify({
            msg: "agent-model-error",
            err: String(error),
            name: (err?.name as string) ?? null,
            message: (err?.message as string) ?? null,
            status: (err as { status?: unknown })?.status ?? null,
            statusCode: (err as { statusCode?: unknown })?.statusCode ?? null,
            code: (err as { code?: unknown })?.code ?? null,
            response: (() => {
              try {
                const r = (err as { responseBody?: unknown; response?: unknown })?.responseBody
                return typeof r === "string" ? r.slice(0, 1000) : r ?? null
              } catch {
                return null
              }
            })(),
          })
        )
      },
    })

    return result.toUIMessageStreamResponse()
  }
}
