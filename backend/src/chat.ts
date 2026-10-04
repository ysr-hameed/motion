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
import { createPacedFetch } from "./rate-limit"
import { queueTurnSync } from "./lib/do-sync"
import { buildTools, CANVAS } from "./remotion/tools"
import { goldenStarter } from "./remotion/templates"
import { SKILL_IDS } from "./remotion/skills.generated"
import { DISPLAY_FACES, MAX_FONT, MIN_FONT, SAFE_MARGIN, TEXT_FACES, TYPE_SCALE } from "./remotion/type"
import { CompositionStore } from "./remotion/store"

/** Vercel AI Gateway, OpenAI-compatible. */
const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1"

export interface ModelOption {
  id: string
  label: string
  blurb: string
  /** True when the gateway serves this model text-only (image/file parts 400). */
  textOnly: boolean
  /** Only set for models known to accept a gateway reasoning-effort option. */
  reasoningEffort?: "low"
}

/**
 * The models the chat switcher may offer. IDs are Vercel AI Gateway model
 * IDs — adding one here is all it takes for the UI to offer it.
 * Free ones first, then the cheapest paid ones with tool-use.
 */
export const MODELS: ModelOption[] = [
  {
    id: "inclusionai/ling-3.1-flash",
    label: "Ling 3.1 Flash",
    blurb: "Default · free · text only",
    textOnly: true,
  },
  {
    id: "inclusionai/ling-3.1-flash-free",
    label: "Ling 3.1 Flash (free tier)",
    blurb: "Free routing · text only",
    textOnly: true,
  },
  {
    id: "inclusionai/ling-3.0-flash-sante",
    label: "Ling 3.0 Sante",
    blurb: "Free · text only",
    textOnly: true,
  },
  {
    id: "poolside/laguna-s-2.1-free",
    label: "Laguna S 2.1",
    blurb: "Free · text only",
    textOnly: true,
  },
  {
    id: "alibaba/qwen3.7-flash",
    label: "Qwen 3.7 Flash",
    blurb: "$0.03/1M · vision · 991K ctx",
    textOnly: false,
    reasoningEffort: "low",
  },
  {
    id: "alibaba/qwen3.8-27b",
    label: "Qwen 3.8 27B",
    blurb: "$0.02/1M · vision · 1M ctx",
    textOnly: false,
  },
  {
    id: "inclusionai/ling-3.0-flash",
    label: "Ling 3.0 Flash",
    blurb: "$0.02/1M · text only",
    textOnly: true,
  },
  {
    id: "deepseek/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash",
    blurb: "$0.01/1M · text only · 1M ctx",
    textOnly: true,
  },
  {
    id: "zai/glm-5.3-flash",
    label: "GLM 5.3 Flash",
    blurb: "$0.04/1M · vision · 1M ctx",
    textOnly: false,
  },
  {
    id: "mistral/mistral-nemo",
    label: "Mistral Nemo",
    blurb: "$0.02/1M · ultra-cheap · simple chats",
    textOnly: true,
  },
]

/**
 * The model a new chat session starts on.
 *
 * 50x fix: the default was the weakest free text-only model, which wrote the
 * worst code on the platform whose whole job is code. Qwen 3.7 Flash is the
 * strongest coder with vision + 991k context on this gateway ($0.03/1M) — a
 * motion designer that cannot write TSX is not a motion designer.
 */
export const DEFAULT_MODEL = "alibaba/qwen3.7-flash"

