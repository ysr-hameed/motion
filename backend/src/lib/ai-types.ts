/** Realtime lifecycle events streamed to the client (no extra tokens). */
export type DirectorEvent =
  | { type: "stage"; stage: string }
  | { type: "progress"; tokens: number }
  /**
   * Raw model text deltas. Their length is a real progress signal while
   * the repairer writes, so the live status counts them instead of
   * inventing a bar.
   */
  | { type: "text"; stage: string; delta: string }
  /** Bytes of model output so far, for the live status. */
  | { type: "output"; chars: number; stage: string }

export type DirectorEventHandler = (e: DirectorEvent) => void

export interface RepairRequest {
  /** The file that failed to run. */
  code: string
  /** Real diagnostics — transpiler output, render throws, lint findings. */
  errors: string[]
  width: number
  height: number
  fps: number
  durationInFrames: number
  prompt?: string
  projectId?: string | null
}

export interface AiProvider {
  name: string
  /**
   * Client-driven repair. The browser mounts the composition, so it is the
   * only place that can prove a file runs. When it throws, it posts the
   * real error here and gets a corrected file back.
   */
  repair(
    req: RepairRequest,
    onEvent?: DirectorEventHandler
  ): Promise<{ code: string; fixed: boolean; warnings: string[] }>
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI provider is not configured (missing API key)")
    this.name = "AiNotConfiguredError"
  }
}
