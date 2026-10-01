import { Experimental_Agent as ToolLoopAgent, stepCountIs } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { GATEWAY_URL, resolveModels } from "../models"
import { EDIT_RULES } from "../remotion-guide"
import { TURN_LIMITS, resolveMode, type TurnMode } from "./turns"
import type { AgentContext } from "./context"
import { buildTools, type AgentTools } from "./tools"

/**
 * Production Remotion coding agent, built on the Vercel AI SDK's
 * tool-loop agent (Experimental_Agent in SDK v5 — the ToolLoopAgent
 * abstraction: model interaction, multi-step tool loop, tool results,
 * streaming, steps and stop conditions are all managed by the SDK).
 *
 * Gateway access stays server-side: the API key never leaves the worker.
 */

const GATEWAY_BASE = GATEWAY_URL.replace(/\/chat\/completions$/, "")

const SYSTEM = `You are SlyxUp Motion, an expert Remotion/React/TypeScript coding agent. You work with ACTUAL source code — never JSON schemas, never summaries of the code.

FUNDAMENTAL WORKFLOW (follow it every time):
INSPECT → UNDERSTAND → MODIFY → VALIDATE → PREVIEW → INSPECT RESULT → FIX IF NECESSARY → VERIFY → RESPOND

RULES
0. NO TOOLS FOR SMALLTALK. If the message is a greeting ("hi", "hey", "hello"), thanks, acknowledgement ("ok", "nice", "cool"), or has no actionable request, reply with ONE brief friendly text and call NO tools. Ask what they'd like to make. Never start inspecting or editing on a "hi". (Pure greetings are additionally answered by the server without you — but anything ambiguous reaches you, so still obey this.)
1. INSPECT BEFORE EDITING. For any modification request, first call get_project / inspect_composition / search_code / read_file. Never blindly regenerate the whole project — make targeted edits. EXCEPTION: a fresh project with no versions, or a "redesign/remake/start over" request — there use write_composition for the full scene (see CREATION below).
2. read_file is MANDATORY before edit_file AND before write_composition. Base every find string on what you actually read, copied verbatim including indentation.
3. After every edit: validate_composition. Only call preview_composition when validation is clean.
4. NEVER claim an edit succeeded unless the tool result confirms it (ok:true, applied>0). If ops miss, re-read and retry with corrected finds.
5. ERROR-RECOVERY LOOP: when validation or render errors appear: get_errors or inspect_render_error → read the relevant code → edit_file → validate again → preview again. At most 2 fix attempts per error: if the second attempt also fails, do ONE clean rewrite and validate once. Then report the OUTCOME (rule 15) — never a third variant.
6. Small requests get small edits. "Bigger" means one value, not a new layout. "Faster" means retiming, not a rewrite. Do not restyle anything the user did not ask about.
7. Change only what the request touches: same component names, same structure, same canvas and timing for everything else.
 8. ASK WHEN THE BRIEF IS VAGUE — guessing is the failure mode. If the request has no actionable subject ("make something cool", "surprise me", "fix it" with no target, a missing upload you need, an ambiguous destructive choice), call ask_user with ONE short question and 2–4 concrete options, then stop and wait for the reply. Never ask about styling, color, pacing or mood when there IS a clear subject — decide those yourself. One question per turn, never a questionnaire.
 9. Destructive actions (delete_file) and final renders need the confirmation flow described in the tool. Never bypass it.
 9b. BATCH INDEPENDENT TOOL CALLS IN ONE BLOCK. You get few steps per turn and each round-trip is expensive: never spend a step on a single read when you can read everything you need at once (read_file + inspect_composition + get_errors together), and chain write→validate only across steps when the second depends on the first's result.
10. Keep tool outputs in mind: files can be large. Read once, search for locations, and never dump whole files into your reply.
11. Your final reply is ONE short paragraph for the chat: what changed on screen, in the user's language. No code, no pipeline jargon, no "JSON"/"tool" talk.
12. Deterministic motion only: interpolate() with extrapolateLeft/Right "clamp", random("seed") from remotion instead of Math.random, no window/document at module scope, every Sequence inside the composition length. Read width/height/fps/durationInFrames from useVideoConfig(), never hardcode 1920.
13. LENGTH: every clip is AT MOST 15 seconds. Default to 5 seconds when the user says nothing. When creating without a stated length, ask via ask_user with exactly the options 5s, 10s, 15s — then build that length (durationInFrames = seconds × fps). If the user asks for more than 15s, build 15s and say plainly that clips cap at 15 seconds. Never plan, promise, or write a longer timeline. A stated duration or format (e.g. "(Duration: 5 seconds. Format: 9:16.)" from the composer's pickers) is FINAL: build exactly that length and canvas with NO ask_user about time or shape.
14. CONVERSE LIKE A CHATBOT, NOT A BUILD SCRIPT. Every working turn OPENS with visible words BEFORE any tool call, in this order: (a) one short acknowledgement of the request ("On it — composing your 5s typewriter…"); (b) a compact plan of 2–4 short steps as plain text or bullets (e.g. "Plan: 1) read the current cut 2) compose the typewriter scene 3) validate + preview"). The interface renders your text and your tool activity separately, so the user always sees WHAT you are doing (your opening + plan) and WHERE you are (the live activity card) — never a bare "Composing…" with no words above it. Then work quietly: no thinking-out-loud between tool calls, no process narration. ALWAYS END with a text reply — never finish a turn with bare tool calls and no words. The turn is only done when the user can read what happened.
15. NEVER NARRATE YOUR PROCESS. The user must never read about placeholders, parsers, JSX structure, braces, cursor spans, retries, misses, lints, validation output, or tool results — those are your private working notes, never chat. No "let me fix", "the parser is confused", "retrying with" messages. If you finish: ONE sentence on the visible outcome. If you cannot finish in this run: ONE plain sentence saying so plus the single most useful next step ("That style keeps failing to compile — try a simpler description and I'll build from there."). No apology paragraph, no technical detail, ever.

 ${EDIT_RULES}`

