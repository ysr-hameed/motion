/** Structured request logging (observability enabled; Logpush captures console). */

export function logRequest(req: Request, status: number, ms: number, userId?: string): void {
  const url = new URL(req.url);
  console.log(
    JSON.stringify({
      msg: "api-request",
      method: req.method,
      path: url.pathname,
      status,
      ms: Math.round(ms),
      user: userId ?? "anon",
    }),
  );
}
