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

Two, both in `backend/src/tools.ts`:

- `get_current_time(timezone)` — IANA zone, used for anything about the present
- `calculate(expression)` — arithmetic, parsed by a small recursive-descent
  evaluator rather than `eval`, because the expression is untrusted model output

`calculate` deliberately does not use `eval`/`new Function`: the input comes
from a model, so that would turn a bad generation into remote code execution.

## Model

`AI_MODEL` is a comma-separated chain, tried in order:

```
alibaba/qwen3.7-flash,google/gemini-2.0-flash
```

A model that returns a provider error is put in a 90s cooldown stored in the
agent's state, so the **next** turn starts on a healthy one. This matters
because the gateway's per-model quota is per team and shared across regions —
a 429 from one model says nothing about the next. The cooldown is per
conversation, not global.

`maxRetries` is 1 on purpose. The quota answers "Retry after 60s", so the SDK's
default three attempts turned a rate limit into a turn that hung for minutes.

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

- The team's gateway quota is **5 requests/minute** for `alibaba/qwen3.7-flash`,
  shared across all regions. A burst of parallel users can exhaust it. Those
  turns end with a visible, retryable error rather than a hang.
- The frontend chat bundle is ~508 kB (148 kB gzipped), mostly Remotion-free but
  AI SDK + React + the client transport. Worth code-splitting later.

## Recovery from the pre-rewrite state

The previous implementation is preserved at git tag `pre-rewrite-2026-10-02`.

```bash
git diff pre-rewrite-2026-10-02 HEAD -- backend   # inspect what was removed
git checkout pre-rewrite-2026-10-02 -- backend/src # bring a file back
```