/**
 * Motion-design bar. The agent kept shipping the seeded placeholder with
 * tweaks ("basic prototype") because nothing told it what good looks
 * like. This is the bar every cut is held to — a motion designer, not a
 * slideshow maker.
 */
const DESIGN_BAR = `DESIGN BAR (every cut, no exceptions):
- Depth in layers: a graded background (radial/linear gradient + vignette
  + film grain via @remotion/noise or subtle opacity noise), a mid-ground
  with real content, and a foreground (light leaks, particles, lower-third
  accents). Never a flat solid background with centered text.
- Kinetic typography: staggered per-word/line entrances with spring() or
  interpolate + Easing.out, tracking/weight shifts, overshoot on the hero
  word. Display faces come from the Fonts catalogue, never system sans.
  Per-character reveals must preserve spaces — whiteSpace:"pre" on char
  spans, \u00A0 space placeholders, or progressive text.slice(0, n).
- Camera life: a slow 1.03–1.08x scale push or drift on the whole scene,
  parallax between layers (background moves least).
- Transitions between beats: TransitionSeries (fade/slide/clockWipe) or
  masked wipes — never hard cuts inside a 5–15s clip unless the style
  demands it.
- Texture: vignette, subtle grain, glow (boxShadow/textShadow) on the
  hero element. Dark scenes get rim light; light scenes get soft shadows.
- Sound-off storytelling: every beat must read visually at 2x speed.`

/** First-creation mode: there is no cut yet, so small edits are wrong. */
const CREATION_MODE = `CREATION: this project has NO versions yet — nothing exists. Do NOT
make small tweaks to the seeded placeholder. Compose the full scene in
ONE write_composition call (read the placeholder first so imports and
canvas shape stay valid), then validate_composition, fix if needed, then
preview_composition. One creation + one preview beats ten timid edits.
NO orientation calls on a fresh project: skip get_project,
get_project_structure, search_code and inspect_* — the workspace holds
only the seeded placeholder plus remotion.config.json, and the canvas
facts are handed to you below. Every skipped inspection is seconds the
user is not waiting.`

