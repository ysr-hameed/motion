# SlyxUp Motion

A chat agent on Cloudflare Workers + Durable Objects, using the Vercel AI
Gateway for the model.

```
backend/    Worker (slyxup-motion-api): the Chat Durable Object + /api/health
frontend/   Vite + React, deployed to Cloudflare Pages
skills/     Vendored Remotion reference docs, for the next phase
```

| Piece | Where |
|---|---|
| Frontend | https://motion.slyxup.com (Pages) |
| Backend / agent | https://slyxup-motion-api.slyxup-smarketing.workers.dev (Worker) |

## Why it is built this way

The previous implementation hand-rolled its own agent loop over plain HTTP. To
stay inside a tight CPU budget it ran **one model call per HTTP request** and
had the browser chain the next step by posting a `[continue-turn]` token. That
design caused most of the problems it was trying to avoid:

- A "turn" was really a dozen round trips, so it stalled, capped out, or needed
  the user to press Retry.
- The whole transcript was re-read from D1 and re-serialized **on every step**,
  so CPU grew with conversation length.
- History was truncated to fit, which silently dropped the original brief — the
  model then re-planned the same cut repeatedly.
- Capping output to survive CPU limits made the model unable to write code at
  all; uncapping it killed the request mid-stream.

Durable Objects fix the cause rather than the symptom. The loop, the transcript
and stream state live in one DO instance per session, so a request carries one
new message instead of the conversation. A turn is a turn — no continuation
token, no step cap, no client-side re-chaining.

### CPU budget

This is the part worth understanding before changing anything:

- A SQLite-backed Durable Object gets **30s of CPU per invocation by default**,
  and each incoming WebSocket message resets that budget. Durable Objects are
  available on Workers Free.
- **CPU is active time only.** Every millisecond spent waiting on the model
  gateway is I/O and counts for nothing.
- The Free plan's ~10ms per-request cap therefore applies only to the *outer*
  Worker, which does almost nothing: match the URL, forward to the DO, return
  the response. It never parses a transcript and never waits on a model.

There is deliberately **no `limits` block** in `backend/wrangler.jsonc` — this
account is on Free, which rejects it, and it is not needed.

## What the SDK handles, so none of it is re-implemented here

| Concern | Handled by |
|---|---|
| Streaming, multi-step tool loop | `streamText` + AI SDK |
| Tool schema from the validator | `tool()` + zod |
| Transcript persistence | SQLite in the DO |
| Reconnect / stream resume | buffered chunks + `resume` |
| DO eviction mid-stream | `runFiber` + `onChatRecovery` |
| Runaway turns | `chatRecovery` budgets |
| Cancellation | `abortSignal`, client `stop()` |
| Cross-origin routing + CORS | `routeAgentRequest({ cors })` |

## Tools

Sixty-four, all scoped to a single composition — none of them take a project or
file id, because there is exactly one cut per conversation and an id the model
could get wrong was a reliable source of mistakes.

Fast path (a new brief costs 3 calls, not 11):

| Tool | Purpose |
|---|---|
| `quick_start` | Plans + writes + validates a golden composition in ONE call |
| `preview_composition` | Publishes to the player; only when it validates |
| `read_render_report` | Browser compile+mount verdict — the only render truth |

Full path and refinement:

| Tool | Purpose |
|---|---|
| `creative_direct` | Art direction in one call: intent + palette + fonts + beat→preset map |
| `load_skill` | One of 53 vendored skills (Remotion API + 9 working examples + 4 design skills), on demand |
| `plan_motion` | Records the beat sheet; the player draws it as a timeline |
| `read_file` | Current source, verbatim |
| `write_composition` | The whole file in one call; auto-repairs inline, refuses invalid source |
| `edit_file` / `bulk_edit` | Exact-string ops for small / batched changes |
| `validate_composition` | Errors that stop a render, warnings that mean a blank frame |
| `verify_no_errors` | Blocking gate before preview (errors + failed player report) |
| `auto_fix_code` / `auto_enhance_motion` | Mechanical repairs, max 2 rounds |
| `review_motion` | Motion critique — see below |
| `list_versions` / `restore_version` | Roll back without losing history |

`validate_composition` catches the failures that are expensive to discover late:
`useState` in a composition, `Math.random()`, CSS transitions, an
`interpolate()` with no frame, a transition with no timing config, a bare `all`
transition without `springTimingConfig`, and imports from packages the browser
scope does not provide.

`review_motion` is not a linter. It looks for the things that make motion read
as cheap — all-linear timing, opacity as the only change, nothing that settles,
no stagger on a mapped list, a single-beat plan stretched to fill the clip — and
returns two or three specific findings rather than a generic list.

### Skills

