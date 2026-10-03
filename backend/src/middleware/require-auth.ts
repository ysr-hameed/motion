import { ApiError } from "../lib/api-error";
import {
  billingFor,
  getStackSession,
  projectId,
  type StackEnv,
  type StackSession,
} from "../lib/stack-auth";

export interface AppContext {
  env: Env & StackEnv & { DB?: D1Database };
  session: StackSession;
  /** Present when authenticated via X-API-Key instead of a Stack session. */
  apiKeyTier?: Tier;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fallback auth for Business API keys (`X-API-Key: sk_live_…`). */
async function tryApiKey(
  req: Request,
  env: Env & StackEnv & { DB?: D1Database },
): Promise<AppContext | null> {
  const header = req.headers.get("x-api-key");
  if (!header?.startsWith("sk_live_") || !env.DB) return null;
  const hash = await sha256Hex(header);
  const row = await env.DB.prepare(
    `SELECT k.id, k.user_id, k.tier_snapshot, u.email FROM api_keys k
     JOIN users u ON u.id = k.user_id
     WHERE k.key_hash = ? AND k.revoked = 0`,
  )
    .bind(hash)
    .first<{ id: string; user_id: string; tier_snapshot: string; email: string }>();
  if (!row) return null;
  await env.DB.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`)
    .bind(Date.now(), row.id)
    .run()
    .catch(() => undefined);
  const tier: Tier = row.tier_snapshot === "business" || row.tier_snapshot === "pro" ? row.tier_snapshot : "free";
  return {
    env: env as AppContext["env"],
    session: {
      user: { id: row.user_id, email: row.email },
      session: { id: row.id, expiresAt: "" },
      token: "",
    },
    apiKeyTier: tier,
  };
}

/**
 * Validate the Stack session and attach it to the context.
 * Returns a 401 Response when the request is unauthenticated, else null.
 */
export async function requireAuth(
  req: Request,
  env: Env & StackEnv,
): Promise<{ ctx: AppContext } | { response: Response }> {
  let session: StackSession | null;
  try {
    session = await getStackSession(req, env);
  } catch (err) {
    console.error(JSON.stringify({ msg: "auth-service-error", err: String(err) }));
    return {
      response: Response.json(
        { error: "internal", message: "Authentication service unavailable." },
        { status: 503 },
      ),
    };
  }
  if (!session) {
    const keyCtx = await tryApiKey(req, env).catch(() => null);
    if (keyCtx) return { ctx: keyCtx };
    return {
      response: Response.json(
        { error: "session_expired", message: "Sign in to continue." },
        { status: 401 },
      ),
    };
  }
  return { ctx: { env: env as AppContext["env"], session } };
}

export type Tier = "free" | "pro" | "business";

const TIER_ORDER: Record<Tier, number> = { free: 0, pro: 1, business: 2 };

/**
 * Derive the caller's tier from live Stack entitlements. The endpoint only
 * grants features for active/trialing subscriptions, so any non-empty feature
 * set means paid. Business is recognised by a dedicated feature flag or plan
 * id containing "business" — adjust once the real Paddle-mapped plans exist.
 */
export async function getTier(ctx: AppContext): Promise<Tier> {
  // API-key calls carry the tier snapshotted at key creation (no user token
  // to re-check live entitlements with); it refreshes on session-authed use.
  if (!ctx.session.token && ctx.apiKeyTier) return ctx.apiKeyTier;
  try {
    const billing = billingFor(ctx.env, ctx.session.token);
    const ent = await billing.getEntitlements(projectId(ctx.env));
    if (ent.status !== "active" && ent.status !== "trialing") return "free";
    if (ent.features.length === 0) return "free";
    const blob = `${ent.planId ?? ""} ${ent.features.join(" ")}`.toLowerCase();
    if (blob.includes("business") || ent.features.includes("teams")) {
      return "business";
    }
    return "pro";
  } catch (err) {
    console.error(JSON.stringify({ msg: "entitlements-error", err: String(err) }));
    return "free";
  }
}

export async function requirePlan(
  ctx: AppContext,
  min: Exclude<Tier, "free">,
): Promise<Response | null> {
  const tier = await getTier(ctx);
  if (TIER_ORDER[tier] < TIER_ORDER[min]) {
    return Response.json(
      {
        error: "upgrade_required",
        message: `This requires the ${min} plan.`,
        required: min,
        current: tier,
      },
      { status: 403 },
    );
  }
  return null;
}

export async function assertOwnerOrThrow(
  ownerId: string,
  callerId: string,
): Promise<void> {
  if (ownerId !== callerId) {
    throw new ApiError(403, "forbidden", "You do not own this resource.");
  }
}
