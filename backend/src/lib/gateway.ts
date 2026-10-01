import type { AiProvider, RepairRequest, DirectorEventHandler } from "./ai-types"
import { AiNotConfiguredError } from "./ai-types"
import { MAX_FRAMES, type Canvas } from "./artifact"
import { blockingIssues, describeIssues, lintComposition } from "./code-lint"
import { resolveModels } from "./models"
import { runRepairer } from "./agents/repairer"

/**
 * Client-driven repair — the only generation path left in this module.
 *
 * First creation and follow-up edits run through the tool-loop agent
 * (`lib/agent/*`, served at /api/agent/*). This module survives for one
 * reason: the browser player is the only place that can prove a
 * composition runs, so when it throws, it posts the real error here and
 * gets a corrected file back.
 *
 * What is gone: the director/choreographer/editor/voice chain, house
 * memory and the direct/refine endpoints that served them. A composition
 * is TypeScript now, so the only gate is whether it runs — and that is
 * checked by the browser actually running it, then repaired from the
 * real error.
 */

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
  private liveStage = ""
  /** Model output so far this run — reset at the start of each. */
  private liveChars = 0

  private agentArgs(onEvent?: DirectorEventHandler) {
    return {
      fallbackModels: this.fallbacks(),
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
    // Repair until it is actually sound, not once and hope. Each pass
    // re-lints and hands the *current* file back, so fixes compound. A
    // single attempt used to publish code that still did not run — the
    // repairer would fix one thing, the file stayed broken, and the user
    // got a black frame instead of a retry.
    let current = req.code
    for (let attempt = 1; attempt <= REPAIR_PASSES; attempt++) {
      const blocking = blockingIssues(
        lintComposition(current, { durationInFrames: canvas.durationInFrames })
      )
      if (blocking.length === 0) break
      emit({
        type: "stage",
        stage: attempt === 1 ? "Fixing the render" : "Still fixing the render",
      })
      const fixed = await this.repairSync(
        current,
        describeIssues(blocking),
        canvas,
        req.prompt ?? "",
        emit,
        !!onEvent
      )
      if (!fixed.advanced) break
      current = fixed.code
    }
    const remaining = blockingIssues(
      lintComposition(current, { durationInFrames: canvas.durationInFrames })
    )
    return {
      code: current,
      fixed: current !== req.code,
      warnings: remaining.map((i) => i.message),
    }
  }
}

export function createAiProvider(env: {
  AI_PROVIDER: string
  AI_MODEL: string
  AI_GATEWAY_API_KEY?: string
}): AiProvider {
  if ((env.AI_PROVIDER || "gateway").toLowerCase() !== "gateway") {
    throw new Error(`Unknown AI_PROVIDER "${env.AI_PROVIDER}"`)
  }
  return new GatewayProvider(env.AI_GATEWAY_API_KEY, resolveModels(env.AI_MODEL))
}
