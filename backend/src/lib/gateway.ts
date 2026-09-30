import type {
  AiProvider,
  DirectRequest,
  DirectResult,
  RefineRequest,
  RepairRequest,
  DirectorEventHandler,
} from "./ai-types"
import { AiNotConfiguredError } from "./ai-types"
import {
  asArtifact,
  canvasFor,
  describeArtifact,
  MAX_FRAMES,
  type Artifact,
  type Canvas,
  type CodeArtifact,
} from "./artifact"
import { extractComponent, hasDefaultExport, summariseComponent } from "./code-block"
import { blockingIssues, describeIssues, lintComposition } from "./code-lint"
import { resolveModels } from "./models"
import { runDirector, type Direction } from "./agents/director"
import { runChoreographer } from "./agents/choreographer"
import { runEditor } from "./agents/editor"
import { runRepairer } from "./agents/repairer"
import { runVoice } from "./agents/voice"
import { readMemoryHint, writeMemory } from "./agents/memory"
import { GatewayError, type GatewayImage } from "./agents/gateway-client"

export { GatewayError }
export type { GatewayImage }

/**
 * Code-native director.
 *
 *   S1 direct   director reads the brief → concept, beats, palette, length
 *   S2 compose  choreographer writes the Remotion file
 *   S3 verify   static lint, then one repair pass on hard failures
 *   S4 review   critic reads the finished file (advisory only)
 *   S5 voice    one sentence for the chat
 *
 * What is gone: the 82-knob JSON schema, the 18-type layer allowlist, the
 * motion-intent DSL, its compiler, the preset tables, the geometry
 * de-collider and the de-bruijn of "repair" agents that existed only to
 * make model output fit a shape. A composition is TypeScript now, so the
 * only gate is whether it runs — and that is checked by the browser
 * actually running it, then repaired from the real error.
 */

interface Stage {
  name: string
  ms: number
  ok: boolean
}

/**
 * How many times the composition is re-linted and re-repaired before the
 * run is called a failure. Each pass is cheap (a string scan plus one
 * model call) and only happens when something is actually wrong, so this
 * costs nothing on a healthy generation.
 */
const REPAIR_PASSES = 3

export class GatewayProvider implements AiProvider {
  readonly name = "gateway"
  private apiKey: string
  private models: string[]
  private db?: unknown

  constructor(apiKey: string | undefined, models?: string[]) {
    if (!apiKey) throw new AiNotConfiguredError()
    this.apiKey = apiKey
    this.models = models?.length ? [...new Set(models)] : resolveModels(undefined)
  }

  private get model(): string {
    return this.models[0]!
  }
  private fallbacks(): string[] {
    return this.models.slice(1)
  }
  private servedModel: string | null = null
  private liveStage = ""
  /** Model output so far this run — reset at the start of each. */
  private liveChars = 0

  private agentArgs(onEvent?: DirectorEventHandler) {
    return {
      fallbackModels: this.fallbacks(),
      onModel: (m: string) => {
        this.servedModel = m
      },
      onDelta: (delta: string) => {
        this.liveChars += delta.length
        onEvent?.({ type: "text", stage: this.liveStage || "Composing", delta })
        // Output length is the only honest progress signal available
        // while a model writes several hundred lines of code. The client
        // shows a real count rather than a bar that means nothing.
        onEvent?.({ type: "output", chars: this.liveChars, stage: this.liveStage })
      },
    }
  }

  private track(onEvent?: DirectorEventHandler): DirectorEventHandler {
    return (e) => {
      if (e.type === "stage") {
        // A stage change starts a new unit of work, so the byte count
        // restarts — the client shows progress within the current step.
        if (e.stage !== this.liveStage) this.liveChars = 0
        this.liveStage = e.stage
      }
      onEvent?.(e)
    }
  }

  withDb(db: unknown): this {
    this.db = db
    return this
  }

