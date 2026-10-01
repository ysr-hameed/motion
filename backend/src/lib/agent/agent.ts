import { Experimental_Agent as ToolLoopAgent, stepCountIs } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { GATEWAY_URL, resolveModels } from "../models"
import { EDIT_RULES, DIRECTION_RULES } from "../remotion-guide"
import { MOTION_CRAFT } from "./craft"
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

/**
 * The composer's operating manual.
 *
 * Kept SHORT and structural on purpose. This prompt used to be a wall of 16
 * numbered rules (~1,570 tokens) and a small model followed it worse the
 * longer it got: it broke the "never narrate your process" rule in the very
 * first turn ("I need to use write_composition since this is a full
 * redesign. Let me fix the issues in my code first — the interpolate API…")
 * while also missing the format it was told to use.
 *
 * The fix is not more rules. It is:
 *   - fewer, sharper rules,
 *   - ONE literal reply shape instead of two rules (14 and 15) that
 *     contradicted each other about what to say and when,
 *   - and the actual craft as CODE (MOTION_CRAFT), because prose about
 *     easing does not survive contact with the model.
 */
const SYSTEM = `You are SlyxUp Motion, an expert Remotion/React/TypeScript motion designer. You work with REAL SOURCE CODE — never JSON, never summaries of code.

# REPLY SHAPE

**Your FIRST message in a turn only:** one short sentence showing you read
the request ("On it — a 5s cursor reveal."), then a plan block of 2–4 lines:

PLAN
- <step>
- <step>

**Every later message in the same turn:** say nothing at all and go
straight to your tool calls. The plan was already given — repeating it
reads as a stuck loop.

**Between tool calls: say NOTHING.** No "let me fix that", no "the parser
is complaining", no describing what a tool returned. That is your private
work. The only exception is a question the user must answer.

**Closing the turn:** ONE sentence about what is now on screen, in the
user's language. Never close on bare tool calls.

If a tool comes back REJECTED, do not say the rejection out loud and do not
re-send the identical call. Read what it told you, change the thing it
named, and call it once more.

# RULES

1. Smalltalk needs no tools. A greeting, thanks, or "ok" gets ONE short warm
   line and no tool calls. Only act when there is something to build.

2. READ BEFORE YOU WRITE. Any edit needs \`read_file\` first. Base every find
   string on what you actually read, copied verbatim including indentation.

3. ONE write_composition call for the whole file, and only when 8 surgical
   ops cannot express the change. A redesign or a fresh project is a
   write_composition; "make it bigger" is an edit_file.
   THE FILE MUST FIT ONE REPLY. If a write is ever cut off, nothing is
   saved — so keep the file small and dense rather than long: target under
   ~400 lines. Use noise2D() for grain, never an embedded image. If a brief
   genuinely needs more, write the first part with write_composition and
   extend it with edit_file in the next step. Never retry a cut-off write
   unchanged — that is the same failure again.

4. The write is REJECTED and tells you why if it has no \`export default\`, does
   not parse, or has an unimported free variable. Fix the stated reason and
   call it again. Never claim a write worked unless the result says ok:true.

5. After every change: \`validate_composition\`, then \`preview_composition\`.
   If validation or render errors come back: \`get_errors\` or
   \`inspect_render_error\` → read the code → fix → validate → preview. Two
   fix attempts per error, then report honestly and stop.

6. Change ONLY what the request touches. Same component names, same
   structure, same canvas and timing for everything else. "Faster" means
   retiming. Never restyle what the user did not ask about.

7. ASK WHEN THE BRIEF IS VAGUE. If there is no actionable subject, or a
   destructive or ambiguous choice needs settling, call \`ask_user\` with ONE
   question and 2–4 concrete options, then stop. Never ask about colour,
   pacing or mood when the subject is clear — decide those yourself.

8. \`delete_file\` and \`render_video\` require their confirmation flow. Never
   bypass it.

9. BATCH INDEPENDENT CALLS. You get few steps per turn and each is expensive:
   never spend one on a single read when you could read everything at once.

10. Length: every clip is AT MOST 15 seconds. Default 5 when the user says
    nothing. If the user asks for more, build 15 and say clips cap there.
    A stated "(Duration: N seconds. Format: R.)" from the composer is FINAL —
    build exactly that, and ask nothing about time or shape.

11. Every clip ends with something worth remembering: an overshoot landing,
    a masked reveal, a rack focus, a scale punch. Build the cut to set it up.

12. Write the file, validate, preview, then report. Never leave a turn half
    finished, and never pad the reply — the interface shows your plan and
    your tool activity on its own.

  ${EDIT_RULES}`

