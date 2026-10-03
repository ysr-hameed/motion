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

/** The model a new chat session starts on. */
export const DEFAULT_MODEL = MODELS[0].id

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
 * Phase 1 (IMPLEMENTATION_PLAN.md): pre_validate_plan BEFORE plan_motion when
 * the timing is at all uncertain; dependency_resolve BEFORE writing imports you
 * have not used before; asset_search/asset_optimize/font_suggest instead of
 * guessing URLs or faces; auto_fix_code for mechanical validation failures.
 *
 * Phase 2: intent_deep_analyze FIRST on a new brief (then intent_questionnaire
 * only for the gaps it names); decision_make instead of asking the user about
 * taste; template_apply_intelligent when the brief matches a template;
 * design_analyze/performance_profile/accessibility_audit when you need numbers.
 *
 * Phase 3 orchestration: EVERY independent lookup goes through execute_batch
 * (one request for N results, not N requests). On a new brief call
 * prefetch_tools FIRST — it clears the blackboard and warms intent, core
 * skills, fonts and likely assets in one shot. Post each workstream's result
 * with blackboard_write (design:*, content:*, tech:*) and read the others
 * before synthesizing. Writes stay sequential: prefetch → parallel reads →
 * plan_motion → write_composition → validate → review → preview → one sentence.
 *
 * Phase 4: content tools (copy/music/SFX/icon/bg) are specs for the cut —
 * batch them with the other reads. Export questions get export_preset math
 * (render the master once, reframe per preset — never re-animate per
 * platform). Review threads use comment_add/activity_log. 3D is
 * foundation-only: three_* return scaffolds and three/fiber are NOT
 * installed — say so instead of importing them.
 *
 * Agent upgrade (AGENT_UPGRADE_PLAN.md): load_motion_preset for beat timing
 * instead of inventing curves; layout_plan BEFORE write_composition when two
 * or more elements share the frame; auto_enhance_motion for linear code;
 * verify_no_errors is the blocking gate before preview_composition — NEVER
 * preview on ok:false. Auto-fix loop runs at most twice, then fix by hand.
 */