  /**
   * Lint-then-repair. Only called when the static gate found a blocker.
   *
   * Returns `advanced: false` when a pass made no progress, so the
   * caller can tell "the model could not help" apart from "the model
   * fixed it". Comparing source strings used to stand in for that and it
   * was indistinguishable from a legitimate no-op fix.
   */
  private async repairSync(
    code: string,
    problems: string,
    canvas: Canvas,
    brief: string,
    onEvent?: DirectorEventHandler,
    stream?: boolean
  ): Promise<{ code: string; warnings: string[]; advanced: boolean }> {
    const STALLED = (): { code: string; warnings: string[]; advanced: boolean } => ({
      code,
      warnings: [],
      advanced: false,
    })

    const fixed = await runRepairer({
      model: this.model,
      apiKey: this.apiKey,
      code,
      errors: problems.split("\n"),
      canvas,
      brief,
      stream,
      onToken: (tokens) => onEvent?.({ type: "progress", tokens }),
      ...this.agentArgs(onEvent),
    })
    if (!fixed.fixed) {
      console.log(JSON.stringify({ msg: "repair-failed", problems: problems.slice(0, 200) }))
      return STALLED()
    }
    // The repaired file still has to mount. Anything blocking again means
    // the model is circling; take the version with fewer errors.
    const after = blockingIssues(
      lintComposition(fixed.code, { durationInFrames: canvas.durationInFrames })
    )
    if (after.length === 0) {
      return { code: fixed.code, warnings: [], advanced: true }
    }
    if (after.length >= blockingIssues(lintComposition(code)).length) {
      console.log(JSON.stringify({ msg: "repair-no-improvement", after: after.length }))
      return STALLED()
    }
    // Fewer errors but not clean: still real progress, so let the loop
    // run again on this version.
    return { code: fixed.code, warnings: [], advanced: true }
  }

  async direct(req: DirectRequest, onEvent?: DirectorEventHandler): Promise<DirectResult> {
    const stream = !!onEvent
    const emit = this.track(onEvent)
    const onToken = (tokens: number) => emit({ type: "progress", tokens })
    const stages: Stage[] = []
    const timed = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      const t0 = Date.now()
      try {
        const out = await fn()
        stages.push({ name, ms: Date.now() - t0, ok: true })
        return out
      } catch (err) {
        stages.push({ name, ms: Date.now() - t0, ok: false })
        throw err
      }
    }

    const memoryHint = await readMemoryHint(this.db, req.projectId ?? null).catch(
      () => undefined
    )
    const fps = 30

