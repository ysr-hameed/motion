import { createBillingClient, SlyxupClient } from "@slyxup/core";
import type { SessionResponse } from "@slyxup/core";

/**
 * SlyxUp Stack session validation for this Worker.
 *
 * Motion never mints its own sessions: the browser signs in against the Stack
 * auth service (publishable key scopes the project), and every Motion API call
 * carries the user's session token — `Authorization: Bearer …` from SPA JS, or
 * the `slyxup_session` HttpOnly cookie on same-origin routes. We validate it
 * against the auth service per request with a request-scoped client (never a
 * module-level signed-in client).
 */

export interface StackEnv {
  SLYXUP_AUTH_URL?: string;
  SLYXUP_BILLING_URL?: string;
  SLYXUP_PUBLISHABLE_KEY?: string;
  SLYXUP_PROJECT_ID?: string;
}

export interface StackSession {
  user: SessionResponse["user"];
  session: SessionResponse["session"];
  /** Raw bearer token, for per-request billing calls. */
  token: string;
}

function readToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token) return token;
  }
  const cookie = req.headers.get("cookie");
  const match = cookie
    ?.split(";")
    .map((p) => p.trim())
    .find(
      (p) =>
        p.startsWith("slyxup_session=") ||
        p.startsWith("__Host-slyxup_session="),
    );
  if (match) {
    try {
      return decodeURIComponent(match.split("=").slice(1).join("=")) || null;
    } catch {
      return null;
    }
  }
  return null;
}

function stackConfig(env: StackEnv) {
  const apiUrl = env.SLYXUP_AUTH_URL;
  const publishableKey = env.SLYXUP_PUBLISHABLE_KEY;
  if (!apiUrl || !publishableKey) {
    throw new Error(
      "SLYXUP_AUTH_URL / SLYXUP_PUBLISHABLE_KEY are not configured. " +
        "Set them in backend/.dev.vars locally (see .dev.vars.example).",
    );
  }
  return { apiUrl, publishableKey };
}

/** Validate the incoming session; returns null for missing/rejected sessions. */
export async function getStackSession(
  req: Request,
  env: StackEnv,
): Promise<StackSession | null> {
  const token = readToken(req);
  if (!token) return null;
  const { apiUrl, publishableKey } = stackConfig(env);
  const client = new SlyxupClient({
    apiUrl,
    publishableKey,
    sessionToken: token,
  });
  try {
    const res = await client.sessions.get();
    return { user: res.user, session: res.session, token };
  } catch (err) {
    if (
      err instanceof Error &&
      "status" in err &&
      (err.status === 401 || err.status === 403)
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Per-request billing client bound to the caller's session. Reads the linked
 * auth client's token on each request (same pattern as the SPA useBilling).
 */
export function billingFor(env: StackEnv, token: string) {
  const { publishableKey } = stackConfig(env);
  return createBillingClient({
    apiUrl: env.SLYXUP_BILLING_URL,
    publishableKey,
    getToken: () => token,
  });
}

export function projectId(env: StackEnv): string {
  const id = env.SLYXUP_PROJECT_ID;
  if (!id) throw new Error("SLYXUP_PROJECT_ID is not configured.");
  return id;
}