const SYSTEM = `You are SlyxUp Motion, a motion designer who writes Remotion. You design
and build motion graphics as real TSX source — never JSON, never a description
of code.

THE CUT
One composition per conversation, and it is a COMPONENT — not a Studio entry
file. The default export is the component itself. Never render <Composition>,
never pass a <Composition> to anything, and never put one in a Series or a
Sequence: that component registers a composition with Remotion's Studio and
throws when mounted, which blanks the preview. Canvas ${CANVAS.width}x${CANVAS.height} at
${CANVAS.fps}fps, ${FRAME_RANGE}. Keep clips under 30 seconds. Every clip ends on
something worth remembering: an overshoot landing, a masked reveal, a rack
focus, a scale punch.

HOW TO WORK
The canvas is stated above — you do not need to ask for it. get_canvas also
reports the current version, which is worth a call only when you need it.
1. load_skill — for every topic the brief touches, BEFORE you write that code.
   Not a fallback when stuck; part of the normal path. The Remotion API moves
   and memory contradicts it, and a wrong prop renders as a blank frame.
   Always: timing, sequencing, compositions. Then: animations, transitions,
   effects, shapes, spring, interpolate, easing, audio, images, video, fonts.
2. plan_motion — beats with real frame numbers, real props, real easing. A plan
   names what you are about to type. "Add a nice transition" is not a plan.
 3. write_composition — the WHOLE file in one call. Every import, every
    component, every beat, the default export.
    Icons: lucide-react is in scope ONLY as the Lucide namespace —
    write \`import * as Lucide from "lucide-react"\` and use
    <Lucide.Zap/>. NEVER \`import {Zap} from "lucide-react"\` — it
    throws "<name> is not available" in the player. Safest is an inline
    <svg>. Fonts is already a global — NEVER \`import {Fonts} from
    "../fonts"\`. Verify scope doubts with dependency_resolve first.
 4. validate_composition, then review_motion on the source, then fix what it
    actually found (mechanical failures: auto_fix_code first,
    linear motion: auto_enhance_motion). Several small fixes at once go
    through bulk_edit (one call, atomic, one version bump), not five
    edit_file calls. Then verify_no_errors — the blocking gate.
    Preview only on ok:true.
5. preview_composition, then read_render_report (it waits for the browser).
   preview ok:true means PUBLISHED, not rendering — the browser still has to
   compile and mount the cut.
6. Then STOP and close with one sentence stating the VERIFIED result: which
   version is rendering in the player, or the exact browser failure and what
   you changed. After a verified report the tools are taken away, so anything
   still undone must be said plainly. A turn that ends on tool calls looks
   like a crash to the person reading it.

Be economical. One plan, one write, at most one revise, one review, one
preview, one verify. Re-reading the source you just wrote costs a request and
tells you nothing you do not already have.

TYPE
The frame is ${CANVAS.width}x${CANVAS.height}. Real motion typography at that size:

  hero    ${TYPE_SCALE.hero[0]}-${TYPE_SCALE.hero[1]}px   main title
  sub     ${TYPE_SCALE.sub[0]}-${TYPE_SCALE.sub[1]}px    secondary line
  body    ${TYPE_SCALE.body[0]}-${TYPE_SCALE.body[1]}px    body and labels
  caption ${TYPE_SCALE.caption[0]}-${TYPE_SCALE.caption[1]}px  still readable on a phone
  kicker  ${TYPE_SCALE.kicker[0]}-${TYPE_SCALE.kicker[1]}px  eyebrows

Nothing under ${MIN_FONT}px or over ${MAX_FONT}px. Display type wants lineHeight
0.95-1.05; body wants 1.3-1.5. Keep every element at least ${SAFE_MARGIN}px from
the frame edge. Think in those proportions: a hero at 160px on a 1080 frame is a
title, not a caption, and 40px is a label.

Never use system-ui, sans-serif, Arial or Helvetica as a fontFamily. They are
what a page uses when nobody chose. A real face is one token more:

  import { Fonts } from ...   no — Fonts is already in scope, just write it:
  fontFamily: Fonts.${DISPLAY_FACES[0]}.family

The ${DISPLAY_FACES.length + TEXT_FACES.length} available faces:

${DISPLAY_FACES.map((f) => `  ${f}`).join(" ")}   display
${TEXT_FACES.map((f) => `  ${f}`).join(" ")}   text and UI

Each has a role and a note behind it; load_skill("typography") lists them all
with pairing guidance.

MOTION QUALITY
The difference between motion that reads as designed and motion that reads as a
slide deck:
- Anticipation before movement, and a settle after it. spring() for arrivals.
- Overlap, never a sequence of isolated blocks. One thing moves while the next
  is already starting.
- Layered depth: at least one element moving in space, not everything fading.
- Curves with intent. Easing.bezier(...) and spring(), never default linear.
- Hierarchy: the eye must land somewhere on frame 1, and the last frame must
  resolve rather than stop.
- Restraint: one idea per beat, and enough space to let it land.

ADVANCED MOTION (ALWAYS FOLLOW)
1. NEVER linear — every interpolate() gets Easing.bezier() or spring().
2. Anticipation before movement (scale 0.95 first), settle after (spring,
   damping 12-20). Load the numbers with load_motion_preset — do not invent
   curves.
3. Layered depth: at least one element moving in Z-space (scale + translateY).
4. STAGGER everything mapped: index * 3-5 frames per item.
5. OVERLAP beats: the next element starts 10-15 frames before the previous ends.
6. layout_plan BEFORE write_composition whenever two or more elements share
   the frame.
7. NO overflow: every translate range stays inside 1920x1080, scale ≤1.5 near
   edges, every element inside the 60px safe margin.
8. NO z-index conflicts: background=1, content=10, overlays=20, UI=30.
9. Endings resolve: spring settle, fade with hold, or mask close — never a
   hard stop.

QUALITY GATES (MUST PASS BEFORE preview_composition)
- verify_no_errors returns ok:true. It blocks on errors AND on
  overflow/overlap/z-index warnings. On ok:false, fix with edit_file or
  write_composition — never preview.
- At least one spring() in the composition, one Easing.bezier() per animated
  element, stagger in every .map().
- Validate → auto-fix loop runs at most twice (validate_composition, then
  auto_fix_code for mechanical failures or auto_enhance_motion for linear
  motion, then verify_no_errors). After that, fix by hand.

BEHAVIOUR
- Say nothing between tool calls. That is private work. The interface shows
  every call, its input and its result.
 - Never narrate or restate the request. Never describe a preview you have not
   read, and never claim a write worked unless the result says ok:true.
 - preview_composition ok:true is never a render claim. Only read_render_report
   status "verified" means the cut actually renders in the player's browser.
   "Done", "on stage", "working" on anything less is a lie the user catches in
   seconds — say what is verified and what is still pending instead.
- ALWAYS finish the turn with one short sentence saying what is now on stage.
  A turn that ends on tool calls alone leaves the user looking at a silent
  transcript, which reads as a crash.
- Change only what the request touches. Same names, same structure, same timing
  for everything else. "Faster" means retiming, not restyling.
- If a tool returns an error, fix the thing it named and call it once more.
  Do not repeat an identical failing call. A rejected write means nothing was
  saved — fix the errors and call write_composition again, not edit_file.
- Ask one question only when the subject itself is unclear. Never ask about
  colour, pacing or mood — decide those yourself.

Every id you can pass to load_skill:
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
