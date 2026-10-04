/**
 * Gateway middleware for the Vercel AI Gateway: request pacing and 429 recovery.
 *
 * The gateway key is limited to 5 requests per minute, per region, team-wide:
 *
 *     x-ratelimit-limit-requests: 5
 *     x-ratelimit-limit-tokens: 1000000
 *     retry-after: 40
 *
 * Tokens are never the constraint — a million per minute against a model that
 * costs $0.03/M input. Requests are. And because a single agent turn can be
 * several model calls (one per tool-loop step), an un-paced loop burns the
 * whole minute on one user and then fails.
 *
 * So the limit is enforced here, at the only place every model call passes
 * through. `createOpenAI({ fetch })` is a documented middleware hook, which
 * means this paces the FIRST call of a turn and every step after it, without
 * the agent having to know a limit exists.
 *
 * Sleeping costs no CPU: Durable Object wall time is unlimited and only active
 * time is billed, so pacing is free on the Workers Free plan.
 */

/**
 * Adaptive gateway pacing.
 *
 * The old code slept a fixed 12s before EVERY model call (60s / 5 req), so a
 * 10-step turn always cost 2+ minutes even when the gateway key had quota to
 * spare. That fixed sleep was the "5 minutes for a basic thing" complaint.
 *
 * Now: burst while quota remains, pace only when the gateway says we are low.
 * The gateway answers every call with x-ratelimit-remaining-requests /
 * x-ratelimit-reset (+ retry-after on 429) — trust those headers over any
 * schedule of our own. Floor spacing stays small (750ms) so tool-loop steps
 * stream back-to-back at full speed until the bucket actually runs dry.
 */
/**
 * Gateway quota default. Today's key serves 5 requests/minute (observed
 * `x-ratelimit-limit-requests: 5` + `retry-after: 40` on 429s) — that header,
 * not this file, is the limit. Raise the key's quota on the gateway
 * dashboard, set GATEWAY_RPM to match (read from Env in chat.ts), redeploy,
 * and turns stop pacing. Until then the fetch below bursts while quota
 * remains and only waits when headers say the bucket is dry.
 */
export const REQUESTS_PER_WINDOW = 5
export const WINDOW_MS = 60_000

/** Floor between calls when quota looks healthy — lets steps stream fast. */
const MIN_SPACING_MS = 750

/** When remaining quota drops to this, spread the rest of the window. */
const LOW_QUOTA_THRESHOLD = 1

/** How many times a 429 is re-attempted after honouring retry-after. */
const MAX_RATE_LIMIT_RETRIES = 3

type FetchFn = typeof fetch

let lastCallAt = 0
/** Earliest epoch ms the next call may start (set from rate-limit headers). */
let notBefore = 0

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Waits only as long as headers + floor spacing require. */
async function pace(): Promise<void> {
  const now = Date.now()
  const floorWait = lastCallAt + MIN_SPACING_MS - now
  const headerWait = notBefore - now
  const wait = Math.max(0, floorWait, headerWait)
  if (wait > 0) await sleep(wait)
  lastCallAt = Date.now()
}

function learnFromHeaders(headers: Headers): void {
  try {
    const remainingRaw = headers.get("x-ratelimit-remaining-requests")
    const resetRaw =
      headers.get("x-ratelimit-reset") ??
      headers.get("x-ratelimit-reset-requests") ??
      headers.get("ratelimit-reset")
    const remaining = remainingRaw !== null ? Number(remainingRaw) : NaN
    if (Number.isFinite(remaining) && remaining <= LOW_QUOTA_THRESHOLD) {
      // Quota nearly dry: if the gateway named a reset time, wait for it;
      // otherwise spread one window across the remaining request.
      let waitMs = Math.ceil(WINDOW_MS / Math.max(1, requestsPerWindow))
      if (resetRaw) {
        const reset = Number(resetRaw)
        if (Number.isFinite(reset) && reset > 0) {
          // Header may be seconds-until-reset or epoch seconds/ms.
          const now = Date.now()
          if (reset < 10000) waitMs = Math.min(reset * 1000 + 250, WINDOW_MS)
          else if (reset < 1e12) waitMs = Math.max(0, reset * 1000 - now + 250)
          else waitMs = Math.max(0, reset - now + 250)
        }
      }
      notBefore = Date.now() + waitMs
    } else if (Number.isFinite(remaining) && remaining > LOW_QUOTA_THRESHOLD) {
      // Healthy quota — clear any previous backoff, keep floor spacing only.
      notBefore = 0
    }
  } catch {
    // Headers are advisory — never fail a turn on them.
  }
}

/**
 * Test seam. A Durable Object isolate is long-lived, so the spacing clock
 * survives between turns — that is deliberate, since it is what enforces the
 * limit across a conversation. Tests need to reset it.
 */
export function resetPacing(): void {
  lastCallAt = 0
  notBefore = 0
}

/**
 * Override the 5 rpm default when the gateway key quota is raised — called
 * once per turn from chat.ts with the Env value. Takes effect for every
 * model call after it (isolate-wide, like the pacing clock itself).
 */
export function setRequestsPerWindow(n: number): void {
  if (Number.isFinite(n) && n > 0) requestsPerWindow = Math.floor(n)
}

let requestsPerWindow = REQUESTS_PER_WINDOW

/**
 * A fetch that bursts while quota remains and only paces when headers say
 * the bucket is dry — plus 429 recovery via retry-after.
 */
export function createPacedFetch(inner: FetchFn = fetch): FetchFn {
  return async (input, init) => {
    let attempt = 0

    for (;;) {
      await pace()
      const response = await inner(input, init)
      learnFromHeaders(response.headers)

      if (response.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) {
        return response
      }

      // The gateway sends `retry-after` in seconds. Trust it over any schedule
      // of our own; fall back to a full window if it is missing or nonsense.
      const header = Number(response.headers.get("retry-after"))
      const waitMs =
        Number.isFinite(header) && header > 0
          ? Math.min(header * 1000 + 250, WINDOW_MS)
          : WINDOW_MS

      attempt += 1
      notBefore = Date.now() + waitMs
      console.log(
        JSON.stringify({
          msg: "gateway-rate-limited",
          attempt,
          waitMs,
          remaining: response.headers.get("x-ratelimit-remaining-requests"),
        })
      )
      await sleep(waitMs)
    }
  }
}
