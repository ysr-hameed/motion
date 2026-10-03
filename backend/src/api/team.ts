import { ApiError, toErrorResponse } from "../lib/api-error";
import { parse, teamCreate, teamInvite } from "../lib/validate";
import { getTier, requirePlan, type AppContext } from "../middleware/require-auth";
import { newId, nowMs, requireDb } from "../db/queries";

/**
 * Team routes (Pro). Motion-local collaboration: a team owns projects,
 * members have editor/viewer roles. Stack organization plugin is the future
 * home for this; the local tables ship first so Team UI works today.
 */

export async function handleTeam(
  req: Request,
  ctx: AppContext,
  url: URL,
): Promise<Response> {
  try {
    const db = requireDb(ctx.env);
    const uid = ctx.session.user.id;
    const path = url.pathname;
    const seg = (n: number) => decodeURIComponent(path.split("/")[n] ?? "");

    const myTeam = async () => {
      const team = await db
        .prepare(
          `SELECT t.* FROM teams t
           LEFT JOIN team_members m ON m.team_id = t.id
           WHERE t.owner_id = ? OR m.user_id = ?
           LIMIT 1`,
        )
        .bind(uid, uid)
        .first<Record<string, unknown>>();
      return team as (Record<string, unknown> & { id: string; owner_id: string; seat_limit: number }) | null;
    };

    if (req.method === "GET" && path === "/api/team") {
      const gate = await requirePlan(ctx, "pro");
      if (gate) return gate;
      const team = await myTeam();
      if (!team) return Response.json({ team: null, members: [] });
      const members = await db
        .prepare(`SELECT user_id, role, joined_at FROM team_members WHERE team_id = ?`)
        .bind(team.id)
        .all();
      return Response.json({ team, members: members.results, tier: await getTier(ctx) });
    }

    if (req.method === "POST" && path === "/api/team") {
      const gate = await requirePlan(ctx, "pro");
      if (gate) return gate;
      if (await myTeam()) {
        throw new ApiError(400, "invalid_request", "You already belong to a team.");
      }
      const body = parse(teamCreate, await req.json().catch(() => null), "team");
      const id = newId("team");
      const now = nowMs();
      await db
        .prepare(`INSERT INTO teams (id, owner_id, name, seat_limit, created_at) VALUES (?, ?, ?, 3, ?)`)
        .bind(id, uid, body.name, now)
        .run();
      await db
        .prepare(`INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`)
        .bind(id, uid, now)
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (req.method === "POST" && path === "/api/team/invite") {
      const gate = await requirePlan(ctx, "pro");
      if (gate) return gate;
      const team = await myTeam();
      if (!team || team.owner_id !== uid) {
        throw new ApiError(403, "forbidden", "Only the team owner can invite.");
      }
      const body = parse(teamInvite, await req.json().catch(() => null), "invite");
      const count = await db
        .prepare(`SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?`)
        .bind(team.id)
        .first<{ n: number }>();
      if ((count?.n ?? 0) >= team.seat_limit) {
        throw new ApiError(403, "forbidden", "Seat limit reached.");
      }
      const token = [...crypto.getRandomValues(new Uint8Array(24))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      await db
        .prepare(
          `INSERT INTO team_invites (id, team_id, email, role, token, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId("inv"), team.id, body.email.toLowerCase(),
          body.role,
          token, nowMs() + 7 * 24 * 3600 * 1000,
        )
        .run();
      // Email dispatch is wired when RESEND/Stack email is configured; the
      // invite token is returned so the owner can share it directly.
      return Response.json({ ok: true, token }, { status: 201 });
    }

    if (path.startsWith("/api/team/members/") && seg(4)) {
      const target = seg(4);
      const team = await myTeam();
      if (!team || team.owner_id !== uid) {
        throw new ApiError(403, "forbidden", "Only the team owner can manage members.");
      }
      if (target === uid) throw new ApiError(400, "invalid_request", "You cannot change your own role.");
      if (req.method === "PATCH") {
        const body = (await req.json().catch(() => ({}))) as { role?: string };
        const role = body.role === "viewer" ? "viewer" : "editor";
        await db
          .prepare(`UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?`)
          .bind(role, team.id, target)
          .run();
        return Response.json({ ok: true });
      }
      if (req.method === "DELETE") {
        await db
          .prepare(`DELETE FROM team_members WHERE team_id = ? AND user_id = ?`)
          .bind(team.id, target)
          .run();
        return Response.json({ ok: true });
      }
    }

    if (req.method === "GET" && path === "/api/team/invite/accept") {
      const token = url.searchParams.get("token");
      if (!token) throw new ApiError(400, "invalid_request", "Invite token is required.");
      const invite = await db
        .prepare(`SELECT * FROM team_invites WHERE token = ?`)
        .bind(token)
        .first<{
          team_id: string; email: string; role: string; expires_at: number; accepted: number;
        }>();
      if (!invite || invite.accepted || invite.expires_at < nowMs()) {
        throw new ApiError(400, "invalid_request", "Invite is invalid or expired.");
      }
      if (invite.email.toLowerCase() !== ctx.session.user.email.toLowerCase()) {
        throw new ApiError(403, "forbidden", "This invite was sent to a different email.");
      }
      await db
        .prepare(`INSERT OR IGNORE INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`)
        .bind(invite.team_id, uid, invite.role, nowMs())
        .run();
      await db.prepare(`UPDATE team_invites SET accepted = 1 WHERE token = ?`).bind(token).run();
      return Response.json({ ok: true, teamId: invite.team_id });
    }

    return Response.json({ error: "not_found", message: "Not found." }, { status: 404 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
