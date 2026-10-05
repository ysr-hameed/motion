/**
 * Gateway middleware for the Vercel AI Gateway: header-driven backoff and
 * 429 recovery.
 *
 * There is NO client-side request cap: the key serves a quota the code does
 * not assume, so model calls stream as fast as the model responds. The only
 * thing this layer does is respect what the gateway itself reports —
 * x-ratelimit-remaining-requests / x-ratelimit-reset (+ retry-after on 429)
 * — plus an optional manual cap via GATEWAY_RPM if a key ever needs one.
 *
 * It sits at the only place every model call passes through.
 * `createOpenAI({ fetch })` is a documented middleware hook, which means
 * this covers the FIRST call of a turn and every step after it, without
 * the agent having to know about it.
 *
 * Sleeping costs no CPU: Durable Object wall time is unlimited and only active
 * time is billed, so backoff is free on the Workers Free plan.
 */

/**
 * No assumed quota. The old code slept a fixed 12s before EVERY model call
 * (60s / 5 req), then an adaptive 750ms floor — both were guesses about a
 * key that can handle more. Now steps stream back-to-back at full speed and
 * only wait when the gateway's own headers say the bucket is dry.
 */
export const WINDOW_MS = 60_000

/** No floor spacing between calls — removed, the key handles full speed. */
const MIN_SPACING_MS = 0

/** When remaining quota drops to this, back off until the bucket resets. */
const LOW_QUOTA_THRESHOLD = 1

/** Fallback wait when the bucket is dry but the gateway named no reset time. */
const DRY_FALLBACK_MS = 5_000

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
      // otherwise spread one window across a manual cap when set, else a
      // short fixed backoff (no assumed quota).
      let waitMs = Number.isFinite(requestsPerWindow)
        ? Math.ceil(WINDOW_MS / Math.max(1, requestsPerWindow))
        : DRY_FALLBACK_MS
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
 * Optional manual cap (requests per WINDOW_MS) for a key that needs one —
 * called once per turn from chat.ts with the Env value. Unset (the default)
 * means uncapped: only the gateway's own headers govern pacing. Takes effect
 * for every model call after it (isolate-wide, like the backoff clock).
 */
export function setRequestsPerWindow(n: number): void {
  if (n === Infinity) {
    requestsPerWindow = Infinity
    return
  }
  if (Number.isFinite(n) && n > 0) requestsPerWindow = Math.floor(n)
}

let requestsPerWindow = Infinity

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
