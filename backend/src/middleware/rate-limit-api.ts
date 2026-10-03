/** KV-backed per-user REST rate limit: 120 req/min (BACKEND_API_PLAN §7.4). */

const LIMIT = 120;

export async function apiRateLimit(
  userId: string,
  env: { RATE_LIMIT_KV?: KVNamespace },
): Promise<Response | null> {
  if (!env.RATE_LIMIT_KV) return null; // unbound in local dev without KV
  const minute = Math.floor(Date.now() / 60_000);
  const key = `rl:api:${userId}:${minute}`;
  const raw = await env.RATE_LIMIT_KV.get(key);
  const count = raw ? Number.parseInt(raw, 10) || 0 : 0;
  if (count >= LIMIT) {
    return new Response(
      JSON.stringify({ error: "rate_limited", message: "Too many requests. Slow down." }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } },
    );
  }
  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 90 });
  return null;
}
