import { ApiError, toErrorResponse } from "../lib/api-error";
import { newId } from "../db/queries";
import { getTier, type AppContext } from "../middleware/require-auth";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_PREFIXES = ["image/", "video/", "audio/", "font/", "application/pdf"];

/**
 * R2 asset surface. Uploads are authenticated; reads go through unguessable
 * public tokens (`/pub/:token`, KV-mapped) so <img>/<video> tags work without
 * Authorization headers. Share links (`/v/:token`) reuse the same mechanism.
 */

type Buckets = {
  ASSETS_BUCKET?: R2Bucket;
  EXPORTS_BUCKET?: R2Bucket;
  ASSET_CACHE_KV?: KVNamespace;
};

function buckets(ctx: AppContext): Required<Buckets> {
  const env = ctx.env as AppContext["env"] & Buckets;
  if (!env.ASSETS_BUCKET || !env.EXPORTS_BUCKET || !env.ASSET_CACHE_KV) {
    throw new ApiError(503, "storage_not_bound", "R2/KV bindings are not configured.");
  }
  return {
    ASSETS_BUCKET: env.ASSETS_BUCKET,
    EXPORTS_BUCKET: env.EXPORTS_BUCKET,
    ASSET_CACHE_KV: env.ASSET_CACHE_KV,
  };
}

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return m ? `.${m[1]}` : "";
}

async function mintPublicToken(
  kv: KVNamespace,
  target: { bucket: "assets" | "exports"; key: string; contentType: string },
  ttlSeconds: number,
): Promise<string> {
  const token = [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await kv.put(`pub:${token}`, JSON.stringify(target), { expirationTtl: ttlSeconds });
  return token;
}

async function storeUpload(
  ctx: AppContext,
  file: File,
  prefix: string,
): Promise<{ key: string; token: string }> {
  const { ASSETS_BUCKET, ASSET_CACHE_KV } = buckets(ctx);
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(400, "invalid_request", "File too large (max 10 MB).");
  }
  if (!ALLOWED_PREFIXES.some((p) => (file.type || "").startsWith(p))) {
    throw new ApiError(400, "invalid_request", `Unsupported file type: ${file.type || "unknown"}.`);
  }
  const key = `${prefix}/${ctx.session.user.id}/${newId("file")}${extOf(file.name)}`;
  await ASSETS_BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  const token = await mintPublicToken(
    ASSET_CACHE_KV,
    { bucket: "assets", key, contentType: file.type || "application/octet-stream" },
    365 * 86400,
  );
  return { key, token };
}

async function servePublicToken(req: Request, env: Buckets & { WORKER_SELF_URL?: string }, token: string): Promise<Response | null> {
  if (!env.ASSET_CACHE_KV) return null;
  const raw = await env.ASSET_CACHE_KV.get(`pub:${token}`);
  if (!raw) return null;
  const target = JSON.parse(raw) as { bucket: "assets" | "exports"; key: string; contentType: string };
  const bucket = target.bucket === "exports" ? env.EXPORTS_BUCKET : env.ASSETS_BUCKET;
  const obj = await bucket?.get(target.key);
  if (!obj) return null;
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (target.contentType) headers.set("Content-Type", target.contentType);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  const range = req.headers.get("range");
  if (range && obj.size) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), obj.size - 1) : obj.size - 1;
      if (start < obj.size && start <= end) {
        const slice = await bucket?.get(target.key, { range: { offset: start, length: end - start + 1 } });
        if (slice) {
          headers.set("Content-Range", `bytes ${start}-${end}/${obj.size}`);
          headers.set("Content-Length", String(end - start + 1));
          return new Response(slice.body, { status: 206, headers });
        }
      }
    }
  }
  return new Response(obj.body, { headers });
}

export async function handlePublicAsset(req: Request, env: Buckets, token: string): Promise<Response> {
  if (req.method !== "GET") return new Response("Not found", { status: 404 });
  const resp = await servePublicToken(req, env, token);
  return resp ?? new Response("Not found", { status: 404 });
}

