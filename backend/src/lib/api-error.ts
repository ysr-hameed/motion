/** Machine-readable API errors, serialised as `{ error, message }`. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json(
      { error: err.code, message: err.message },
      { status: err.status },
    );
  }
  console.error(JSON.stringify({ msg: "api-unhandled-error", err: String(err) }));
  return Response.json(
    { error: "internal", message: "Unexpected server error." },
    { status: 500 },
  );
}
