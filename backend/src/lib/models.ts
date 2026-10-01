/**
 * Model config — env-driven so local dev and prod use different models.
 *
 * - Local dev (`.dev.vars`):  AI_MODEL=google/gemini-2.0-flash   (free tier)
 * - Prod (`wrangler.jsonc`):   AI_MODEL=alibaba/qwen3.7-flash     (paid)
 * - Chain: comma-separated "primary,fallback" — tried in order, so a
 *   queued/failed primary falls through instead of 502ing.
 * Switching is one line in either file, no code change. /api/health
 * reports the active chain.
 */

/** Vercel AI Gateway — OpenAI-compatible chat completions. */
export const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions"

/** Prod default (paid). Dev overrides via .dev.vars — see .dev.vars.example. */
export const DEFAULT_MODELS = ["alibaba/qwen3.7-flash"]

/** Free-tier dev default. */
export const DEV_MODEL = "google/gemini-2.0-flash"

/** Resolve the model chain from AI_MODEL ("a,b,c" → [a,b,c], deduped). */
export function resolveModels(envModel: string | undefined): string[] {
  const list = (envModel || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
  const chain = [...new Set(list.length ? list : DEFAULT_MODELS)]
  return chain
}

/** First entry wins — kept for call sites that need one display name. */
export function resolveModel(envModel: string | undefined): string {
  return resolveModels(envModel)[0]!
}

export interface StepBudget {
  maxTokens: number
  temperature: number
  /** Abort if no HTTP response by then. */
  timeoutMs: number
  /** Stream idle watchdog — reset per chunk. */
  idleMs: number
  /** Hard cap for the whole stream. */
  totalMs: number
  /** Retries per model on 429/503 queue spikes before trying the next model. */
  retries: number
}

/**
 * No token limits in the strict sense — budgets are high enough that
 * quality never gets truncated. Timeouts stay so the UI never waits
 * forever on a queued model.
 */
export const STEP_BUDGETS: Record<"repairer", StepBudget> = {
  // Repairer is cold and precise — it is fixing, not designing.
  repairer: { maxTokens: 24000, temperature: 0.15, timeoutMs: 150000, idleMs: 45000, totalMs: 200000, retries: 2 },
}
