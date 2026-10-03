/**
 * SlyxUp Stack project config + authenticated Motion API helper.
 *
 * Publishable values are public by design (they ship in the JS bundle).
 * The session token comes from the SlyxUpProvider client at call time —
 * never stored here, never sent anywhere except motion + Stack endpoints.
 */

export const SLYXUP_PUBLISHABLE_KEY =
  import.meta.env.VITE_SLYXUP_PUBLISHABLE_KEY as string | undefined;

export const SLYXUP_API_URL =
  (import.meta.env.VITE_SLYXUP_API_URL as string | undefined) ??
  "https://auth-slyxup-com.auth-0f4.workers.dev";

export const SLYXUP_BILLING_URL =
  (import.meta.env.VITE_SLYXUP_BILLING_URL as string | undefined) ??
  "https://billing-slyxup-com.billing-86c.workers.dev";

export const SLYXUP_PROJECT_ID =
  import.meta.env.VITE_SLYXUP_PROJECT_ID as string | undefined;

const API_HOST = import.meta.env.VITE_API_HOST as string | undefined;

function apiBase(): string {
  if (!API_HOST) return ""; // dev: Vite proxies /api to the Worker
  return API_HOST.startsWith("http") ? API_HOST : `https://${API_HOST}`;
}

export class MotionApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Authenticated call to the Motion Worker. Throws MotionApiError on failure. */
export async function motionApi<T>(
  token: string | undefined,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${apiBase()}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  if (!res.ok) {
    throw new MotionApiError(
      res.status,
      body?.error ?? "internal",
      body?.message ?? `Request failed (${res.status}).`,
    );
  }
  return body as T;
}

export async function motionUpload(
  token: string | undefined,
  path: string,
  file: File,
): Promise<{ key: string; url: string }> {
  const form = new FormData();
  form.append("file", file);
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${apiBase()}${path}`, { method: "POST", headers, body: form });
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
    key?: string;
    url?: string;
  } | null;
  if (!res.ok || !body?.url) {
    throw new MotionApiError(
      res.status,
      body?.error ?? "internal",
      body?.message ?? `Upload failed (${res.status}).`,
    );
  }
  return { key: body.key ?? "", url: body.url };
}

export function friendlyAuthError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}
