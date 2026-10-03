/**
 * CORS for the split-domain production setup: Pages serves the UI at
 * motion.slyxup.com, this Worker serves /api/* + /agents/*. Dev stays
 * single-origin via the Vite proxy, so these headers only matter in prod.
 */
const ALLOWED_ORIGINS = [
  "https://motion.slyxup.com",
  "http://localhost:5173",
];

export const CORS_BASE: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Publishable-Key",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "86400",
};

export function corsFor(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return { ...CORS_BASE, "Access-Control-Allow-Origin": allowed };
}

export function withCors(res: Response, origin: string | null): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsFor(origin))) headers.set(k, v);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export function handlePreflight(
  req: Request,
  origin: string | null,
): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsFor(origin) });
}
