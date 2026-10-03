import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Alert, Button, Card, Field, LoadingPage } from "~/components/ui";
import { motionApi } from "~/lib/stack";
import { Page, PageHeader, useMotionGet, useMotionToken } from "./data";

interface Member {
  user_id: string;
  role: string;
  joined_at: number;
}

interface TeamData {
  team: { id: string; owner_id: string; name: string; seat_limit: number } | null;
  members: Member[];
}

/** Team per FRONTEND_DESIGN_PLAN §3.3.8 — Pro gated, owner-managed. */
export default function Team() {
  const token = useMotionToken();
  const [params] = useSearchParams();
  const inviteToken = params.get("token");
  const { data, loading, error, reload } = useMotionGet<TeamData>("/api/team");

  const [email, setEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    motionApi<{ teamId: string }>(token, `/api/team/invite/accept?token=${encodeURIComponent(inviteToken)}`)
      .then(() => {
        setMsg("Invite accepted — welcome to the team.");
        reload();
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Invite failed."));
  }, [inviteToken, token, reload]);

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    motionApi<{ token: string }>(token, "/api/team/invite", {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), role: "editor" }),
    })
      .then((res) => {
        setEmail("");
        setInviteLink(`${window.location.origin}/team?token=${res.token}`);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Invite failed."))
      .finally(() => setBusy(false));
  };

  return (
    <Page>
      <PageHeader title="Team" />
      {msg ? <div className="mb-3"><Alert tone="success">{msg}</Alert></div> : null}
      {err ? <div className="mb-3"><Alert>{err}</Alert></div> : null}
      {loading ? (
        <LoadingPage />
      ) : error ? (
        <Alert>
          {error.includes("upgrade") || error.includes("Pro") ? (
            <>Team is a Pro feature. <Link to="/pricing" className="inline-flex items-center gap-1 text-tungsten hover:underline">See plans <ArrowRight size={13} aria-hidden /></Link></>
          ) : (
            error
          )}
        </Alert>
      ) : !data?.team ? (
        <Card>
          <p className="text-sm text-muted">No team yet. Create one to collaborate.</p>
          <Button
            size="sm"
            className="mt-3"
            onClick={() => {
              motionApi<{ id: string }>(token, "/api/team", {
                method: "POST",
                body: JSON.stringify({ name: "My team" }),
              })
                .then(() => reload())
                .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Create failed."));
            }}
          >
            Create Team
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <p className="text-sm font-semibold">{data.team.name}</p>
            <p className="mt-1 text-xs text-muted">
              Seats: {data.members.length} / {data.team.seat_limit} used
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {data.members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-3 text-sm">
                  <span className="max-w-56 truncate font-mono text-xs">{m.user_id}</span>
                  <span className="text-xs capitalize text-muted">{m.role}</span>
                  {m.role !== "owner" ? (
                    <span className="ml-auto flex gap-2">
                      <button
                        className="text-xs text-muted hover:text-paper"
                        onClick={() => {
                          motionApi(token, `/api/team/members/${encodeURIComponent(m.user_id)}`, {
                            method: "PATCH",
                            body: JSON.stringify({ role: m.role === "editor" ? "viewer" : "editor" }),
                          })
                            .then(() => reload())
                            .catch(() => undefined);
                        }}
                      >
                        Make {m.role === "editor" ? "viewer" : "editor"}
                      </button>
                      <button
                        className="text-xs text-muted hover:text-bad"
                        onClick={() => {
                          if (!confirm("Remove this member?")) return;
                          motionApi(token, `/api/team/members/${encodeURIComponent(m.user_id)}`, { method: "DELETE" })
                            .then(() => reload())
                            .catch(() => undefined);
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <p className="mb-3 text-sm font-semibold">Invite member</p>
            <form onSubmit={invite} className="flex gap-2">
              <div className="flex-1">
                <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" loading={busy} className="mt-6">Invite</Button>
            </form>
            {inviteLink ? (
              <Alert tone="info">
                Share this link (email dispatch wires with your mail provider next):<br />
                <code className="break-all text-xs">{inviteLink}</code>
              </Alert>
            ) : null}
          </Card>
        </div>
      )}
    </Page>
  );
}
