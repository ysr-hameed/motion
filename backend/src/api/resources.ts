import { ApiError, toErrorResponse } from "../lib/api-error";
import { billingFor, projectId as stackProjectId } from "../lib/stack-auth";
import {
  brandKitUpsert,
  compositionUpdate,
  exportCreate,
  parse,
  projectCreate,
  projectUpdate,
  ratingBody,
  templateCreate,
} from "../lib/validate";
import {
  getTier,
  requirePlan,
  type AppContext,
} from "../middleware/require-auth";
import {
  countSince,
  monthStartMs,
  newId,
  nowMs,
  requireDb,
  upsertUser,
} from "../db/queries";

/** Product-data routes. Composition CONTENT stays in the DO; here is metadata. */

const PLAN_LIMITS = {
  free: { compositions: 5, exports: 5 },
  pro: { compositions: -1, exports: -1 },
  business: { compositions: -1, exports: -1 },
} as const;

async function checkQuota(
  ctx: AppContext,
  kind: "compositions" | "exports",
): Promise<Response | null> {
  const tier = await getTier(ctx);
  const limit = PLAN_LIMITS[tier][kind];
  if (limit < 0 || !ctx.env.DB) return null;
  const used = await countSince(ctx.env.DB, kind, ctx.session.user.id, monthStartMs());
  if (used >= limit) {
    return Response.json(
      { error: "quota_exceeded", message: `Monthly ${kind} limit reached (${limit}).`, tier },
      { status: 429 },
    );
  }
  return null;
}

async function touchUser(ctx: AppContext): Promise<void> {
  if (!ctx.env.DB) return;
  await upsertUser(ctx.env.DB, {
    id: ctx.session.user.id,
    email: ctx.session.user.email,
    name: ctx.session.user.name ?? null,
    avatarUrl: ctx.session.user.avatarUrl ?? null,
  }).catch(() => undefined);
}