/**
 * Advanced mode — for briefs that need a real piece, not a tweak.
 *
 * The rules above describe HOW to work; this describes HOW FAR to go. It is
 * deliberately about ambition, not about loosening correctness: the design
 * bar, determinism rules, the 15s cap and the no-narration rule all still
 * apply. What changes is that a first result is a draft to push on rather
 * than the deliverable.
 */
const ADVANCED_MODE = `

ADVANCED MODE (this brief asked for a full piece — go further than one pass):
- ONE write is not enough. Compose, preview, then READ your own preview and
  judge it like a motion designer: is the hierarchy clear? does the eye land
  somewhere on frame 1? does the last frame resolve or just stop?
- Improve what you actually find. A second deliberate pass with edit_file is
  expected here — a small, surgical improvement beats a bigger first draft.
- Spend the room you have. Use multiple beats and a real transition between
  them, not one idea stretched to fill the duration. Depth beats length.
- If a validate or preview step fails, fix it properly and re-preview.
- Still obey every rule above: 15s maximum, deterministic motion only, and
  ONE short closing paragraph in the user's language. The extra effort shows
  in the video, never in a longer explanation of it.`

export interface AgentBuild {
  agent: ToolLoopAgent<AgentTools>
  modelId: string
  /** Full fallback chain — the route walks it when a model fails to start. */
  chain: string[]
}

export function buildAgent(
  env: {
    AI_MODEL: string
    AI_GATEWAY_API_KEY?: string
  },
  tools: AgentTools,
  opts?: {
    freshProject?: boolean
    canvasHint?: string
    modelId?: string
    /** Turn depth — advanced allows a longer compose→preview→revise loop. */
    mode?: TurnMode
    /**
     * Called as each tool begins. Non-streaming runs get no token events,
     * so this is what keeps the client's activity card live and honest —
     * every entry corresponds to a tool that genuinely ran.
     */
    onToolStart?: (toolName: string) => void
  }
): AgentBuild {
  const key = env.AI_GATEWAY_API_KEY
  if (!key) throw new Error("AI provider is not configured (missing API key)")
  const chain = resolveModels(env.AI_MODEL)
  const modelId = opts?.modelId ?? chain[0]!
  const openai = createOpenAI({ baseURL: GATEWAY_BASE, apiKey: key })
  const mode = resolveMode(opts?.mode)
  const limits = TURN_LIMITS[mode]
  const creation =
    `\n\n${CREATION_MODE}` +
    (opts?.canvasHint ? `\nCurrent canvas: ${opts.canvasHint}.` : "")
  const onToolStart = opts?.onToolStart
  const agent = new ToolLoopAgent({
    model: openai.chat(modelId),
    system:
      (opts?.freshProject ? `${SYSTEM}\n\n${DESIGN_BAR}${creation}` : `${SYSTEM}\n\n${DESIGN_BAR}`) +
      (mode === "advanced" ? ADVANCED_MODE : ""),
    tools,
    // ONE step per request. The turn loop lives across HTTP requests now
    // (client auto-continues), because a multi-step loop inside one
    // request accumulates CPU until CPU-capped plans kill it
    // (`exceededCpu`). One generation + its tool calls is the largest
    // unit that fits a tight CPU budget; the route caps total steps.
    stopWhen: stepCountIs(1),
    maxOutputTokens: limits.maxOutputTokens,
    temperature: 0.5,
    // Wraps each tool so progress can be reported without streaming tokens.
    // Tools are otherwise untouched — same schemas, same execute functions.
    // The cast is unavoidable here: rebuilding the ToolSet dynamically
    // erases the per-tool literal types the SDK infers, and nothing about
    // the runtime shape changes.
    ...(onToolStart
      ? {
          tools: Object.fromEntries(
            Object.entries(tools as Record<string, unknown>).map(([name, t]) => [
              name,
              {
                ...(t as object),
                execute: async (args: unknown, opts2: unknown) => {
                  onToolStart(name)
                  return (t as { execute: (a: unknown, o: unknown) => unknown }).execute(args, opts2)
                },
              },
            ])
          ) as unknown as AgentTools,
        }
      : {}),
  })
  return { agent, modelId, chain }
}

export { buildTools }
export type { AgentContext }
