# SlyxUp Motion — Backend API Plan
**Cloudflare Workers + Durable Objects · Full Route, Controller, Service & Schema Reference**

Date: 2026-10-03  
Version: 1.0  
Status: Blueprint

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Structure](#2-file-structure)
3. [Database Schema](#3-database-schema)
4. [API Routes](#4-api-routes)
5. [Controllers](#5-controllers)
6. [Services](#6-services)
7. [Middleware](#7-middleware)
8. [Durable Object — Chat Agent](#8-durable-object--chat-agent)
9. [Tool Definitions](#9-tool-definitions)
10. [Auth Layer](#10-auth-layer)
11. [Error Handling](#11-error-handling)
12. [Environment Variables & Secrets](#12-environment-variables--secrets)
13. [Implementation Order](#13-implementation-order)

---

## 1. ARCHITECTURE OVERVIEW

```
Browser / Frontend (motion.slyxup.com)
          │
          │  HTTPS
          ▼
┌─────────────────────────────────────────────────────┐
│           OUTER WORKER  (slyxup-motion-api)          │
│  server.ts                                           │
│  • URL routing  (~10ms CPU budget)                  │
│  • CORS headers                                     │
│  • Auth token validation (fast, no DB)              │
│  • Route: /api/*  → REST handlers                   │
│  • Route: /agents/* → Durable Object stub           │
└──────────────┬──────────────────────────────────────┘
               │
       ┌───────┴───────────┐
       │                   │
       ▼                   ▼
┌──────────────┐   ┌────────────────────────────────────┐
│  REST API    │   │  DURABLE OBJECT  (Chat per session) │
│  handlers   │   │  chat.ts                            │
│  (stateless) │   │  • 30s CPU / invocation             │
│              │   │  • SQLite (composition + history)   │
│  Auth        │   │  • streamText loop (AI SDK)         │
│  Projects    │   │  • 11 → 50+ tools                  │
│  Templates   │   │  • Rate limiter                     │
│  Brand Kit   │   │  • Version control                  │
│  Exports     │   │  • Analytics writes                 │
│  Billing     │   └────────────────────────────────────┘
│  Team        │
│  Analytics   │
└──────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│  CLOUDFLARE INFRASTRUCTURE           │
│  D1 Database (users, projects, etc.) │
│  R2 Bucket (assets, exports)        │
│  KV (sessions, rate-limit windows)  │
│  Queues (export jobs, email)        │
└──────────────────────────────────────┘
```

**Key constraints (never violate):**
- Outer Worker: ~10ms CPU — forward only, no transcript parsing
- DO: 30s CPU per invocation, unlimited wall time (I/O is free)
- No `limits` block in `wrangler.jsonc` (Free plan rejects it)
- CORS: allow `https://motion.slyxup.com` only (+ localhost in dev)

---

## 2. FILE STRUCTURE

```
backend/src/
├── server.ts                    # Entry point: URL router + CORS + auth check
├── chat.ts                      # Durable Object: agent loop, tools, SQLite
├── rate-limit.ts                # Per-key pacing, 429 retry logic
│
├── api/                         # REST route handlers (thin controllers)
│   ├── auth.ts                  # /api/auth/* — login, signup, OAuth, sessions
│   ├── projects.ts              # /api/projects/* — CRUD + list
│   ├── compositions.ts          # /api/compositions/* — per-session composition data
│   ├── templates.ts             # /api/templates/* — list, use, save
│   ├── brand-kit.ts             # /api/brand-kit/* — get, upsert
│   ├── exports.ts               # /api/exports/* — list, delete, CDN URL gen
│   ├── billing.ts               # /api/billing/* — plans, Stripe portal
│   ├── team.ts                  # /api/team/* — members, invite, remove
│   ├── analytics.ts             # /api/analytics/* — usage stats for dashboard
│   └── health.ts                # /api/health — liveness probe
│
├── services/                    # Business logic (called by controllers)
│   ├── auth-service.ts          # Token generation, session management, OAuth
│   ├── user-service.ts          # User CRUD, plan checks
│   ├── project-service.ts       # Project CRUD + ownership guard
│   ├── composition-service.ts   # Composition reads (DO owns writes)
│   ├── template-service.ts      # Template library + apply logic
│   ├── brand-kit-service.ts     # Brand profile read/write
│   ├── export-service.ts        # Export record CRUD + R2 URL signing
│   ├── billing-service.ts       # Stripe Checkout session + webhook handler
│   ├── team-service.ts          # Invite email + member management
│   ├── email-service.ts         # Resend / Mailgun integration
│   └── analytics-service.ts    # Write/read composition_analytics table
│
├── middleware/
│   ├── cors.ts                  # CORS preflight + header injection
│   ├── auth-middleware.ts       # JWT verify → ctx.user
│   ├── plan-guard.ts            # Check ctx.user.plan >= required plan
│   ├── rate-limit-api.ts        # Per-user API rate limit (KV-backed)
│   └── request-logger.ts       # Structured JSON logs to Logpush
│
├── db/
│   ├── schema.sql               # D1 DDL — all tables
│   ├── migrations/              # Numbered migration files
│   │   ├── 0001_initial.sql
│   │   ├── 0002_analytics.sql
│   │   └── 0003_team.sql
│   └── queries.ts               # Typed query helpers (no ORM)
│
└── remotion/                    # (existing) tools, validate, store, assets, etc.
    ├── tools.ts
    ├── validate.ts
    ├── store.ts
    ├── assets.ts
    ├── intelligence.ts
    ├── templates.ts
    ├── skills.generated.ts
    └── type.ts
```

---

## 3. DATABASE SCHEMA

### 3.1 D1 — Relational data (users, projects, teams, billing)

```sql
-- ─────────────────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────────────────
CREATE TABLE users (
  id            TEXT PRIMARY KEY,          -- nanoid
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  password_hash TEXT,                      -- null if OAuth only
  plan          TEXT NOT NULL DEFAULT 'free',  -- free | pro | business | enterprise
  plan_expires_at INTEGER,                 -- unix ms, null = active
  stripe_customer_id TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,  -- 0 | 1
  created_at    INTEGER NOT NULL,          -- unix ms
  last_active_at INTEGER
);

-- ─────────────────────────────────────────────────────────
-- OAUTH ACCOUNTS (linked to users)
-- ─────────────────────────────────────────────────────────
CREATE TABLE oauth_accounts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,               -- google | github
  provider_id TEXT NOT NULL,
  UNIQUE (provider, provider_id)
);

-- ─────────────────────────────────────────────────────────
-- SESSIONS
-- ─────────────────────────────────────────────────────────
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,             -- random 32 bytes hex
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT,
  ip         TEXT
);

-- ─────────────────────────────────────────────────────────
-- EMAIL VERIFICATIONS
-- ─────────────────────────────────────────────────────────
CREATE TABLE email_verifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,               -- 6-digit OTP
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────
-- PASSWORD RESETS
-- ─────────────────────────────────────────────────────────
CREATE TABLE password_resets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────
-- PROJECTS (groups of conversations / compositions)
-- ─────────────────────────────────────────────────────────
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id     TEXT REFERENCES teams(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',  -- active | archived
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_projects_team ON projects(team_id);

-- ─────────────────────────────────────────────────────────
-- COMPOSITIONS (metadata only — content lives in DO SQLite)
-- ─────────────────────────────────────────────────────────
CREATE TABLE compositions (
  id            TEXT PRIMARY KEY,           -- = DO session id
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  user_id       TEXT NOT NULL REFERENCES users(id),
  title         TEXT,
  duration_s    REAL,
  fps           INTEGER,
  width         INTEGER,
  height        INTEGER,
  thumbnail_url TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',  -- draft | exported | archived
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_compositions_user    ON compositions(user_id);
CREATE INDEX idx_compositions_project ON compositions(project_id);

-- ─────────────────────────────────────────────────────────
-- EXPORTS
-- ─────────────────────────────────────────────────────────
CREATE TABLE exports (
  id              TEXT PRIMARY KEY,
  composition_id  TEXT NOT NULL REFERENCES compositions(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id),
  preset          TEXT NOT NULL,           -- instagram_story | youtube | mp4_1080p …
  width           INTEGER,
  height          INTEGER,
  fps             INTEGER,
  format          TEXT,                    -- mp4 | webm | gif | png_seq
  r2_key          TEXT,                    -- R2 object key
  cdn_url         TEXT,
  file_size_bytes INTEGER,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | done | failed
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER                  -- null = permanent (Pro+)
);
CREATE INDEX idx_exports_composition ON exports(composition_id);
CREATE INDEX idx_exports_user        ON exports(user_id);

-- ─────────────────────────────────────────────────────────
-- BRAND KITS
-- ─────────────────────────────────────────────────────────
CREATE TABLE brand_kits (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  logo_primary_url TEXT,
  logo_dark_url    TEXT,
  colors           TEXT,                   -- JSON array of hex strings
  font_heading     TEXT,
  font_body        TEXT,
  guidelines_url   TEXT,
  updated_at       INTEGER NOT NULL
);

-- ─────────────────────────────────────────────────────────
-- TEMPLATES
-- ─────────────────────────────────────────────────────────
CREATE TABLE templates (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,              -- product | social | logo | explainer | event | branding
  thumbnail_url TEXT,
  preview_url  TEXT,
  duration_s   REAL,
  plan_required TEXT NOT NULL DEFAULT 'free',  -- free | pro | business
  is_system    INTEGER NOT NULL DEFAULT 1,     -- 1 = built-in, 0 = user-saved
  created_by   TEXT REFERENCES users(id),
  composition_snapshot TEXT,              -- JSON composition code snapshot
  created_at   INTEGER NOT NULL
);

-- ─────────────────────────────────────────────────────────
-- TEAMS
-- ─────────────────────────────────────────────────────────
CREATE TABLE teams (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  plan       TEXT NOT NULL DEFAULT 'pro',
  seat_limit INTEGER NOT NULL DEFAULT 3,
  created_at INTEGER NOT NULL
);

CREATE TABLE team_members (
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'editor',  -- editor | viewer
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE team_invites (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'editor',
  token      TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  accepted   INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────
-- API KEYS (Business plan)
-- ─────────────────────────────────────────────────────────
CREATE TABLE api_keys (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash    TEXT NOT NULL UNIQUE,        -- sha256 of key; plaintext shown once
  name        TEXT,
  last_used_at INTEGER,
  created_at  INTEGER NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────
-- COMPOSITION ANALYTICS
-- ─────────────────────────────────────────────────────────
CREATE TABLE composition_analytics (
  id                    TEXT PRIMARY KEY,
  composition_id        TEXT REFERENCES compositions(id),
  user_id               TEXT REFERENCES users(id),
  session_id            TEXT,
  brief                 TEXT,
  intent_category       TEXT,
  created_at            INTEGER NOT NULL,
  total_time_ms         INTEGER,
  model_calls           INTEGER,
  tool_calls            INTEGER,
  errors_count          INTEGER,
  retries_count         INTEGER,
  motion_score          INTEGER,           -- 0-100
  perf_score            INTEGER,           -- 0-100
  a11y_score            INTEGER,           -- 0-100
  user_rating           INTEGER,           -- 1-5
  user_edited           INTEGER,           -- 0|1
  exported              INTEGER,           -- 0|1
  export_format         TEXT,
  template_id           TEXT,
  customization_level   TEXT               -- none | light | heavy
);
CREATE INDEX idx_analytics_user ON composition_analytics(user_id);
```

### 3.2 KV Namespaces

| Namespace | Key pattern | Value | TTL |
|---|---|---|---|
| `SESSIONS_KV` | `sess:{token}` | `{ userId, expiresAt }` | 7 days |
| `RATE_LIMIT_KV` | `rl:api:{userId}:{minute}` | request count | 60s |
| `RATE_LIMIT_KV` | `rl:model:{teamId}:{minute}` | model call count | 60s |
| `ASSET_CACHE_KV` | `asset:{queryHash}` | JSON results | 5 min |
| `SKILL_CACHE_KV` | `skill:{skillId}` | skill content | 1 hour |

### 3.3 R2 Buckets

| Bucket | Path pattern | Description |
|---|---|---|
| `motion-assets` | `uploads/{userId}/{uuid}.{ext}` | User-uploaded logos, images |
| `motion-exports` | `exports/{userId}/{compositionId}/{preset}.{ext}` | Rendered exports |
| `motion-thumbnails` | `thumbs/{compositionId}.jpg` | Auto-generated thumbnails |

---

## 4. API ROUTES

### 4.1 Auth — `/api/auth`

| Method | Path | Auth? | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | No | Email + password signup |
| POST | `/api/auth/login` | No | Email + password login |
| POST | `/api/auth/logout` | Yes | Revoke session |
| GET  | `/api/auth/me` | Yes | Current user profile |
| POST | `/api/auth/verify-email` | No | Submit OTP code |
| POST | `/api/auth/resend-verification` | No | Resend OTP |
| POST | `/api/auth/forgot-password` | No | Send reset email |
| POST | `/api/auth/reset-password` | No | Set new password via token |
| GET  | `/api/auth/google` | No | Redirect to Google OAuth |
| GET  | `/api/auth/google/callback` | No | OAuth callback, set session |
| GET  | `/api/auth/github` | No | Redirect to GitHub OAuth |
| GET  | `/api/auth/github/callback` | No | OAuth callback, set session |
| GET  | `/api/auth/sessions` | Yes | List active sessions |
| DELETE | `/api/auth/sessions/:id` | Yes | Revoke specific session |

### 4.2 Projects — `/api/projects`

| Method | Path | Auth? | Plan | Description |
|---|---|---|---|---|
| GET    | `/api/projects` | Yes | Any | List user's projects (+ team projects) |
| POST   | `/api/projects` | Yes | Any | Create project |
| GET    | `/api/projects/:id` | Yes | Any | Get project (+ compositions list) |
| PATCH  | `/api/projects/:id` | Yes | Any | Update name/description/status |
| DELETE | `/api/projects/:id` | Yes | Any | Delete project (and compositions) |

### 4.3 Compositions — `/api/compositions`

| Method | Path | Auth? | Description |
|---|---|---|---|
| GET    | `/api/compositions` | Yes | List all user compositions (paginated) |
| GET    | `/api/compositions/:id` | Yes | Get metadata |
| PATCH  | `/api/compositions/:id` | Yes | Update title, project assignment, status |
| DELETE | `/api/compositions/:id` | Yes | Delete metadata record (DO remains until evicted) |
| POST   | `/api/compositions/:id/rating` | Yes | Submit 1-5 star rating |

> Note: Composition *content* (code, history, versions) lives inside the DO and is accessed via WebSocket at `/agents/chat/:id`. These endpoints are metadata only.

### 4.4 Templates — `/api/templates`

| Method | Path | Auth? | Plan | Description |
|---|---|---|---|---|
| GET    | `/api/templates` | No | — | List all templates (plan field indicates required) |
| GET    | `/api/templates/:id` | No | — | Get template detail |
| POST   | `/api/templates` | Yes | Pro | Save composition as user template |
| DELETE | `/api/templates/:id` | Yes | Pro | Delete user template |

### 4.5 Brand Kit — `/api/brand-kit`

| Method | Path | Auth? | Plan | Description |
|---|---|---|---|---|
| GET  | `/api/brand-kit` | Yes | Pro | Get user's brand kit |
| PUT  | `/api/brand-kit` | Yes | Pro | Upsert brand kit |
| POST | `/api/brand-kit/upload` | Yes | Pro | Upload logo to R2 (multipart) |

### 4.6 Exports — `/api/exports`

| Method | Path | Auth? | Description |
|---|---|---|---|
| GET    | `/api/exports` | Yes | List all exports (paginated) |
| GET    | `/api/exports/:id` | Yes | Get export detail + signed CDN URL |
| DELETE | `/api/exports/:id` | Yes | Delete export record + R2 object |
| POST   | `/api/exports/:id/share` | Yes | Generate short share URL |

### 4.7 Billing — `/api/billing`

| Method | Path | Auth? | Description |
|---|---|---|---|
| GET    | `/api/billing/plan` | Yes | Current plan + usage this month |
| POST   | `/api/billing/checkout` | Yes | Create Stripe Checkout session |
| POST   | `/api/billing/portal` | Yes | Create Stripe Customer Portal session |
| POST   | `/api/billing/webhook` | No (Stripe sig) | Stripe webhook handler |

### 4.8 Team — `/api/team`

| Method | Path | Auth? | Plan | Description |
|---|---|---|---|---|
| GET    | `/api/team` | Yes | Pro | Get team + members |
| POST   | `/api/team/invite` | Yes | Pro | Invite member by email |
| DELETE | `/api/team/members/:userId` | Yes | Pro | Remove member |
| PATCH  | `/api/team/members/:userId` | Yes | Pro | Change role |
| GET    | `/api/team/invite/accept` | No | — | Accept invite via token (redirect) |

### 4.9 API Keys — `/api/keys`

| Method | Path | Auth? | Plan | Description |
|---|---|---|---|---|
| GET    | `/api/keys` | Yes | Business | List API keys |
| POST   | `/api/keys` | Yes | Business | Create new key (returns plaintext once) |
| DELETE | `/api/keys/:id` | Yes | Business | Revoke key |

### 4.10 Analytics — `/api/analytics`

| Method | Path | Auth? | Description |
|---|---|---|---|
| GET | `/api/analytics/usage` | Yes | Compositions/exports used this month vs quota |
| GET | `/api/analytics/history` | Yes | Per-composition analytics rows |

### 4.11 Assets — `/api/assets`

| Method | Path | Auth? | Description |
|---|---|---|---|
| POST | `/api/assets/upload` | Yes | Upload file to R2 (returns URL) |
| GET  | `/api/assets/:key/url` | Yes | Get signed R2 URL (1h expiry) |

### 4.12 Health

| Method | Path | Auth? | Description |
|---|---|---|---|
| GET | `/api/health` | No | Returns `{ ok: true, ts }` |

### 4.13 Agent WebSocket — `/agents`

Handled by `routeAgentRequest` from `agents-sdk`. The outer Worker forwards all `/agents/*` traffic directly to the DO without touching it.

| Path | Description |
|---|---|
| `GET /agents/chat/:sessionId` | Upgrade to WebSocket → Chat DO |
| `POST /agents/chat/:sessionId` | HTTP fallback for environments without WS |

---

## 5. CONTROLLERS

Controllers are thin functions — validate request, call service, return response. No business logic here.

### 5.1 Auth Controller (`api/auth.ts`)

```typescript
export async function handleSignup(req: Request, env: Env): Promise<Response> {
  const { email, password, name } = await req.json();
  // 1. Validate inputs (email format, password min 8)
  // 2. Call authService.signup(email, password, name)
  // 3. Return { user, sessionToken } or error
}

export async function handleLogin(req: Request, env: Env): Promise<Response> {
  const { email, password } = await req.json();
  // 1. Call authService.login(email, password)
  // 2. Set session cookie + return { user }
}

export async function handleMe(req: Request, ctx: AppContext): Promise<Response> {
  // ctx.user is populated by auth middleware
  return json(ctx.user);
}

export async function handleVerifyEmail(req: Request, env: Env): Promise<Response> {
  const { userId, code } = await req.json();
  // Call authService.verifyEmail(userId, code)
}

export async function handleForgotPassword(req: Request, env: Env): Promise<Response> {
  const { email } = await req.json();
  // Call authService.sendPasswordReset(email)
  // Always return 200 (don't leak email existence)
}

export async function handleGoogleCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  // 1. Exchange code for tokens with Google
  // 2. Find or create user
  // 3. Create session, redirect to /studio
}
```

### 5.2 Projects Controller (`api/projects.ts`)

```typescript
export async function listProjects(req: Request, ctx: AppContext): Promise<Response> {
  const projects = await projectService.list(ctx.user.id, ctx.env);
  return json(projects);
}

export async function createProject(req: Request, ctx: AppContext): Promise<Response> {
  const body = await req.json();
  await checkLimit(ctx, "projects"); // throws 403 if free user at limit
  const project = await projectService.create(ctx.user.id, body, ctx.env);
  return json(project, 201);
}

export async function deleteProject(req: Request, ctx: AppContext, id: string): Promise<Response> {
  await projectService.assertOwner(ctx.user.id, id, ctx.env); // throws 403 if not owner
  await projectService.delete(id, ctx.env);
  return json({ ok: true });
}
```

### 5.3 Billing Controller (`api/billing.ts`)

```typescript
export async function createCheckout(req: Request, ctx: AppContext): Promise<Response> {
  const { plan } = await req.json(); // "pro" | "business"
  const session = await billingService.createCheckoutSession(ctx.user, plan, ctx.env);
  return json({ url: session.url });
}

export async function handleWebhook(req: Request, env: Env): Promise<Response> {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  await billingService.handleStripeWebhook(body, sig, env);
  return json({ ok: true });
}
```

### 5.4 Analytics Controller (`api/analytics.ts`)

```typescript
export async function getUsage(req: Request, ctx: AppContext): Promise<Response> {
  const usage = await analyticsService.getMonthlyUsage(ctx.user.id, ctx.env);
  // { compositions: { used: 3, limit: 5 }, exports: { used: 2, limit: 5 } }
  return json(usage);
}
```

---

## 6. SERVICES

### 6.1 Auth Service (`services/auth-service.ts`)

```typescript
// Responsibilities:
// - Password hashing (bcrypt-equivalent via WebCrypto PBKDF2)
// - JWT-free session tokens (random 32-byte hex stored in KV + D1)
// - OAuth token exchange (Google, GitHub)
// - OTP generation + email dispatch
// - Password reset token generation + email dispatch

async function signup(email: string, password: string, name: string, env: Env): Promise<{ user: User; token: string }>

async function login(email: string, password: string, env: Env): Promise<{ user: User; token: string }>

async function createSession(userId: string, env: Env, meta?: { ip?: string; ua?: string }): Promise<string>

async function validateSession(token: string, env: Env): Promise<User | null>

async function revokeSession(token: string, env: Env): Promise<void>

async function sendVerificationEmail(userId: string, email: string, env: Env): Promise<void>

async function verifyEmail(userId: string, code: string, env: Env): Promise<boolean>

async function sendPasswordReset(email: string, env: Env): Promise<void>

async function resetPassword(token: string, newPassword: string, env: Env): Promise<boolean>

async function getOrCreateOAuthUser(provider: string, providerId: string, email: string, name: string, env: Env): Promise<{ user: User; token: string }>
```

**Session strategy:**
- Token = 32 random bytes as hex (256-bit entropy, no JWT)
- Stored in `sessions` D1 table + mirrored to `SESSIONS_KV` for fast validation (outer Worker checks KV without hitting D1)
- 7-day expiry, rolling (refreshed on every request)
- KV entry expires at same time

### 6.2 User Service (`services/user-service.ts`)

```typescript
async function getById(id: string, env: Env): Promise<User | null>
async function getByEmail(email: string, env: Env): Promise<User | null>
async function update(id: string, fields: Partial<User>, env: Env): Promise<User>
async function delete(id: string, env: Env): Promise<void>
async function getPlan(userId: string, env: Env): Promise<Plan>

// Plan limits
const PLAN_LIMITS = {
  free:     { compositions: 5,  exports: 5,  seats: 1,  resolution: 720  },
  pro:      { compositions: -1, exports: -1, seats: 3,  resolution: 2160 },
  business: { compositions: -1, exports: -1, seats: 10, resolution: 2160 },
};
```

### 6.3 Project Service (`services/project-service.ts`)

```typescript
async function list(userId: string, env: Env): Promise<Project[]>
  // Returns owned projects UNION team projects (if member)

async function create(userId: string, data: NewProject, env: Env): Promise<Project>

async function getById(id: string, env: Env): Promise<Project | null>

async function update(id: string, fields: Partial<Project>, env: Env): Promise<Project>

async function delete(id: string, env: Env): Promise<void>
  // Cascades: marks all compositions as archived (not hard-deleted — DO data preserved)

async function assertOwner(userId: string, projectId: string, env: Env): Promise<void>
  // Throws ApiError(403) if not owner or team member with edit rights
```

### 6.4 Composition Service (`services/composition-service.ts`)

```typescript
// This service manages D1 metadata only.
// Actual composition content is owned by the DO.

async function upsertMetadata(id: string, data: CompositionMeta, env: Env): Promise<void>
  // Called by DO after each successful write_composition tool call

async function list(userId: string, filters: ListFilters, env: Env): Promise<CompositionMeta[]>

async function getMetadata(id: string, env: Env): Promise<CompositionMeta | null>

async function submitRating(compositionId: string, userId: string, rating: number, env: Env): Promise<void>
  // Updates composition_analytics.user_rating
```

### 6.5 Template Service (`services/template-service.ts`)

```typescript
async function listAll(env: Env): Promise<Template[]>
  // System templates + user-saved templates for this user

async function getById(id: string, env: Env): Promise<Template | null>

async function saveFromComposition(userId: string, compositionId: string, meta: TemplateMeta, env: Env): Promise<Template>
  // Requires Pro plan; reads composition snapshot from DO and stores in D1

async function deleteUserTemplate(userId: string, templateId: string, env: Env): Promise<void>
```

### 6.6 Export Service (`services/export-service.ts`)

```typescript
async function list(userId: string, env: Env): Promise<Export[]>

async function create(data: NewExport, env: Env): Promise<Export>
  // Called after render is complete; receives R2 key

async function getSignedUrl(exportId: string, userId: string, env: Env): Promise<string>
  // R2 presigned URL, 1 hour expiry (Free) or permanent CDN URL (Pro+)

async function delete(exportId: string, userId: string, env: Env): Promise<void>
  // Deletes D1 record + R2 object

async function generateShareUrl(exportId: string, env: Env): Promise<string>
  // Stores in KV with share token, returns https://motion.slyxup.com/v/{token}
```

### 6.7 Billing Service (`services/billing-service.ts`)

```typescript
async function createCheckoutSession(user: User, plan: "pro" | "business", env: Env): Promise<{ url: string }>
  // Creates Stripe Checkout session, success_url = /billing?success=true

async function createPortalSession(user: User, env: Env): Promise<{ url: string }>
  // Stripe Customer Portal for subscription management

async function handleStripeWebhook(body: string, sig: string, env: Env): Promise<void>
  // Events to handle:
  //   checkout.session.completed → update user.plan, user.stripe_customer_id
  //   customer.subscription.deleted → downgrade to free
  //   customer.subscription.updated → update plan
  //   invoice.payment_failed → send email warning
```

### 6.8 Email Service (`services/email-service.ts`)

```typescript
// Provider: Resend (resend.com) — simple fetch, no SDK needed in Workers

async function sendVerificationCode(to: string, code: string, env: Env): Promise<void>

async function sendPasswordReset(to: string, resetUrl: string, env: Env): Promise<void>

async function sendTeamInvite(to: string, inviterName: string, teamName: string, acceptUrl: string, env: Env): Promise<void>

async function sendPaymentFailed(to: string, env: Env): Promise<void>

// All emails use React Email templates rendered server-side
// Base template: dark bg #0E0F13, amber accent #FFB340
```

### 6.9 Team Service (`services/team-service.ts`)

```typescript
async function getTeamForUser(userId: string, env: Env): Promise<Team | null>

async function invite(ownerId: string, email: string, role: "editor" | "viewer", env: Env): Promise<void>
  // Creates team_invites row + sends email
  // Validates: seat limit not exceeded, email not already member

async function acceptInvite(token: string, env: Env): Promise<{ redirectUrl: string }>
  // Marks invite accepted, creates team_members row, returns redirect

async function removeMember(ownerId: string, targetUserId: string, env: Env): Promise<void>

async function updateRole(ownerId: string, targetUserId: string, role: string, env: Env): Promise<void>
```

### 6.10 Analytics Service (`services/analytics-service.ts`)

```typescript
async function writeRow(data: AnalyticsRow, env: Env): Promise<void>
  // Upsert into composition_analytics; called by DO at end of each turn

async function getMonthlyUsage(userId: string, env: Env): Promise<UsageSummary>
  // COUNT compositions created this calendar month vs plan limit
  // COUNT exports this month vs plan limit

async function getHistory(userId: string, limit: number, offset: number, env: Env): Promise<AnalyticsRow[]>
```

---

## 7. MIDDLEWARE

### 7.1 CORS (`middleware/cors.ts`)

```typescript
const ALLOWED_ORIGINS = [
  "https://motion.slyxup.com",
  "http://localhost:5173",  // dev only
];

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.includes(origin ?? "") ? origin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export function handlePreflight(req: Request, origin: string | null): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
```

### 7.2 Auth Middleware (`middleware/auth-middleware.ts`)

```typescript
export async function requireAuth(
  req: Request,
  env: Env,
  ctx: AppContext
): Promise<Response | null> {
  // 1. Extract token from:
  //    a. Cookie: session={token}
  //    b. Header: Authorization: Bearer {token}
  //    c. Header: X-API-Key: sk_live_{key} (Business plan only)
  // 2. Validate via KV (fast path) or D1 (fallback)
  // 3. Attach ctx.user
  // 4. Return 401 if invalid/expired
  // 5. Return null to continue
}
```

### 7.3 Plan Guard (`middleware/plan-guard.ts`)

```typescript
export function requirePlan(minPlan: "pro" | "business") {
  return async (req: Request, ctx: AppContext): Promise<Response | null> => {
    const order = { free: 0, pro: 1, business: 2, enterprise: 3 };
    if (order[ctx.user.plan] < order[minPlan]) {
      return json({ error: "upgrade_required", required: minPlan }, 403);
    }
    return null;
  };
}
```

### 7.4 API Rate Limiter (`middleware/rate-limit-api.ts`)

```typescript
// Per-user: max 120 REST API requests per minute
// Stored in KV: rl:api:{userId}:{minuteTimestamp}

export async function apiRateLimit(
  userId: string,
  env: Env
): Promise<Response | null> {
  const key = `rl:api:${userId}:${Math.floor(Date.now() / 60000)}`;
  const count = parseInt(await env.RATE_LIMIT_KV.get(key) ?? "0");
  if (count >= 120) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }
  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 60 });
  return null;
}
```

### 7.5 Request Router (`server.ts` — main router)

```typescript
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");

    // 1. CORS preflight
    const preflight = handlePreflight(req, origin);
    if (preflight) return preflight;

    // 2. Agent traffic → DO (no auth here, DO handles its own)
    if (url.pathname.startsWith("/agents/")) {
      return routeAgentRequest(req, env, { cors: true });
    }

    // 3. REST API
    if (url.pathname.startsWith("/api/")) {
      const appCtx: AppContext = { env, user: null! };

      // Auth check (skip for public routes)
      const publicRoutes = ["/api/health", "/api/auth/", "/api/templates"];
      const needsAuth = !publicRoutes.some(p => url.pathname.startsWith(p));
      if (needsAuth) {
        const authResp = await requireAuth(req, env, appCtx);
        if (authResp) return withCors(authResp, origin);
      }

      const resp = await routeApiRequest(req, appCtx, url);
      return withCors(resp, origin);
    }

    return new Response("Not Found", { status: 404 });
  },
};
```

---

## 8. DURABLE OBJECT — CHAT AGENT

The DO is the heart of the product. It lives in `chat.ts` and owns:
- The WebSocket connection to the browser
- The entire conversation history (SQLite)
- The composition code + version history (SQLite via `store.ts`)
- The AI agent loop (`streamText`)
- All tool executions

### 8.1 DO SQLite Tables (per-DO, not D1)

```sql
-- Managed by agents-sdk
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  role TEXT,      -- user | assistant | tool
  content TEXT,
  created_at INTEGER
);

-- Managed by store.ts
CREATE TABLE composition (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  canvas  TEXT NOT NULL,   -- JSON: { width, height, fps, durationInFrames }
  code    TEXT NOT NULL,   -- current TSX source
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE versions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL,
  canvas     TEXT NOT NULL,
  tag        TEXT,         -- optional semver / label
  created_at INTEGER NOT NULL
);

CREATE TABLE plan (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  beats    TEXT NOT NULL  -- JSON: MotionPlan beats array
);

CREATE TABLE blackboard (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE prefs (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### 8.2 DO Lifecycle

```
1. Browser connects via WebSocket to /agents/chat/{sessionId}
2. agents-sdk routes to Chat DO instance (one per sessionId)
3. onChatMessage fires for each user message
4. Chat.ts dispatches to streamText with tool registry
5. Tool results stream back to browser
6. On composition write → DO calls REST /api/compositions/:id
   to sync metadata to D1 (fire-and-forget via ctx.waitUntil)
7. On turn end → DO calls /api/analytics to write row
```

### 8.3 Analytics Sync from DO

```typescript
// In chat.ts, after streamText resolves:
ctx.waitUntil(
  fetch(`${env.WORKER_SELF_URL}/api/compositions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.INTERNAL_SECRET}` },
    body: JSON.stringify({ title, duration_s, fps, width, height, updated_at }),
  })
);

ctx.waitUntil(
  fetch(`${env.WORKER_SELF_URL}/api/analytics/internal`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.INTERNAL_SECRET}` },
    body: JSON.stringify(analyticsRow),
  })
);
```

---

## 9. TOOL DEFINITIONS

All tools live in `remotion/tools.ts` and sub-files. Full registry:

### Phase 1 (implemented / to implement now)

| Tool | File | Purpose |
|---|---|---|
| `get_canvas` | tools.ts | Dimensions, fps, frame budget |
| `load_skill` | tools.ts | One of 31 Remotion docs |
| `plan_motion` | tools.ts | Record beat sheet |
| `read_file` | tools.ts | Current source |
| `write_composition` | tools.ts | Full file write (validated) |
| `edit_file` | tools.ts | Exact-string patch |
| `validate_composition` | tools.ts | Syntax + semantic errors |
| `preview_comotion` | tools.ts | Publish to player |
| `review_motion` | tools.ts | Motion critique |
| `list_versions` | tools.ts | Version history |
| `restore_version` | tools.ts | Roll back |
| `pre_validate_plan` | tools.ts | Plan feasibility check |
| `constraint_solve` | tools.ts | Timing/frame solver |
| `dependency_resolve` | tools.ts | Import scope validator |
| `auto_fix_code` | tools.ts | Targeted repair + re-validate |
| `asset_search` | assets.ts | Unsplash/Pexels fetch |
| `asset_optimize` | assets.ts | Resize + WebP |
| `font_suggest` | assets.ts | Google Fonts pairing |

### Phase 2 (intelligence layer)

| Tool | File | Purpose |
|---|---|---|
| `intent_deep_analyze` | intelligence.ts | Multi-pass intent extraction |
| `intent_questionnaire` | intelligence.ts | Gap-only quick picks |
| `decision_make` | intelligence.ts | Weighted option scorer |
| `preference_apply` | intelligence.ts | Past-choice lookup |
| `brand_learn` | intelligence.ts | Extract + save brand profile |
| `design_analyze` | intelligence.ts | 0-100 motion score |
| `performance_profile` | intelligence.ts | Frame-time estimator |
| `accessibility_audit` | intelligence.ts | WCAG + flash check |
| `template_list` | templates.ts | Available templates |
| `template_apply_intelligent` | templates.ts | Apply + customise |

### Phase 3 (multi-agent, execute_batch)

| Tool | File | Purpose |
|---|---|---|
| `execute_batch` | tools.ts | Group parallel ops |
| `blackboard_get` | tools.ts | Read shared agent state |
| `blackboard_set` | tools.ts | Write shared agent state |
| `version_tag` | tools.ts | Semver label a version |

### Phase 4 (advanced capabilities)

All tools from `content.ts`, `export.ts`, `collab.ts`, `motion3d.ts` — see `IMPLEMENTATION_PLAN.md §2.4-2.6`.

---

## 10. AUTH LAYER

### 10.1 Session Flow

```
Signup/Login:
  Client → POST /api/auth/signup
  Server → hash password (PBKDF2, 100k iterations, SHA-256)
         → insert users row
         → generate 32-byte random token
         → insert sessions row in D1
         → put { userId, expiresAt } in SESSIONS_KV (TTL 7d)
         → Set-Cookie: session={token}; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
         → return { user }

Request auth check (outer Worker):
  1. Read cookie or Authorization header
  2. KV.get("sess:{token}") → if hit, has userId + expiry (fast, ~1ms)
  3. If KV miss, fall back to D1 sessions query
  4. If expired or not found → 401
  5. Attach user to context (full user row fetched from D1 once per request)

Rolling refresh:
  On every authenticated request:
    KV.put("sess:{token}", ..., { expirationTtl: 604800 })  — resets TTL
    (D1 expires_at updated async via ctx.waitUntil)
```

### 10.2 OAuth Flow (Google example)

```
1. Browser: GET /api/auth/google
   → Server redirects to:
     https://accounts.google.com/o/oauth2/auth
       ?client_id={GOOGLE_CLIENT_ID}
       &redirect_uri={WORKER_URL}/api/auth/google/callback
       &scope=openid email profile
       &state={random_32hex}  ← stored in KV for CSRF check

2. Google redirects to /api/auth/google/callback?code=…&state=…
3. Server: verify state, exchange code for tokens
4. Fetch Google user info
5. Look up oauth_accounts by (google, googleUserId)
   - Found → get linked user
   - Not found → create user, create oauth_accounts row
6. Create session, set cookie, redirect to /studio
```

### 10.3 API Key Auth (Business)

```
Header: X-API-Key: sk_live_{random_40hex}

Server:
  1. Strip "sk_live_" prefix
  2. sha256(key) → look up api_keys.key_hash
  3. Check revoked = 0
  4. Update last_used_at
  5. Load user from api_keys.user_id
  6. Attach to context (same as session auth)
```

---

## 11. ERROR HANDLING

### 11.1 ApiError class

```typescript
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,      // machine-readable, e.g. "email_taken"
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

// Caught in the router, serialised as:
// { "error": "email_taken", "message": "This email is already registered." }
// HTTP status = ApiError.status
```

### 11.2 Error Codes

| Code | Status | Meaning |
|---|---|---|
| `invalid_request` | 400 | Malformed body / missing fields |
| `email_taken` | 409 | Signup with existing email |
| `invalid_credentials` | 401 | Wrong email / password |
| `session_expired` | 401 | Token expired or not found |
| `not_found` | 404 | Resource not found |
| `forbidden` | 403 | Not owner / insufficient permissions |
| `upgrade_required` | 403 | Plan too low for this action |
| `quota_exceeded` | 429 | Monthly composition / export limit hit |
| `rate_limited` | 429 | Too many API requests |
| `invalid_otp` | 400 | Wrong or expired verification code |
| `stripe_error` | 502 | Stripe API failure |
| `internal` | 500 | Unexpected server error |

### 11.3 DO Error Handling

The DO uses `try/catch` around `streamText`. On any unhandled error:
- Sends `{ type: "error", message: "…" }` over WebSocket
- Logs to `console.error` (appears in Cloudflare Workers logs)
- Does NOT crash the DO — next message can still be processed

---

## 12. ENVIRONMENT VARIABLES & SECRETS

### `wrangler.jsonc` bindings (non-secret)

```jsonc
{
  "d1_databases": [{ "binding": "DB", "database_name": "motion-db" }],
  "kv_namespaces": [
    { "binding": "SESSIONS_KV",   "id": "..." },
    { "binding": "RATE_LIMIT_KV", "id": "..." },
    { "binding": "ASSET_CACHE_KV","id": "..." }
  ],
  "r2_buckets": [
    { "binding": "ASSETS_BUCKET",  "bucket_name": "motion-assets" },
    { "binding": "EXPORTS_BUCKET", "bucket_name": "motion-exports" }
  ]
}
```

### `.dev.vars` (local secrets) / `wrangler secret put` (production)

| Variable | Description |
|---|---|
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key |
| `INTERNAL_SECRET` | DO → REST API internal calls |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature secret |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret |
| `RESEND_API_KEY` | Resend email API key |
| `WORKER_SELF_URL` | Full Worker URL (for DO→REST calls) |

---

## 13. IMPLEMENTATION ORDER

### Sprint 1 — Foundation (Week 1)
- [ ] `db/schema.sql` — create all D1 tables
- [ ] `db/queries.ts` — typed query helpers
- [ ] `middleware/cors.ts` — CORS + preflight
- [ ] `middleware/auth-middleware.ts` — token validation (KV fast path)
- [ ] `services/auth-service.ts` — signup, login, sessions
- [ ] `api/auth.ts` — signup, login, logout, /me
- [ ] `api/health.ts` — liveness probe
- [ ] `server.ts` — main router wired up
- [ ] D1 migration scripts

### Sprint 2 — Core Data (Week 2)
- [ ] `services/user-service.ts`
- [ ] `services/project-service.ts`
- [ ] `services/composition-service.ts` (metadata sync from DO)
- [ ] `api/projects.ts`, `api/compositions.ts`
- [ ] `middleware/plan-guard.ts` + quota check in project create
- [ ] `middleware/rate-limit-api.ts`
- [ ] DO → D1 metadata sync via `ctx.waitUntil`

### Sprint 3 — Auth Flows (Week 2-3)
- [ ] `services/email-service.ts` (Resend)
- [ ] Email verification OTP flow
- [ ] Password reset flow
- [ ] OAuth: Google + GitHub callbacks
- [ ] `api/auth.ts` — all remaining endpoints
- [ ] `api/keys.ts` — API key CRUD (Business plan)

### Sprint 4 — Product Features (Week 3-4)
- [ ] `services/template-service.ts` + `api/templates.ts`
- [ ] `services/brand-kit-service.ts` + `api/brand-kit.ts`
- [ ] Asset upload endpoint + R2 put
- [ ] `services/export-service.ts` + `api/exports.ts`
- [ ] `services/analytics-service.ts` + `api/analytics.ts`

### Sprint 5 — Billing & Team (Week 4-5)
- [ ] Stripe setup: products, prices, webhook
- [ ] `services/billing-service.ts` + `api/billing.ts`
- [ ] `services/team-service.ts` + `api/team.ts`
- [ ] Team invite email flow

### Sprint 6 — Hardening (Week 5-6)
- [ ] Input validation on all endpoints (zod schemas)
- [ ] ApiError consistent error format everywhere
- [ ] Request logging middleware
- [ ] D1 migration system (`wrangler d1 migrations apply`)
- [ ] Integration tests (Vitest + Miniflare)
- [ ] Load test: 10 concurrent WS connections to DO

---