    /**
     * A follow-up is only a follow-up if the agent can see what came
     * before. Without this, "now make it faster" is read as a brand new
     * brief and the model re-plans a different piece — which is exactly
     * what it did: two unrelated graphs, back to back.
     */
    const priorContext = (req.history ?? [])
      .filter((m) => m.text.trim())
      .slice(-12)
      .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.text.trim().slice(0, 400)}`)
      .join("\n")

    // S1 — the brief, understood.
    emit({ type: "stage", stage: "Reading the brief" })
    const direction: Direction = await timed("direct", () =>
      runDirector({
        model: this.model,
        apiKey: this.apiKey,
        brief: req.prompt,
        format: req.format,
        fps,
        memoryHint,
        priorContext: priorContext || undefined,
        stream,
        onToken,
        images: req.images ?? [],
        ...this.agentArgs(emit),
      })
    )
    const canvas = canvasFor(direction.format, direction.durationSecs, fps)
    // The plan goes up before composing starts. It is the one thing the
    // user can read while nothing is happening yet, and it is the honest
    // answer to "what is it making?" — shown once, not repeated as a log
    // line after the fact.
    emit({
      type: "plan",
      concept: direction.concept.slice(0, 200),
      beats: direction.beats.slice(0, 5),
      signature: direction.signature.slice(0, 160),
    })

    // S2 — the composition itself.
    emit({ type: "stage", stage: "Composing" })
    const rawCode = await timed("compose", () =>
      runChoreographer({
        model: this.model,
        apiKey: this.apiKey,
        brief: req.prompt,
        direction,
        canvas,
        memoryHint,
        stream,
        onToken,
        images: req.images ?? [],
        ...this.agentArgs(emit),
      })
    )

    // S3 — make sure it runs.
    const gated = await timed("verify", () =>
      this.gateAsync(rawCode, canvas, req.prompt, emit, stream)
    )
    const artifact: CodeArtifact = { kind: "code", ...canvas, code: gated.code }

    // The cut is ready to watch. Hand it over NOW rather than waiting for
    // the review and the reply to finish — those two are the tail of the
    // run, and making the user stare at a progress card while a video
    // already exists is the difference between "fast" and "slow".
    emit({ type: "artifact", artifact })

    // S4 — one call: what to say, and the one follow-up worth offering.
    emit({ type: "stage", stage: "Writing your reply" })
    const voice = await timed("voice", () =>
      runVoice({
        model: this.model,
        apiKey: this.apiKey,
        brief: req.prompt,
        direction,
        summary: summariseComposition(artifact),
        stream,
        onToken,
        ...this.agentArgs(emit),
      })
    )

    if (req.projectId) {
      const sig = `${direction.concept.slice(0, 120)} | ${direction.format} | ${direction.palette.hero}`
      void writeMemory(this.db, req.projectId, "direction", sig).catch(() => {})
    }

    if (voice.offers.length > 0) {
      emit({ type: "offers", offers: voice.offers })
    }
    console.log(
      JSON.stringify({
        msg: "direct-ledger",
        stages: stages.map((s) => `${s.name}:${s.ok ? "ok" : "FAIL"}:${s.ms}ms`),
        offers: voice.offers.length,
        questions: direction.questions.length,
      })
    )

    return {
      artifact,
      reply: voice.reply,
      plan: {
        concept: direction.concept.slice(0, 200),
        beats: direction.beats.slice(0, 5),
        signature: direction.signature.slice(0, 160),
        palette: direction.palette,
      },
      questions: direction.questions,
      offers: voice.offers,
      model: this.servedModel ?? this.model,
      // Render advisories only. The review's judgement is conversation now,
      // not a warning list.
      warnings: gated.warnings.slice(0, 2),
    }
  }

  /** Async form of the gate — kept separate so `gate` can be called bare. */
  private async gateAsync(
    raw: string,
    canvas: Canvas,
    brief: string,
    onEvent: DirectorEventHandler,
    stream?: boolean
  ): Promise<{ code: string; warnings: string[] }> {
    const { code, trailing } = extractComponent(raw)
    if (code.trim() === "") throw new Error("The model returned no composition.")
    if (!hasDefaultExport(code)) throw new Error("The composition has no default export.")
    if (trailing) {
      console.log(JSON.stringify({ msg: "code-trailing-prose", chars: trailing.length }))
    }

    const warnings = lintComposition(code, {
      durationInFrames: canvas.durationInFrames,
    })
      .filter((i) => i.severity === "warn")
      .map((i) => i.message)

    /**
     * Repair until it is actually sound, not once and hope.
     *
     * A single attempt was publishing code that still did not run: the
     * repairer would fix one thing, the file would still be broken, and
     * the artifact shipped anyway — so the user got a black frame and
     * a ReferenceError instead of a retry. Each pass re-lints and hands
     * the *current* file back, so fixes compound. Three passes is enough
     * to clear a missing import plus a typo plus a stray prop, and the
     * loop stops the moment the lint is clean.
     */
    let current = code
    for (let attempt = 1; attempt <= REPAIR_PASSES; attempt++) {
      const blocking = blockingIssues(
        lintComposition(current, { durationInFrames: canvas.durationInFrames })
      )
      if (blocking.length === 0) return { code: current, warnings }

      onEvent({
        type: "stage",
        stage: attempt === 1 ? "Fixing the render" : "Still fixing the render",
      })
      const fixed = await this.repairSync(
        current,
        describeIssues(blocking),
        canvas,
        brief,
        onEvent,
        stream
      )
      if (!fixed.advanced) {
        console.log(
          JSON.stringify({
            msg: "repair-stalled",
            attempt,
            problems: describeIssues(blocking).slice(0, 200),
          })
        )
        break
      }
      current = fixed.code
    }

    /**
     * Still broken. Refusing is the whole point: a file that cannot mount
     * is worth nothing to the user, and silently handing it over as
     * "done" is the worst outcome — it looks like the model succeeded.
     * So the run fails, the message says why in plain words, and the
     * existing retry path offers a fresh attempt.
     */
    const remaining = blockingIssues(
      lintComposition(current, { durationInFrames: canvas.durationInFrames })
    )
    if (remaining.length > 0) {
      throw new Error(
        "I couldn't get this one to run cleanly after several attempts — " +
          "it was still throwing: " +
          remaining.map((i) => i.message).join("; ").slice(0, 300)
      )
    }

    return { code: current, warnings }
  }

  async refine(
    req: RefineRequest,
    onEvent?: DirectorEventHandler
  ): Promise<{
    reply: string
    artifact: Artifact
    model: string
    offers?: string[]
    warnings: string[]
  }> {
    const stream = !!onEvent
    const emit = this.track(onEvent)
    const prev = asArtifact(req.artifact)
    if (!prev) throw new Error("There is no composition to edit yet.")
    if (prev.kind === "doc") {
      throw new Error(
        "This version was made with the old editor and can't be edited — describe the change again to build a fresh one."
      )
    }

    const history = await this.serverHistory(req.projectId ?? null)
    const memoryHint = await readMemoryHint(this.db, req.projectId ?? null).catch(
      () => undefined
    )

    emit({ type: "stage", stage: "Applying your change" })
    const canvas = {
      width: prev.width,
      height: prev.height,
      fps: prev.fps,
      durationInFrames: prev.durationInFrames,
    }
    const edited = await runEditor({
      model: this.model,
      apiKey: this.apiKey,
      code: prev.code,
      note: req.note,
      brief: req.prompt,
      canvas,
      history: [history, ...req.history.slice(-10).map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.text}`)]
        .filter(Boolean)
        .join("\n"),
      memoryHint,
      stream,
      onToken: (tokens) => emit({ type: "progress", tokens }),
      images: req.images ?? [],
      ...this.agentArgs(emit),
    })

    if (edited.strategy === "failed") {
      throw new Error("That change could not be applied to the composition.")
    }
    if (edited.misses.length > 0) {
      console.log(JSON.stringify({ msg: "edit-op-misses", misses: edited.misses }))
    }

    // The edit can break the file. Lint before it is ever mounted.
    const gated = await this.gateAsync(edited.code, canvas, req.prompt, emit, stream)
    const artifact: CodeArtifact = { kind: "code", ...canvas, code: gated.code }
    // Same as direct(): the user sees the new cut the moment it runs,
    // not when the copy is finished.
    emit({ type: "artifact", artifact })

    const direction: Direction = {
      concept: req.prompt.slice(0, 200),
      beats: [],
      palette: { bg: "#000", hero: "#fff", accent: "#fff" },
      durationSecs: Math.round(artifact.durationInFrames / artifact.fps),
      format: "16:9",
      signature: "",
      questions: [],
    }

    // The editor's own sentence is usually the better one — it made the
    // change and describes what it actually did. The voice call still
    // runs, because the follow-up it produces is what makes the thread
    // feel like a conversation rather than a task queue, and it only
    // replaces the sentence when there is not one yet.
    const voice = await runVoice({
      model: this.model,
      apiKey: this.apiKey,
      brief: req.prompt,
      direction,
      summary: summariseComposition(artifact),
      note: req.note,
      stream,
      onToken: (tokens) => emit({ type: "progress", tokens }),
      ...this.agentArgs(emit),
    })
    const reply = edited.reply.length >= 3 ? edited.reply : voice.reply
    const offers = voice.offers

    if (req.projectId && /vibe|style|love|like|prefer|font|colour|color|palette/i.test(req.note)) {
      void writeMemory(this.db, req.projectId, "vibe", req.note.slice(0, 200)).catch(() => {})
    }

    if (offers.length > 0) emit({ type: "offers", offers })

    return {
      reply: reply.slice(0, 280),
      artifact,
      model: this.servedModel ?? this.model,
      offers,
      warnings: gated.warnings.slice(0, 2),
    }
  }

  /**
   * Client-driven repair. The browser is the only place that can prove a
   * composition runs, so when it throws, it posts the real error here and
   * gets a corrected file back. This is what replaced the whole
   * schema-conformance repair chain.
   */
  async repair(
    req: RepairRequest,
    onEvent?: DirectorEventHandler
  ): Promise<{ code: string; fixed: boolean; warnings: string[] }> {
    const emit = this.track(onEvent)
    const canvas = {
      width: req.width,
      height: req.height,
      fps: req.fps,
      durationInFrames: Math.min(MAX_FRAMES, Math.max(1, Math.round(req.durationInFrames))),
    }
    emit({ type: "stage", stage: "Fixing the render" })
    const out = await this.repairSync(
      req.code,
      req.errors.map((e) => `- ${e}`).join("\n"),
      canvas,
      req.prompt ?? "",
      emit,
      !!onEvent
    )
    const after = blockingIssues(
      lintComposition(out.code, { durationInFrames: canvas.durationInFrames })
    )
    return { code: out.code, fixed: out.code !== req.code, warnings: after.map((i) => i.message) }
  }

  /** Server-side session history: versions table is the source of truth. */
  private async serverHistory(projectId: string | null | undefined): Promise<string> {
    try {
      if (!this.db || !projectId) return ""
      const d = this.db as {
        prepare: (sql: string) => {
          bind: (...v: unknown[]) => {
            all: () => Promise<{ results?: Array<{ note?: unknown; reply?: unknown }> }>
          }
        }
      }
      const res = await d
        .prepare("SELECT note, reply FROM versions WHERE project_id = ? ORDER BY version_no DESC LIMIT 6")
        .bind(projectId)
        .all()
      return (res.results ?? [])
        .reverse()
        .flatMap((r) => [
          ...(r.note ? [`User: ${String(r.note).slice(0, 400)}`] : []),
          ...(r.reply ? [`AI: ${String(r.reply).slice(0, 400)}`] : []),
        ])
        .join("\n")
        .slice(0, 2500)
    } catch {
      return ""
    }
  }
}

function summariseComposition(a: CodeArtifact): string {
  const secs = (a.durationInFrames / a.fps).toFixed(1)
  return `${a.width}x${a.height}, ${a.durationInFrames} frames (${secs}s) at ${a.fps}fps. ${summariseComponent(a.code)}.`
}

/** Exported for the routes' error messages. */
export { describeArtifact }

export function createAiProvider(env: {
  AI_PROVIDER: string
  AI_MODEL: string
  AI_GATEWAY_API_KEY?: string
  DB?: unknown
}): AiProvider {
  if ((env.AI_PROVIDER || "gateway").toLowerCase() !== "gateway") {
    throw new Error(`Unknown AI_PROVIDER "${env.AI_PROVIDER}"`)
  }
  const provider = new GatewayProvider(env.AI_GATEWAY_API_KEY, resolveModels(env.AI_MODEL))
  if (env.DB) provider.withDb(env.DB)
  return provider
}

export const createGatewayProvider = createAiProvider