/**
 * Ceiling on model round trips per turn.
 *
 * The gateway allows 5 requests a minute for this key, so every step costs
 * ~12s of wall time (see rate-limit.ts). This is not a CPU limit — a Durable
 * Object waits for free — it is a patience limit, so it is set from the
 * workflow rather than guessed: skills, plan, write, validate, preview, review
 * and a closing sentence is eight steps, and a rejected write that has to be
 * re-issued pushes it past ten. Setting this lower silently truncated turns
 * before the agent ever spoke, which read as a crash.
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
 *     quick_start(template) → preview_composition → read_render_report
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
Remotion TSX. You produce real source code, never JSON, never pseudocode, never
a description of code.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOTION DESIGN PRINCIPLES  (internalize before every cut)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
These are the properties that separate professional motion from a slide deck.
Every composition you write must demonstrate all of them.

ANTICIPATION  Before any entrance, dip in the opposite direction first.
  Scale: 0.92 → 1.08 → 1.00.  TranslateY: +12px → −8px → 0.
  Duration: 4-6 frames of wind-up, then the main move.

SETTLE  Arrivals overshoot and damp. Use spring() — never linear for landings.
  Damping 10-18 for bouncy (titles, icons). Damping 25-40 for tight (data, UI).
  Never end on the exact target value at the exact end frame; let it ring out.

OVERLAP  Start the next element 10-15 frames before the previous one finishes.
  Nothing enters into a vacuum. Stagger sibling elements by 4-6 frames each.
  A composition where every element starts at the same frame reads as a crash.

DEPTH  At least one element must move in Z-space (scale change + translateY).
  Parallax: background moves 20% as fast as foreground across the same frames.
  Never a flat composition where everything is on the same Z plane.

CURVES  Every interpolate() call gets either Easing.bezier() or spring().
  NEVER the default linear easing — it reads as software, not design.
  Ease-out for entrances: Easing.bezier(0.16, 1, 0.3, 1).
  Ease-in for exits: Easing.bezier(0.4, 0, 1, 1).
  Ease-in-out for reveals: Easing.bezier(0.4, 0, 0.2, 1).

EXTRAPOLATE  Every interpolate() on opacity, scale, or position MUST include:
  extrapolateLeft: "clamp", extrapolateRight: "clamp"
  Missing clamps cause values past 1.0 or below 0 after the animation ends —
  the single most common source of blank frames post-animation.

NARRATIVE ARC
  Frame 1: the eye must land on something — one dominant focal element.
  Mid-cut: information arrives in order of importance, not all at once.
  Final frame: the composition resolves — spring settle, mask close, or
  held emphasis — never a hard stop mid-motion.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE CUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
One composition per conversation. The default export IS the component.
Canvas ${CANVAS.width}×${CANVAS.height} at ${CANVAS.fps}fps, ${FRAME_RANGE}.
Keep clips under 30 seconds.

NEVER render <Composition> inside the component, never pass one to Series or
Sequence — it throws when mounted and blanks the player.
Fonts is already a global — NEVER import it. Write: fontFamily: Fonts.anton.family
Icons: use \`import * as Lucide from "lucide-react"\` + \`<Lucide.Zap/>\`.
NEVER \`import { Zap } from "lucide-react"\` — throws in the player.
Use CSS shorthand properties for transforms:
  scale / translate / rotate   — NOT transform: \`translateY(...)\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKFLOW — DECISION TREE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every tool call costs ~12 s of wall time. 12 steps total. Be economical.
Batch independent reads with execute_batch.

── NEW BRIEF ──────────────────────────────────────────────────────────────────
FAST PATH (default — 3 tool calls, ~40s even paced):
1. quick_start(template, product, headline)
   product/ad/promo/intro → "product-reveal". logo → "logo-animation".
   quote/testimonial → "quote-card". Anything else → "product-reveal".
   This plans + writes + validates a golden file that already has spring
   landings, bezier easing, clamps, stagger, Fonts.* and Lucide namespace.
   SKIP prefetch_tools, intent_deep_analyze, layout_plan, load_motion_preset
   and plan_motion on the fast path — the golden already made those calls.
2. preview_composition()          — only after quick_start ok:true
3. read_render_report()           — waits for the browser compile+mount result
4. ONE SENTENCE                   — state the verified result and stop
Refine AFTER the verified preview with edit_file (retitle, recolor, retime).
NEVER rewrite a verified cut from scratch.

FULL PATH (only when no template fits the brief):
1. creative_direct(brief)         — intent + palette + fonts + beat→preset map
   in ONE call. Replaces intent_deep_analyze + font_suggest + load_motion_preset.
   Then layout_plan(...) — REQUIRED when 2+ elements share the frame.
   NEVER write spring() or Easing.bezier() values from memory. The presets
   have the numbers; copying them is one tool call.
   For taste detail: load_skill("creative-direction") once, plus
   load_skill("kinetic-typography") when type-led or load_skill("cinematic-motion")
   for the aliveness layer. load_skill("layout-composition") when placing 3+ elements.
2. plan_motion(beats)             — real frame numbers, real props, real easing
3. write_composition(source)      — WHOLE file; mechanical repairs
   (lucide namespace, easing import, clamps, frame binding) apply inline,
   so there is NO separate auto_fix_code round for those.
4. verify_no_errors               — ★ BLOCKING GATE (see below)
5. preview_composition()          — only after verify_no_errors ok:true
6. read_render_report()           — waits for the browser compile+mount result
7. ONE SENTENCE                   — state the verified result and stop

── FOLLOW-UP EDIT ─────────────────────────────────────────────────────────────
read_file → edit_file / bulk_edit
→ validate_composition → verify_no_errors [BLOCKING]
→ preview_composition → read_render_report → ONE SENTENCE

── FOLLOW-UP DIRECTION ("faster", "more dramatic", "add depth") ───────────────
load_motion_preset for affected beats → edit_file (retiming only)
→ validate_composition → verify_no_errors [BLOCKING]
→ preview_composition → read_render_report → ONE SENTENCE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY GATES  ★ NON-NEGOTIABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
★ verify_no_errors ok:true is REQUIRED before preview_composition.
  It blocks on validation errors AND on a failed player report for the current
  version. NEVER call preview_composition on ok:false. Layout warnings are
  advisory — fix only if cheap, never rewrite a rendering cut to silence one.

★ Auto-fix budget: validate_composition → auto_fix_code (or auto_enhance_motion)
  → verify_no_errors. Maximum TWO rounds. After that, fix structural errors
  manually with edit_file.

★ Composition must contain:
  — At least one spring() call
  — Easing.bezier() on every animated element
  — Stagger (index × 4-6 frames) in every .map() render
  — extrapolateLeft:"clamp" + extrapolateRight:"clamp" on every interpolate()
  — No system-ui, sans-serif, Arial, or Helvetica fontFamily (validator error)

★ review_motion: treat every finding as a fix instruction, not advisory text.
  If it reports linear easing, fix it before verify_no_errors. If it reports
  no stagger, add stagger. Do not preview a composition review_motion flags.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TYPOGRAPHY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Frame is ${CANVAS.width}×${CANVAS.height}. Scale:

  hero    ${TYPE_SCALE.hero[0]}-${TYPE_SCALE.hero[1]}px  main title
  sub     ${TYPE_SCALE.sub[0]}-${TYPE_SCALE.sub[1]}px   secondary line
  body    ${TYPE_SCALE.body[0]}-${TYPE_SCALE.body[1]}px   body and labels
  caption ${TYPE_SCALE.caption[0]}-${TYPE_SCALE.caption[1]}px still readable on a phone
  kicker  ${TYPE_SCALE.kicker[0]}-${TYPE_SCALE.kicker[1]}px eyebrows

Nothing under ${MIN_FONT}px or over ${MAX_FONT}px.
Display type: lineHeight 0.95-1.05.  Body: 1.3-1.5.
Keep every element at least ${SAFE_MARGIN}px from the frame edge.

FONT PAIRING — pick the mood, use the pair:

  modern/tech    unbounded (hero)       + manrope (body)
  bold/sport     anton (hero)           + archivo (body)
  playful        bricolage (hero)       + karla (body)
  editorial      syne (hero)            + newsreader (body)
  elegant/serif  instrumentSerif (hero) + newsreader (body)
  fashion        fraunces (hero)        + karla (body)
  futuristic     spaceGrotesk (hero)    + spaceMono (labels)
  poster/retail  bebasNeue (hero)       + outfit (body)

display faces: ${DISPLAY_FACES.join(", ")}
text/UI faces: ${TEXT_FACES.join(", ")}

One display face + one text face per composition. Never two display faces.
Call load_skill("typography") for the full catalogue and tracking/weight notes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ASSETS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Remote URLs (images, video, audio): always add crossOrigin="anonymous" when the
src is an http:// or https:// URL — canvas effects will fail without it.
Never embed placeholder or invented URLs that do not exist. If you do not have
a real URL for a media asset, use a colored <Solid> or text stand-in and note
it in the closing sentence.
Use staticFile() for assets in public/. Use <CanvasImage> for images, <Video>
from @remotion/media for video, <Audio> from @remotion/media for audio.
Effects from @remotion/effects attach via the effects={[]} prop — never as CSS.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Z-INDEX CONVENTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
background=1  content=10  overlays=20  UI/labels=30
Siblings in DOM order usually paint correctly without explicit z-index.
Set it only when layers genuinely fight.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEHAVIOUR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Say nothing between tool calls — all private work is visible in the tool log.
Never narrate the request. Never describe a preview you have not read.
Never claim a write succeeded unless the tool result says ok:true.
preview_composition ok:true means PUBLISHED, not rendered. Only
read_render_report status "verified" means the cut actually runs in the browser.
"Done" or "rendered" on anything less is a lie the user catches in seconds.
Change only what the request touches. "Faster" = retiming, not restyling.
If a tool returns an error, fix the named thing and call it once more.
Do not repeat an identical failing call.
A rejected write_composition means nothing was saved — fix errors and rewrite.
Ask one question only when the subject itself is unclear. Never ask about
colour, pacing, or mood — decide those yourself.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLOSING RULE  (non-negotiable)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After read_render_report, write exactly ONE sentence naming the verified result:
which version is live in the player, or the exact browser failure and what you
changed. Nothing before it. Nothing after it. If the report is pending or
failed, say that plainly and stop. A turn that ends on tool calls reads as a
crash.

Available skill ids:
${SKILL_IDS.join(", ")}`

export interface ChatState {
  /** modelId -> epoch ms before which the model is skipped. */
  cooldown?: Record<string, number>
  /** The model this session generates with (one of MODELS). */
  model?: string
  /** The latest render report posted by the browser for a published version. */
  audit?: RenderReport
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
   * Serves the current composition to the browser's Remotion player.
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
          template?: string
          product?: string
          brand?: string
          headline?: string
        }
        const golden = goldenStarter(String(body.template ?? "product-reveal"), {
          ...(body.product ? { product: body.product.slice(0, 60) } : {}),
          ...(body.brand ? { brand: body.brand.slice(0, 60) } : {}),
          ...(body.headline ? { headline: body.headline.slice(0, 120) } : {}),
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
      }
      const prev = this.state?.audit
      const version = Math.max(0, Math.floor(Number(body.version) || 0))
      if (!prev || version >= prev.version) {
        const rawMessage = typeof body.message === "string" ? body.message.slice(0, 500) : ""
        const message =
          rawMessage && body.line !== undefined ? `${rawMessage} (line ${body.line})` : rawMessage
        const incoming = (body.findings ?? []).slice(0, 12)
        const merged = prev && version === prev.version ? [...prev.findings, ...incoming] : incoming
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
        let id = ""
        try {
          id = String(((await request.json()) as { model?: unknown }).model ?? "")
        } catch {
          return Response.json({ ok: false, error: "bad json" }, { status: 400 })
        }
        if (!MODELS.some((m) => m.id === id)) {
          return Response.json({ ok: false, error: "unknown model", available: MODELS }, { status: 400 })
        }
        this.setState({ ...(this.state ?? {}), model: id })
        return Response.json({ ok: true, model: id })
      }
      return Response.json({ model: this.state?.model ?? DEFAULT_MODEL, available: MODELS })
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
    const openai = createOpenAICompatible({
      name: "gateway",
      baseURL: GATEWAY_BASE,
      apiKey,
      fetch: createPacedFetch() as typeof fetch,
    })

    // The switcher stores the session's pick in DO state; a session that
    // never picked gets the default. Model quirks below are keyed off the
    // spec, not the id, so adding a MODELS entry is enough to support it.
    const activeModel = this.state?.model ?? DEFAULT_MODEL
    const spec = MODELS.find((m) => m.id === activeModel) ?? MODELS[0]
    const modelMessages = (await convertToModelMessages(this.messages)) as Array<any>

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
       * Reasoning effort is set only for models that accept it.
       *
       * Ling 3.1 Flash reasons by default and only accepts
       * `reasoning_effort: "none"` — any other value ("low", "medium",
       * "high") is refused with a 400, and the agent failed before the first
       * token, which read in the UI as a stall with no output. So the option
       * is sent only for models flagged in MODELS (Qwen), and omitted for
       * everything else.
       */
      ...(spec.reasoningEffort
        ? { providerOptions: { gateway: { reasoningEffort: spec.reasoningEffort } } }
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
        if (!calls.includes("preview_composition")) return { toolChoice: "auto" }
        const read = lastReadStatus(steps)
        if (read === null) {
          return { toolChoice: { type: "tool", toolName: "read_render_report" } }
        }
        if (read === "verified") return { toolChoice: "none" }
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