/** Public share page: minimal video player for /v/:token links. */
export async function handleSharePage(req: Request, env: Buckets, token: string): Promise<Response> {
  if (req.method !== "GET") return new Response("Not found", { status: 404 });
  if (!env.ASSET_CACHE_KV) return new Response("Not found", { status: 404 });
  const raw = await env.ASSET_CACHE_KV.get(`share:${token}`);
  if (!raw) return new Response("Not found", { status: 404 });
  const { fileUrl, title } = JSON.parse(raw) as { fileUrl: string; title: string };
  const safe = String(title).replace(/[<>&"]/g, "");
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe} — SlyxUp Motion</title><style>body{margin:0;background:#0E0F13;color:#E8EAF0;font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh}video{max-width:min(92vw,960px);border-radius:12px}</style></head><body><h1 style="font-size:18px">${safe}</h1><video src="${fileUrl}" controls autoplay muted loop playsinline></video></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function handleAssets(req: Request, ctx: AppContext, url: URL): Promise<Response> {
  try {
    const path = url.pathname;

    if (req.method === "POST" && path === "/api/assets/upload") {
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      if (!(file instanceof File)) {
        throw new ApiError(400, "invalid_request", 'Multipart field "file" is required.');
      }
      const out = await storeUpload(ctx, file, "uploads");
      return Response.json(
        { key: out.key, url: `${new URL(req.url).origin}/pub/${out.token}` },
        { status: 201 },
      );
    }

    if (req.method === "POST" && path === "/api/brand-kit/upload") {
      const tier = await getTier(ctx);
      if (tier === "free") {
        return Response.json({ error: "upgrade_required", message: "Brand Kit is a Pro feature.", required: "pro" }, { status: 403 });
      }
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      if (!(file instanceof File)) {
        throw new ApiError(400, "invalid_request", 'Multipart field "file" is required.');
      }
      if (!file.type.startsWith("image/")) {
        throw new ApiError(400, "invalid_request", "Logo must be an image.");
      }
      const out = await storeUpload(ctx, file, "logos");
      return Response.json(
        { key: out.key, url: `${new URL(req.url).origin}/pub/${out.token}` },
        { status: 201 },
      );
    }

    if (req.method === "GET" && path === "/api/assets/file") {
      const key = url.searchParams.get("key");
      if (!key) throw new ApiError(400, "invalid_request", "Missing ?key=.");
      const { ASSETS_BUCKET } = buckets(ctx);
      // Confine reads to this user's own uploads/logos.
      if (!key.startsWith(`uploads/${ctx.session.user.id}/`) && !key.startsWith(`logos/${ctx.session.user.id}/`)) {
        throw new ApiError(403, "forbidden", "Not your file.");
      }
      const obj = await ASSETS_BUCKET.get(key);
      if (!obj) throw new ApiError(404, "not_found", "File not found.");
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      return new Response(obj.body, { headers });
    }

    if (path.startsWith("/api/exports/") && path.endsWith("/share") && req.method === "POST") {
      const id = decodeURIComponent(path.split("/")[3] ?? "");
      const db = ctx.env.DB;
      if (!db) throw new ApiError(503, "database_not_provisioned", "Database is not provisioned yet.");
      const row = await db.prepare(`SELECT * FROM exports WHERE id = ?`).bind(id).first<{
        user_id: string; cdn_url: string | null; r2_key: string | null; preset: string;
      }>();
      if (!row) throw new ApiError(404, "not_found", "Export not found.");
      if (row.user_id !== ctx.session.user.id) throw new ApiError(403, "forbidden", "Not your export.");
      const { ASSET_CACHE_KV } = buckets(ctx);
      let fileUrl = row.cdn_url;
      if (!fileUrl && row.r2_key) {
        const token = await mintPublicToken(
          ASSET_CACHE_KV,
          { bucket: "exports", key: row.r2_key, contentType: "video/mp4" },
          30 * 86400,
        );
        fileUrl = `${new URL(req.url).origin}/pub/${token}`;
      }
      if (!fileUrl) throw new ApiError(400, "invalid_request", "Export has no file to share.");
      const shareToken = [...crypto.getRandomValues(new Uint8Array(16))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      await ASSET_CACHE_KV.put(
        `share:${shareToken}`,
        JSON.stringify({ fileUrl, title: row.preset }),
        { expirationTtl: 30 * 86400 },
      );
      return Response.json({ url: `${new URL(req.url).origin}/v/${shareToken}` }, { status: 201 });
    }

    return Response.json({ error: "not_found", message: "Not found." }, { status: 404 });
  } catch (err) {
    const { toErrorResponse } = await import("../lib/api-error");
    return toErrorResponse(err);
  }
}
