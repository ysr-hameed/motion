/**
 * What the user sees while a run is in flight.
 *
 * Measured on a real five-second cut: 29s before the first token, 89s of
 * composing with nothing to show, then 56s of review and copy. The old UI
 * covered that with a four-row checklist that stayed on screen after the
 * run finished — a build log, not a conversation.
 *
 * So there is no checklist and no invented bar. There is one line saying
 * what is happening, an elapsed counter, and — during composing — a live
 * count of what has actually been written. The count is the point: the
 * model streams the composition's source, so the user can watch real
 * output arrive instead of guessing whether anything is happening.
 */

import type { RunProgress } from "./use-motion-studio"

/** User-facing copy for each backend stage. Never rendered verbatim. */
const STAGE_COPY: Record<string, string> = {
  "Reading the brief": "Reading your brief",
  Composing: "Writing the animation",
  "Applying your change": "Applying your change",
  "Fixing the render": "Checking it runs",
  "Writing your reply": "Wrapping up",
}

export function friendlyStage(stage: string | null | undefined): string {
  if (!stage) return "Working on it"
  return STAGE_COPY[stage] ?? "Working on it"
}

/** Stages that write code, and so have a meaningful running character count. */
const WRITING = new Set(["Composing", "Applying your change"])

/**
 * Roughly how many characters a finished composition runs to. Measured
 * across real generations: 150–200 lines of TSX lands around 6–9k
 * characters. The bar saturates there and stays full rather than
 * pretending to know a total the pipeline does not know either.
 */
const TYPICAL_OUTPUT = 7000

export interface LiveLine {
  /** The sentence: what is happening right now. */
  text: string
  /** A trailing fragment — "· 4.2k chars" — or null. */
  detail: string | null
  /** 0-100, saturating at a typical composition. */
  pct: number
}

/**
 * The one live line. Returns null when there is nothing to say, so the
 * caller renders nothing at all rather than a stale summary.
 */
export function liveStatus(progress: RunProgress | null | undefined): LiveLine | null {
  if (!progress) return null
  const stage = progress.stage

  /**
   * Nothing has come back yet. On the free tier the gateway can sit on
   * the request for 25s+ — during rate limiting or a cold model the
   * first token simply has not arrived, so this is a wait, not progress.
   * Saying so is both true and reassuring; a spinner reading as a hang
   * is the thing worth avoiding.
   *
   * One phrase, deliberately. This used to vary by internal stage
   * ("Waiting for the model" → "Waiting for the first line" as it
   * crossed from reading to composing), which flipped the sentence every
   * few seconds while nothing about the actual state had changed. Two
   * labels for one state is noise, and the user has to stop and wonder
   * which one is the real status.
   */
  if (progress.chars === 0) {
    return { text: "Waiting for the model", detail: null, pct: 4 }
  }

  if (WRITING.has(stage)) {
    const chars = progress.chars
    const kb = chars >= 1000 ? `${(chars / 1000).toFixed(1)}k` : String(chars)
    return {
      text: friendlyStage(stage),
      detail: `· ${kb} chars`,
      pct: Math.min(100, Math.max(6, Math.round((chars / TYPICAL_OUTPUT) * 100))),
    }
  }

  return {
    text: friendlyStage(stage),
    detail: null,
    pct: 62,
  }
}

/**
 * The whole vocabulary, so the copy can be checked in one place. Three
 * states, no overlap, and each one maps to a thing that is observably
 * different rather than to an internal stage boundary.
 */
export const LIVE_STATUS_VOCAB = {
  /** Request sent, nothing back yet. */
  waiting: "Waiting for the model",
  /** Tokens arriving — the real count is the reassurance. */
  writing: "Writing the animation",
  /** Composed; checking it actually runs. */
  fixing: "Checking it runs",
  /** Done writing; wrapping up. */
  wrapping: "Wrapping up",
} as const
