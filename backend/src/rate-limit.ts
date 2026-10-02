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

/** Mirrors the gateway's own header so the two cannot drift apart silently. */
export const REQUESTS_PER_WINDOW = 5
export const WINDOW_MS = 60_000

/** Even spacing beats a burst-then-429: 5 calls spread over a minute. */
const MIN_SPACING_MS = Math.ceil(WINDOW_MS / REQUESTS_PER_WINDOW)

/** How many times a 429 is re-attempted after honouring retry-after. */
const MAX_RATE_LIMIT_RETRIES = 2

type FetchFn = typeof fetch

let lastCallAt = 0

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Waits until the next model call is allowed. */
async function pace(): Promise<void> {
  const wait = lastCallAt + MIN_SPACING_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastCallAt = Date.now()
}

/**
 * Test seam. A Durable Object isolate is long-lived, so the spacing clock
 * survives between turns — that is deliberate, since it is what enforces the
 * limit across a conversation. Tests need to reset it.
 */
export function resetPacing(): void {
  lastCallAt = 0
}

/**
 * A fetch that paces model calls and survives a 429.
 */
export function createPacedFetch(inner: FetchFn = fetch): FetchFn {
  return async (input, init) => {
    let attempt = 0

    for (;;) {
      await pace()
      const response = await inner(input, init)

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
