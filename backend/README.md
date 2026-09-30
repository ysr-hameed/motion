# SlyxUp Motion API (Cloudflare Workers + Hono + D1 + R2)

Real backend for the Motion frontend. Everything runs **locally** with
`wrangler dev` — local D1 (SQLite) + local R2, no deploys needed.

## Prereqs

- Node 20+
- A Gemini API key (https://aistudio.google.com) — only needed for the AI
  director endpoints; everything else works without it.

## Setup

```bash
cd backend
npm install
cp .dev.vars.example .dev.vars   # then fill in GEMINI_API_KEY

# Database (local)
npm run db:generate              # create drizzle migrations (first time / schema changes)
npm run db:migrate:local         # apply to local D1

# Run (local D1 + R2, port 8787)
npm run dev
```

Health check: `curl localhost:8787/api/health`
→ `{"ok":true,"ai":"gemini","aiConfigured":true}`

## Endpoints (all `/api/*` except health need auth*)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness + AI status (public) |
| GET/POST | `/api/projects` | List / create projects |
| GET/PATCH/DELETE | `/api/projects/:id` | Read (with versions+attachments) / update / delete |
| POST | `/api/projects/:id/versions` | Record a rendered version |
| POST | `/api/ai/direct` | `{prompt, format}` → spec + clarify questions |
| POST | `/api/ai/refine` | `{prompt, format, style, history, note}` → reply |
| POST | `/api/uploads` | multipart `file` (+ optional `projectId`) → R2 |
| GET | `/api/uploads/:id` | Stream a reference image |
| GET | `/api/export/:id` | Download the project file |

\* Auth = Stack session (Bearer/cookie). With `ALLOW_ANON=true` (local
default) requests without credentials get the `local-dev` identity.

## Frontend wiring

```bash
# frontend/.env
VITE_API_URL=http://localhost:8787
```

When `VITE_API_URL` is set and the API answers `/api/health`, the app uses
it for AI + persistence and falls back to the local mock otherwise.

## AI director (Gemini → MotionDoc JSON)

The model never writes code — it fills a strict JSON contract
(`src/lib/motion-schema.ts`, 54 knobs: 14 layer types, keyframes with
5 easings, enter/exit envelopes, text fx, colors, timing).

- **Model chain:** `gemini-3.5-flash-lite` → `gemini-flash-lite-latest` →
  `gemini-3.8-flash` (25s timeout each; 2.x models are retired for new
  keys). Override order with `GEMINI_MODEL` (goes first).
- **Structured output:** lean `MOTION_RESPONSE_SCHEMA` (oversized
  schemas get HTTP 400 — keep objects small, no descriptions/bounds).
- **Validation:** strict zod + numeric clamping; one repair retry that
  feeds the schema error back; refine responses are deep-merged over
  the previous version so small notes can't degrade untouched layers.
- **Swap models later:** implement `AiProvider` in a new file and pick
  it via `AI_PROVIDER`. No route changes needed.

## Deploy (when ready — NOT now)

```bash
npx wrangler d1 create slyxup-motion-db   # paste id into wrangler.jsonc
npx wrangler r2 bucket create slyxup-motion-refs
npx wrangler secret put GEMINI_API_KEY
npm run db:migrate:remote
npm run deploy
```
