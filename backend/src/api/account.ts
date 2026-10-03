import { SlyxupClient } from "@slyxup/core";
import { toErrorResponse } from "../lib/api-error";
import { parse, passwordChange, profileUpdate } from "../lib/validate";
import { getTier, type AppContext } from "../middleware/require-auth";

/**
 * Account routes — thin proxies over the Stack auth service with the caller's
 * own session. No Motion-side user tables are touched here except the profile
 * mirror upsert in /me (best-effort, skipped when D1 is unbound).
 */
function clientFor(ctx: AppContext): SlyxupClient {
  return new SlyxupClient({
    apiUrl: ctx.env.SLYXUP_AUTH_URL,
    publishableKey: ctx.env.SLYXUP_PUBLISHABLE_KEY,
    sessionToken: ctx.session.token,
  });
}

export async function handleAccount(
  req: Request,
  ctx: AppContext,
  url: URL,
): Promise<Response> {
  try {
    const client = clientFor(ctx);
    const path = url.pathname;

    if (req.method === "GET" && path === "/api/auth/me") {
      const [me, tier] = await Promise.all([
        client.users.me().catch(() => null),
        getTier(ctx),
      ]);
      // Best-effort profile mirror for ownership joins; never fail /me on it.
      if (me && ctx.env.DB) {
        const { upsertUser } = await import("../db/queries");
        const name =
          me.user.firstName || me.user.lastName
            ? `${me.user.firstName ?? ""} ${me.user.lastName ?? ""}`.trim()
            : null;
        await upsertUser(ctx.env.DB, {
          id: me.user.id,
          email: me.user.email,
          name,
          avatarUrl: me.user.avatarUrl,
        }).catch((err) =>
          console.error(JSON.stringify({ msg: "profile-mirror-failed", err: String(err) })),
        );
      }
      return Response.json({
        user: me?.user ?? ctx.session.user,
        tier,
      });
    }

    if (req.method === "GET" && path === "/api/auth/sessions") {
      return Response.json(await client.sessions.list());
    }

    if (req.method === "DELETE" && path.startsWith("/api/auth/sessions/")) {
      const id = decodeURIComponent(path.slice("/api/auth/sessions/".length));
      if (!id) return Response.json({ error: "invalid_request", message: "Missing session id." }, { status: 400 });
      return Response.json(await client.sessions.revoke(id));
    }

    if (req.method === "POST" && path === "/api/auth/sessions/revoke-others") {
      return Response.json(await client.sessions.revokeOthers());
    }

    if (req.method === "PATCH" && path === "/api/auth/profile") {
      const input = parse(profileUpdate, await req.json().catch(() => null), "profile");
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input)) {
        if (v !== undefined) clean[k] = v;
      }
      return Response.json(await client.users.update(clean as never));
    }

    if (req.method === "POST" && path === "/api/auth/change-password") {
      const body = parse(passwordChange, await req.json().catch(() => null), "password change");
      return Response.json(
        await client.password.change({
          currentPassword: body.currentPassword,
          newPassword: body.newPassword,
        }),
      );
    }

    if (req.method === "GET" && path === "/api/auth/2fa/status") {
      return Response.json(await client.twoFactor.status());
    }

    if (req.method === "DELETE" && path === "/api/auth/account") {
      // Motion data only (cascades to projects, compositions, exports,
      // brand kit, keys). The Stack auth identity is left untouched.
      if (!ctx.env.DB) {
        return Response.json({ error: "database_not_provisioned", message: "Database is not provisioned yet." }, { status: 503 });
      }
      await ctx.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(ctx.session.user.id).run();
      return Response.json({ ok: true });
    }

    return Response.json({ error: "not_found", message: "Not found." }, { status: 404 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