52 documents in `skills/remotion-markup/` (38 Remotion API + 9 working
examples + 4 design skills: `creative-direction`, `kinetic-typography`,
`cinematic-motion`, `layout-composition`), inlined into the Worker by
`pnpm run skills:build` (53 entries with the live reference cut). Newest:
`code-syntax` (Code Hike mechanic, zero dependencies), `shapes-paths`
(SVG trim reveals + interpolateColors), `noise-grain` (film grain + seeded
random rules), `captions` (TikTok-pattern subtitles).
The model sees only the ids (~60 tokens) and pulls the one it needs, so a
`load_skill` costs 1-3k tokens of context regardless of how many exist.

`calculate` deliberately does not use `eval`/`new Function`: the input comes
from a model, so that would turn a bad generation into remote code execution.

## Model

One model: `alibaba/qwen3.7-flash` on the Vercel AI Gateway.

It is a vision model with a 991k context window, and advertises `reasoning`,
`tool-use`, `vision` and `file-input`. That is why the provider is
`@ai-sdk/openai-compatible` rather than `@ai-sdk/openai`: the gateway speaks the
OpenAI wire format but returns reasoning in a `delta.reasoning` field, and only
the compatible provider maps it. With `@ai-sdk/openai` the chain of thought was
silently dropped and the UI showed no thinking at all.

Reference images and PDFs attach as real file parts, not as descriptions.

### Rate limiting — this key is capped, and it is not a code problem

```
x-ratelimit-limit-requests: 5      per minute
x-ratelimit-limit-tokens: 1000000  (tokens are never the constraint)
retry-after: 40                    on a 429
```

Five requests a minute, per region, team-wide. A turn that runs the workflow is
~10 model calls, so **one user's turn can spend the whole minute**.

That is an account limit, not a bug, and no amount of code removes it — it has
to be raised on the gateway key. What the code does is stop making it worse:

- `rate-limit.ts` spaces calls to one per 12s via `createOpenAI({ fetch })`, a
  documented interception point, so the first call and every tool-loop step pass
  through it. Sleeping costs no CPU: Durable Object wall time is unlimited.
- A 429 is retried only after the window the gateway itself named, instead of on
  the SDK's own backoff curve.
- `maxRetries` is 0 on the model, because that retry would compound the wait.
- The UI shows a real stall watchdog at 150s, long enough for a paced turn.

A user still watching the clock is the residual cost of a 5 rpm key.

## Setup

```bash
pnpm install

cp backend/.dev.vars.example backend/.dev.vars   # add your gateway key
cp frontend/.env.example frontend/.env

pnpm cf-typegen   # generates backend/worker-configuration.d.ts
pnpm run dev      # backend :8787, frontend :5173
```

In dev the Vite server proxies `/agents` and `/api` to the Worker, so
`VITE_API_HOST` is empty and the browser sees a single origin.

In production the two are genuinely different domains, so
`frontend/.env.production` sets `VITE_API_HOST` to the Worker and the Worker
allows `https://motion.slyxup.com` in CORS (`backend/src/server.ts`). Change
one and you must change the other.

## Secrets

The gateway key is a Worker secret and is never committed.

```bash
cd backend
wrangler secret put AI_GATEWAY_API_KEY
```

`worker-configuration.d.ts` is generated and gitignored. Because `wrangler types`
reads `.dev.vars`, create that file before running `pnpm cf-typegen` or the key
will be missing from the generated `Env` type.

## Deploy

```bash
pnpm run deploy          # Worker, then Pages
pnpm run deploy:api      # Worker only
pnpm run deploy:web      # Pages only
```

Pages rejects `account_id` in config, so `deploy:web` is run with
`CLOUDFLARE_ACCOUNT_ID` in the environment pointing at the account that owns
`motion-frontend`. The Worker sets its own `account_id` in `wrangler.jsonc`
because this login can see six accounts and wrangler will not guess.

## Known limits

- **The 5 requests/minute cap is the product constraint right now.** It belongs
  on the gateway key, not in the code — see above.
- A full workflow turn takes ~2 minutes because of that pacing. The UI says
  "working" and shows the tool log, so it reads as progress rather than a hang.
- `MAX_STEPS` is 14. Enough for skills, plan, write, validate, two edit rounds,
  verify, one preview, one report, plus the closing sentence; loop caps
  (pending-report ×2, code-dump guard) stop runaways instead of the step count.

## Recovery from the pre-rewrite state

The previous implementation is preserved at git tag `pre-rewrite-2026-10-02`.

```bash
git diff pre-rewrite-2026-10-02 HEAD -- backend   # inspect what was removed
git checkout pre-rewrite-2026-10-02 -- backend/src # bring a file back
```