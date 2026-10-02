# SlyxUp Motion

A chat agent on Cloudflare Workers + Durable Objects, using the Vercel AI
Gateway for the model.

```
backend/    Worker: the Chat Durable Object + /api/health, serves the built frontend
frontend/   Vite + React client (useAgent + useAgentChat)
skills/     Vendored Remotion reference docs, for the next phase
```

## Why it is built this way

The previous implementation hand-rolled its own agent loop over plain HTTP. To
stay inside a tight CPU budget it ran **one model call per HTTP request** and
had the browser chain the next step by posting a `[continue-turn]` token. That
design caused most of the problems it was trying to avoid:

- A "turn" was really 12 round trips, so it stalled, capped out, or needed the
  user to press Retry.
- The whole transcript was re-read from D1 and re-serialized **on every step**,
  so CPU grew with conversation length.
- History was truncated to fit, which silently dropped the original brief — the
  model then re-planned the same cut repeatedly.
- Capping output to survive CPU limits made the model unable to write code at
  all; uncapping it killed the request mid-stream.

Durable Objects fix the cause rather than the symptom. The loop, the transcript
and stream state live in one DO instance per session, so a request carries one
new message instead of the conversation. CPU per request is flat regardless of
thread length, and a turn is a turn — no continuation token, no step cap, no
client-side re-chaining.

What the SDK takes care of, so none of it is re-implemented here:

| Concern | Handled by |
|---|---|
| Streaming, multi-step tool loop | `streamText` + AI SDK |
| Transcript persistence | SQLite in the DO |
| Reconnect / stream resume | buffered chunks + `resume` |
| DO eviction mid-stream | `runFiber` + `onChatRecovery` |
| Runaway turns | `chatRecovery` budgets |
| Cancellation | `abortSignal` |

## Setup

```bash
pnpm install

cp backend/.dev.vars.example backend/.dev.vars   # add your gateway key
cp frontend/.env.example frontend/.env

pnpm cf-typegen   # generates backend/worker-configuration.d.ts
pnpm run dev      # backend :8787, frontend :5173
```

Open http://localhost:5173. Vite proxies `/agents` and `/api` to the Worker, so
the browser sees a single origin in dev exactly as it does in production.

## Model

`AI_MODEL` is a comma-separated chain, tried in order:

```
alibaba/qwen3.7-flash,alibaba/qwen3-max
```

Set it in `backend/wrangler.jsonc` (deployed default) or override locally in
`backend/.dev.vars`. Model ids are Vercel AI Gateway ids.

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
pnpm run deploy          # builds the frontend, then deploys the Worker
```

The Worker serves `frontend/dist` through its assets binding, so the frontend and
API share one origin — there is no CORS anywhere and no second Pages project.

## Recovery from the pre-rewrite state

The previous implementation is preserved at git tag `pre-rewrite-2026-10-02`.

```bash
git diff pre-rewrite-2026-10-02 HEAD -- backend   # inspect what was removed
git checkout pre-rewrite-2026-10-02 -- backend/src # bring a file back
```