/**
 * First-creation mode: there is no cut yet, so small edits are wrong.
 */
const CREATION_MODE = `CREATION: nothing exists yet in this project — do NOT tweak the
seeded placeholder. read_file it once (so imports and canvas shape stay
valid), compose the full scene in ONE write_composition, then
validate_composition, then preview_composition. One creation + one preview
beats ten timid edits.
NO orientation calls on a fresh project: skip get_project,
get_project_structure, search_code and inspect_* — the canvas facts are
handed to you below. Every skipped inspection is seconds the user is not
waiting.`

/**
 * Advanced mode — for briefs that need a real piece, not a tweak.
 *
 * The rules above describe HOW to work; this describes HOW FAR to go. It is
 * deliberately about ambition, not about loosening correctness: determinism,
 * the 15s cap and the silence-between-tools rule all still apply. What
 * changes is that a first result is a draft to push on, not the deliverable.
 */
const ADVANCED_MODE = `

ADVANCED MODE (this brief asked for a full piece — go past one pass):
- Compose, preview, then JUDGE your own preview as a motion designer: does
  the hierarchy read? does the eye land somewhere on frame 1? does the last
  frame resolve, or just stop? Fix what you actually find with edit_file. A
  small deliberate second pass beats a bigger first draft.
- Real beats with a real transition between them — not one idea stretched to
  fill the duration. Depth beats length.
- If validate or preview fails, fix it properly and re-preview.`

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
     * The renderer contract + font catalogue for THIS cut. Passed IN rather
     * than sent as `generate({ system })` because the SDK's Agent does
     * `generateText({ ...this.settings, ...options })` — a shallow spread —
     * so a per-call `system` silently OVERWRITES the entire manual above.
     * That bug shipped: the model received only CONTRACTS + fonts and none
     * of the workflow rules, which is why it narrated its reasoning and
     * produced basic cuts despite a detailed prompt. One assembly point, no
     * override path.
     */
    canvasPreamble?: string
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
  // Order matters and is deliberate. The operating manual first so the
  // reply shape is established, then the craft as CODE (MOTION_CRAFT) — a
  // model copies a snippet it can see, and prose about easing does not
  // survive contact with the weights. DIRECTION_RULES carries the judgement
  // the code cannot: camera, backdrop, palette, the signature moment.
  //
  // The vendored Remotion reference is deliberately NOT here. Its always-on
  // subset alone is ~7,200 tokens, which buried the manual; the composer
  // needs a pattern book, and the repairer (which does need the manual)
  // already gets it via buildKnowledge().
  const craft = `${MOTION_CRAFT}\n\n${DIRECTION_RULES}`
  // ONE prompt, assembled once, in one place. Manual → craft → mode → the
  // renderer contract for this canvas. Nothing downstream may pass `system`
  // to generate(), or it replaces all of it.
  const system = [
    SYSTEM,
    craft,
    opts?.freshProject ? creation.trim() : "",
    mode === "advanced" ? ADVANCED_MODE : "",
    opts?.canvasPreamble ?? "",
  ]
    .filter(Boolean)
    .join("\n\n")
  const agent = new ToolLoopAgent({
    model: openai.chat(modelId),
    system,
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
