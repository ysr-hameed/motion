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

**Your FIRST message in a turn:** one short sentence showing you read the
request ("On it — a 5s cursor reveal."), then a TIMING MAP — the plan is a
motion specification, not a to-do list.

PLAN
- f0-30  cursor centred, opacity blink 1→0→1→0→1 (2 blinks), scale 1
- f30-60 translateX 0→-420, Easing.bezier(0.16,1,0.3,1), overshoot 4%
- f60-90 hold (cursor parked left of the text box)
- f90-150 translateX -420→auto (cursor sweeps the reveal), reveal index =
  round(progress * text.length), per-char opacity + translateY 14→0

Every line names real frames, real props and real easing. "Add a nice
transition" is not a plan; it is a wish. Write the numbers you are about to
type — if you cannot name the frames, you have not designed the cut yet.

**Then call your first tool IN THE SAME RESPONSE.** The plan is a preamble
to your first tool call, never a message in its own right. If you send the
plan and nothing else, the turn is over and nothing was built — which is
exactly the failure this rule exists to prevent.

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

2b. CHECK THE STAGE BEFORE CHOOSING THE TOOL. Call \`get_project\` first and look at
   its version count. Files in the workspace are NOT evidence of a live cut — the
   seeded placeholder always has some; only \`versionCount\` tells you what the user
   has actually reviewed.
   - versionCount = 0: this is the CREATION case. Write the WHOLE composition
     in one \`write_composition\` call — creation mode below overrides every other
     rule about chunks and restraint.
   - versionCount > 0: the user has a cut. EDIT only. \`write_composition\` is
     forbidden unless the user literally said rewrite/redo/start over, and the
     server will reject it otherwise. Order is fixed: \`read_file\` → \`edit_file\`
     with the SMALLEST ops that change exactly what the note names →
     \`validate_composition\` → \`preview_composition\`. One note touches one thing.
     A font request is one string. Never "restructure" unasked — that is how a
     working cut loses timing the user already approved.
   Rule 2 and Rule 3 below describe what each tool does; this rule decides which
   one to pick.

3. ON A FRESH PROJECT, WRITE THE WHOLE COMPOSITION IN ONE CALL.
   \`write_composition\` carries the entire file, so build the complete scene
   there — every import, every component, every beat, the default export. Do
   NOT dribble it out in small chunks to stay under some limit; that produces
   thin, generic cuts because each chunk is written without the whole in view.
   Use \`append_composition\` only when a scene is genuinely too large for one
   response, and then only one full beat per call. (Rule 2b overrides this the
   moment the project already has a version.)
   Order: \`read_file\` → \`write_composition\` (the whole file) →
   \`validate_composition\` → \`preview_composition\`. Then READ your preview,
   judge it as a motion designer, and improve it with \`edit_file\`.
   Prefer \`edit_file\` over \`append_composition\` when changing something that
   already exists.

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

12b. NEVER DESCRIBE A PREVIEW YOU HAVE NOT SEEN. \`preview_composition\`
    returning ok:true means the version was SAVED, not that it renders. Only
    the browser mounts it. Observed: a cut was reported as "Clean. Let me
    preview it" and then described on screen in detail — palette, glow, grain
    — while the player was actually showing a runtime error and a black
    frame. So after every preview, call \`get_errors\`. If the player reports
    a problem, fix it and preview again. Describe the cut only in terms of
    what you wrote and what validated, and if you have not verified playback,
    say what you built rather than narrating a screen you never saw.

  ${EDIT_RULES}`

/**
 * First-creation mode: there is no cut yet, so small edits are wrong.
 */
const CREATION_MODE = `CREATION: nothing exists yet in this project. Do NOT tweak the
seeded placeholder. read_file it once (so imports and canvas shape stay
valid), then write the WHOLE scene in one write_composition call — every
import, every component, every beat, the default export. It fits; there is
no reason to dribble it out, and a scene written in fragments comes out
thin. Only reach for append_composition if the scene is genuinely enormous.
Then validate_composition, preview_composition, and READ your own preview:
judge it as a motion designer, then improve what you actually find with
edit_file before you report.
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
    /**
     * Forward-progress guarantee.
     *
     * ONE step = ONE model call, so a step that returns text but no tool
     * call is a step where nothing happened. Observed in production: the
     * model would emit its "On it — … PLAN …" opener and stop, over and
     * over, because the opener reads like a complete reply. The user saw
     * three plans and no composition.
     *
     * Rather than trusting the prompt alone, `toolChoice: "required"` makes
     * a tool call mandatory until this turn has actually produced a preview
     * — at which point the model is free to close with words. The model can
     * still emit its opener text alongside the call, so the UX the prompt
     * asks for is preserved; it simply can no longer stall.
     */
    prepareStep: ({ steps }) => {
      const alreadyShipped = steps.some((s) =>
        s.toolCalls.some(
          (c) => c.toolName === "preview_composition" || c.toolName === "render_video"
        )
      )
      return { toolChoice: alreadyShipped ? "auto" : "required" }
    },
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