export async function handleResources(
  req: Request,
  ctx: AppContext,
  url: URL,
): Promise<Response> {
  try {
    const db = requireDb(ctx.env);
    const uid = ctx.session.user.id;
    const path = url.pathname;
    const seg = (n: number) => decodeURIComponent(path.split("/")[n] ?? "");

    // ── Projects ──────────────────────────────────────────────
    if (req.method === "GET" && path === "/api/projects") {
      await touchUser(ctx);
      const rows = await db
        .prepare(
          `SELECT p.*, COUNT(c.id) AS cuts FROM projects p
           LEFT JOIN team_members m ON m.team_id = p.team_id
           LEFT JOIN compositions c ON c.project_id = p.id
           WHERE p.user_id = ? OR m.user_id = ?
           GROUP BY p.id
           ORDER BY p.updated_at DESC LIMIT 100`,
        )
        .bind(uid, uid)
        .all();
      return Response.json({ projects: rows.results });
    }

    if (req.method === "POST" && path === "/api/projects") {
      const quota = await checkQuota(ctx, "compositions");
      if (quota) return quota;
      const body = parse(projectCreate, await req.json().catch(() => null), "project");
      await touchUser(ctx);
      const id = newId("proj");
      const now = nowMs();
      await db
        .prepare(
          `INSERT INTO projects (id, user_id, name, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, uid, body.name, body.description ?? null, now, now)
        .run();
      return Response.json({ id, name: body.name }, { status: 201 });
    }

    if (path.startsWith("/api/projects/") && seg(3)) {
      const id = seg(3);
      const row = await db
        .prepare(`SELECT * FROM projects WHERE id = ?`)
        .bind(id)
        .first<{ user_id: string } & Record<string, unknown>>();
      if (!row) throw new ApiError(404, "not_found", "Project not found.");
      if (req.method === "GET") {
        const comps = await db
          .prepare(`SELECT * FROM compositions WHERE project_id = ? ORDER BY updated_at DESC`)
          .bind(id)
          .all();
        return Response.json({ project: row, compositions: comps.results });
      }
      if (row.user_id !== uid) throw new ApiError(403, "forbidden", "Not your project.");
      if (req.method === "PATCH") {
        const body = parse(projectUpdate, await req.json().catch(() => null), "project");
        const now = nowMs();
        await db
          .prepare(
            `UPDATE projects SET
               name = COALESCE(?, name),
               description = COALESCE(?, description),
               status = COALESCE(?, status),
               updated_at = ?
             WHERE id = ?`,
          )
          .bind(
            body.name ?? null,
            body.description ?? null,
            body.status ?? null,
            now,
            id,
          )
          .run();
        return Response.json({ ok: true });
      }
      if (req.method === "DELETE") {
        await db.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();
        return Response.json({ ok: true });
      }
    }

    // ── Compositions (metadata) ───────────────────────────────
    // The browser calls attach once per chat session so the D1 row carries
    // the correct owner; the DO later PATCHes fields via /api/internal/*.
    if (req.method === "POST" && path === "/api/compositions/attach") {
      const body = (await req.json().catch(() => null)) as { sessionId?: string; projectId?: string } | null;
      const sessionId = body?.sessionId?.trim();
      if (!sessionId || sessionId.length > 80) {
        throw new ApiError(400, "invalid_request", "sessionId is required.");
      }
      await touchUser(ctx);
      // Optional project link — verified to belong to this user first, so a
      // session can never claim another user's project.
      let projectId: string | null = null;
      const want = body?.projectId?.trim();
      if (want) {
        const own = await db
          .prepare(`SELECT id FROM projects WHERE id = ? AND user_id = ?`)
          .bind(want, uid)
          .first();
        if (own) projectId = want;
      }
      const now = nowMs();
      await db
        .prepare(
          `INSERT INTO compositions (id, user_id, project_id, status, created_at, updated_at)
           VALUES (?, ?, ?, 'draft', ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             project_id = COALESCE(excluded.project_id, compositions.project_id),
             updated_at = excluded.updated_at`,
        )
        .bind(sessionId, uid, projectId, now, now)
        .run();
      return Response.json({ ok: true, id: sessionId });
    }

    if (req.method === "GET" && path === "/api/compositions") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const rows = await db
        .prepare(`SELECT * FROM compositions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
        .bind(uid, limit, offset)
        .all();
      return Response.json({ compositions: rows.results });
    }

    if (path.startsWith("/api/compositions/")) {
      const id = seg(3);
      const sub = seg(4);
      if (req.method === "POST" && sub === "rating") {
        const { rating } = parse(ratingBody, await req.json().catch(() => null), "rating");
        await db
          .prepare(
            `INSERT INTO composition_analytics (id, composition_id, user_id, created_at, user_rating)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(newId("an"), id, uid, nowMs(), rating)
          .run()
          .catch(() => undefined);
        return Response.json({ ok: true });
      }
      const row = await db
        .prepare(`SELECT * FROM compositions WHERE id = ?`)
        .bind(id)
        .first<{ user_id: string } & Record<string, unknown>>();
      if (!row) throw new ApiError(404, "not_found", "Composition not found.");
      if (row.user_id !== uid) throw new ApiError(403, "forbidden", "Not your composition.");
      if (req.method === "GET") return Response.json(row);
      if (req.method === "PATCH") {
        const body = parse(compositionUpdate, await req.json().catch(() => null), "composition");
        await db
          .prepare(
            `UPDATE compositions SET
               title = COALESCE(?, title),
               project_id = COALESCE(?, project_id),
               status = COALESCE(?, status),
               duration_s = COALESCE(?, duration_s),
               fps = COALESCE(?, fps),
               width = COALESCE(?, width),
               height = COALESCE(?, height),
               thumbnail_url = COALESCE(?, thumbnail_url),
               updated_at = ?
             WHERE id = ?`,
          )
          .bind(
            body.title ?? null, body.project_id ?? null, body.status ?? null,
            body.duration_s ?? null, body.fps ?? null, body.width ?? null,
            body.height ?? null, body.thumbnail_url ?? null, nowMs(), id,
          )
          .run();
        return Response.json({ ok: true });
      }
      if (req.method === "DELETE") {
        await db.prepare(`DELETE FROM compositions WHERE id = ?`).bind(id).run();
        return Response.json({ ok: true });
      }
    }

    // ── Templates ─────────────────────────────────────────────
    if (req.method === "GET" && path === "/api/templates") {
      const rows = await db
        .prepare(
          `SELECT * FROM templates WHERE is_system = 1 OR created_by = ? ORDER BY created_at DESC`,
        )
        .bind(uid)
        .all();
      return Response.json({ templates: rows.results });
    }
    if (req.method === "GET" && path.startsWith("/api/templates/")) {
      const row = await db
        .prepare(`SELECT * FROM templates WHERE id = ?`)
        .bind(seg(3))
        .first();
      if (!row) throw new ApiError(404, "not_found", "Template not found.");
      return Response.json(row);
    }
    if (req.method === "POST" && path === "/api/templates") {
      const gate = await requirePlan(ctx, "pro");
      if (gate) return gate;
      const body = parse(templateCreate, await req.json().catch(() => null), "template");
      const id = newId("tpl");
      await db
        .prepare(
          `INSERT INTO templates (id, name, category, duration_s, plan_required, is_system, created_by, composition_snapshot, created_at)
           VALUES (?, ?, ?, ?, 'free', 0, ?, ?, ?)`,
        )
        .bind(
          id, body.name, body.category,
          body.duration_s ?? null, uid,
          body.composition_snapshot ?? null, nowMs(),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }
    if (req.method === "DELETE" && path.startsWith("/api/templates/")) {
      const row = await db.prepare(`SELECT * FROM templates WHERE id = ?`).bind(seg(3)).first<{
        created_by: string | null; is_system: number;
      }>();
      if (!row) throw new ApiError(404, "not_found", "Template not found.");
      if (row.is_system === 1 || row.created_by !== uid) {
        throw new ApiError(403, "forbidden", "Only your own templates can be deleted.");
      }
      await db.prepare(`DELETE FROM templates WHERE id = ?`).bind(seg(3)).run();
      return Response.json({ ok: true });
    }

    // ── Brand kit (Pro) ───────────────────────────────────────
    if (path === "/api/brand-kit") {
      if (req.method === "GET") {
        const row = await db.prepare(`SELECT * FROM brand_kits WHERE user_id = ?`).bind(uid).first();
        return Response.json({ brandKit: row });
      }
      if (req.method === "PUT") {
        const gate = await requirePlan(ctx, "pro");
        if (gate) return gate;
        const body = parse(brandKitUpsert, await req.json().catch(() => null), "brand kit");
        const id = newId("brand");
        await db
          .prepare(
            `INSERT INTO brand_kits (id, user_id, logo_primary_url, logo_dark_url, colors, font_heading, font_body, guidelines_url, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               logo_primary_url = excluded.logo_primary_url,
               logo_dark_url = excluded.logo_dark_url,
               colors = excluded.colors,
               font_heading = excluded.font_heading,
               font_body = excluded.font_body,
               guidelines_url = excluded.guidelines_url,
               updated_at = excluded.updated_at`,
          )
          .bind(
            id, uid,
            body.logo_primary_url ?? null,
            body.logo_dark_url ?? null,
            body.colors ?? null,
            body.font_heading ?? null,
            body.font_body ?? null,
            body.guidelines_url ?? null,
            nowMs(),
          )
          .run();
        return Response.json({ ok: true });
      }
    }

    // ── Exports ───────────────────────────────────────────────
    if (req.method === "GET" && path === "/api/exports") {
      const rows = await db
        .prepare(`SELECT * FROM exports WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`)
        .bind(uid)
        .all();
      return Response.json({ exports: rows.results });
    }
    if (req.method === "POST" && path === "/api/exports") {
      const quota = await checkQuota(ctx, "exports");
      if (quota) return quota;
      const body = parse(exportCreate, await req.json().catch(() => null), "export");
      const id = newId("exp");
      await db
        .prepare(
          `INSERT INTO exports (id, composition_id, user_id, preset, width, height, fps, format, r2_key, cdn_url, file_size_bytes, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'done', ?)`,
        )
        .bind(
          id, body.composition_id, uid, body.preset,
          body.width ?? null, body.height ?? null,
          body.fps ?? null, body.format ?? null,
          body.r2_key ?? null, body.cdn_url ?? null,
          body.file_size_bytes ?? null, nowMs(),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }
    if (path.startsWith("/api/exports/")) {
      const id = seg(3);
      const row = await db.prepare(`SELECT * FROM exports WHERE id = ?`).bind(id).first<{
        user_id: string;
      } & Record<string, unknown>>();
      if (!row) throw new ApiError(404, "not_found", "Export not found.");
      if (row.user_id !== uid) throw new ApiError(403, "forbidden", "Not your export.");
      if (req.method === "GET") return Response.json(row);
      if (req.method === "DELETE") {
        await db.prepare(`DELETE FROM exports WHERE id = ?`).bind(id).run();
        return Response.json({ ok: true });
      }
    }

    // ── Billing: live plan + usage ────────────────────────────
    if (req.method === "GET" && path === "/api/billing/plan") {
      const tier = await getTier(ctx);
      const billing = billingFor(ctx.env, ctx.session.token);
      const pid = stackProjectId(ctx.env);
      const [entitlements, subscription] = await Promise.all([
        billing.getEntitlements(pid).catch(() => null),
        billing.getSubscription(pid).catch(() => null),
      ]);
      const monthStart = monthStartMs();
      const [compositions, exports] = await Promise.all([
        countSince(db, "compositions", uid, monthStart),
        countSince(db, "exports", uid, monthStart),
      ]);
      return Response.json({
        tier,
        entitlements,
        subscription,
        usage: {
          compositions: { used: compositions, limit: PLAN_LIMITS[tier].compositions },
          exports: { used: exports, limit: PLAN_LIMITS[tier].exports },
        },
      });
    }

    // ── Analytics ─────────────────────────────────────────────
    if (req.method === "GET" && path === "/api/analytics/usage") {
      const tier = await getTier(ctx);
      const monthStart = monthStartMs();
      const [compositions, exports] = await Promise.all([
        countSince(db, "compositions", uid, monthStart),
        countSince(db, "exports", uid, monthStart),
      ]);
      return Response.json({
        compositions: { used: compositions, limit: PLAN_LIMITS[tier].compositions },
        exports: { used: exports, limit: PLAN_LIMITS[tier].exports },
      });
    }
    if (req.method === "GET" && path === "/api/analytics/history") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
      const rows = await db
        .prepare(`SELECT * FROM composition_analytics WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
        .bind(uid, limit)
        .all();
      return Response.json({ history: rows.results });
    }

    return Response.json({ error: "not_found", message: "Not found." }, { status: 404 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Internal DO → REST sync (fire-and-forget via ctx.waitUntil). Authenticated
 * by INTERNAL_SECRET, never by a user session.
 */
export async function handleInternalSync(req: Request, env: Env & { DB?: D1Database; INTERNAL_SECRET?: string }, url: URL): Promise<Response> {
  try {
    const secret = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!env.INTERNAL_SECRET || secret !== env.INTERNAL_SECRET) {
      throw new ApiError(401, "invalid_credentials", "Bad internal secret.");
    }
    const db = requireDb(env);
    const match = url.pathname.match(/^\/api\/internal\/compositions\/([^/]+)$/);
    if (req.method === "PATCH" && match?.[1]) {
      // UPDATE-only: the row is created by the authenticated attach call, so
      // the DO can never invent ownership.
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      await db
        .prepare(
          `UPDATE compositions SET
             title = COALESCE(?, title),
             duration_s = COALESCE(?, duration_s),
             fps = COALESCE(?, fps),
             width = COALESCE(?, width),
             height = COALESCE(?, height),
             thumbnail_url = COALESCE(?, thumbnail_url),
             updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          (body.title as string) ?? null,
          (body.duration_s as number) ?? null, (body.fps as number) ?? null,
          (body.width as number) ?? null, (body.height as number) ?? null,
          (body.thumbnail_url as string) ?? null, nowMs(), match[1],
        )
        .run();
      return Response.json({ ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/internal/analytics") {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      await db
        .prepare(
          `INSERT INTO composition_analytics
             (id, composition_id, user_id, session_id, brief, intent_category, created_at,
              total_time_ms, model_calls, tool_calls, errors_count, retries_count,
              motion_score, perf_score, a11y_score, exported, export_format, template_id, customization_level)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId("an"),
          (body.composition_id as string) ?? null,
          (body.user_id as string) ?? null,
          (body.session_id as string) ?? null,
          typeof body.brief === "string" ? body.brief.slice(0, 2000) : null,
          (body.intent_category as string) ?? null,
          nowMs(),
          (body.total_time_ms as number) ?? null,
          (body.model_calls as number) ?? null,
          (body.tool_calls as number) ?? null,
          (body.errors_count as number) ?? null,
          (body.retries_count as number) ?? null,
          (body.motion_score as number) ?? null,
          (body.perf_score as number) ?? null,
          (body.a11y_score as number) ?? null,
          (body.exported as number) ?? 0,
          (body.export_format as string) ?? null,
          (body.template_id as string) ?? null,
          (body.customization_level as string) ?? null,
        )
        .run();
      return Response.json({ ok: true });
    }
    throw new ApiError(404, "not_found", "Not found.");
  } catch (err) {
    return toErrorResponse(err);
  }
}
