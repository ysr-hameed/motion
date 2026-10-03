import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { useAuth } from "@slyxup/ui";
import { Alert, Button, Card, Field, LoadingPage } from "~/components/ui";
import { motionApi } from "~/lib/stack";
import { Page, PageHeader, useMotionGet, useMotionToken } from "./data";

interface MeUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
  preferences: Record<string, unknown> | null;
}

interface SessionRow {
  id: string;
  userAgent: string | null;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
}

/** Settings per FRONTEND_DESIGN_PLAN §3.3.6: profile, security, sessions. */
export default function Settings() {
  const token = useMotionToken();
  const me = useMotionGet<{ user: MeUser; tier: string }>("/api/auth/me");
  const sessions = useMotionGet<{ sessions: SessionRow[] }>("/api/auth/sessions");
  const twofa = useMotionGet<{ enabled: boolean }>("/api/auth/2fa/status");

  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });

  const user = me.data?.user;

  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    motionApi(token, "/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({
        firstName: firstName ?? user?.firstName ?? undefined,
        lastName: lastName ?? user?.lastName ?? undefined,
      }),
    })
      .then(() => {
        setMsg("Profile saved.");
        me.reload();
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Save failed."));
  };

  const changePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    motionApi(token, "/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
    })
      .then(() => {
        setMsg("Password updated.");
        setPw({ current: "", next: "" });
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Update failed."));
  };

  return (
    <Page>
      <PageHeader title="Settings" />
      {msg ? <div className="mb-3"><Alert tone="success">{msg}</Alert></div> : null}
      {err ? <div className="mb-3"><Alert>{err}</Alert></div> : null}
      {me.loading ? (
        <LoadingPage />
      ) : me.error ? (
        <Alert>{me.error}</Alert>
      ) : user ? (
        <div className="flex flex-col gap-4">
          <Card>
            <p className="mb-3 text-sm font-semibold">Profile <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[10px] text-muted">{me.data?.tier}</span></p>
            <form onSubmit={saveProfile} className="flex max-w-md flex-col gap-3">
              <Field label="Email" value={user.email} disabled />
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name" value={firstName ?? user.firstName ?? ""} onChange={(e) => setFirstName(e.target.value)} />
                <Field label="Last name" value={lastName ?? user.lastName ?? ""} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div><Button type="submit" size="sm">Save Changes</Button></div>
            </form>
          </Card>

          <Card>
            <p className="mb-3 text-sm font-semibold">Security</p>
            <form onSubmit={changePassword} className="flex max-w-md flex-col gap-3">
              <Field label="Current password" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              <Field label="New password" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              <div><Button type="submit" size="sm" variant="secondary">Update Password</Button></div>
            </form>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              Two-factor:{" "}
              {twofa.data ? (
                twofa.data.enabled ? (
                  <span className="inline-flex items-center gap-1 text-ok">
                    <Check size={12} aria-hidden /> enabled
                  </span>
                ) : (
                  "not enabled"
                )
              ) : (
                "…"
              )}
            </p>
          </Card>

          <Card>
            <p className="mb-3 text-sm font-semibold">Active sessions</p>            {sessions.loading ? (
              <LoadingPage />
            ) : (
              <div className="flex flex-col gap-2">
                {(sessions.data?.sessions ?? []).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="max-w-64 truncate text-muted">{s.userAgent ?? "Unknown device"}</span>
                    {s.isCurrent ? <span className="text-ok">current</span> : null}
                    {!s.isCurrent ? (
                      <button
                        className="ml-auto text-muted hover:text-bad"
                        onClick={() => {
                          motionApi(token, `/api/auth/sessions/${encodeURIComponent(s.id)}`, { method: "DELETE" })
                            .then(() => sessions.reload())
                            .catch(() => undefined);
                        }}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </div>
                ))}
                <div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      motionApi(token, "/api/auth/sessions/revoke-others", { method: "POST" })
                        .then(() => sessions.reload())
                        .catch(() => undefined);
                    }}
                  >
                    Revoke all others
                  </Button>
                </div>
              </div>
            )}
          </Card>
          <ApiKeysCard token={token} />
          <NotificationsCard token={token} initial={user?.preferences} />
          <TwoFactorCard />
          <DangerZoneCard token={token} />
        </div>
      ) : null}
    </Page>
  );
}

interface KeyRow {
  id: string;
  name: string | null;
  prefix: string;
  last_used_at: number | null;
  created_at: number;
  revoked: number;
}

function NotificationsCard({
  token,
  initial,
}: {
  token: string | undefined;
  initial?: Record<string, unknown> | null;
}) {
  const [product, setProduct] = useState(initial?.notify_product !== false);
  const [exports, setExports] = useState(initial?.notify_exports !== false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = () => {
    setSaving(true);
    setMsg(null);
    motionApi(token, "/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ preferences: { notify_product: product, notify_exports: exports } }),
    })
      .then(() => setMsg("Preferences saved."))
      .catch((e: unknown) => setMsg(e instanceof Error ? e.message : "Save failed."))
      .finally(() => setSaving(false));
  };

  return (
    <Card>
      <p className="mb-1 text-sm font-semibold">Notifications</p>
      <p className="mb-3 text-xs text-muted">Email preferences stored on your profile.</p>
      {msg ? <div className="mb-3"><Alert tone={msg.includes("saved") ? "success" : "error"}>{msg}</Alert></div> : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={product} onChange={(e) => setProduct(e.target.checked)} className="accent-[#ffb340]" />
        Product updates and new templates
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={exports} onChange={(e) => setExports(e.target.checked)} className="accent-[#ffb340]" />
        Export and billing receipts
      </label>
      <div className="mt-3"><Button size="sm" variant="secondary" loading={saving} onClick={save}>Save Preferences</Button></div>
    </Card>
  );
}

function TwoFactorCard() {
  const { client } = useAuth();
  const [status, setStatus] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; provisioningUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    client.twoFactor
      .status()
      .then((s) => setStatus(s.enabled))
      .catch(() => setStatus(null));
  }, [client]);

  const reload = () => {
    client.twoFactor
      .status()
      .then((s) => setStatus(s.enabled))
      .catch(() => setStatus(null));
  };

  const start = () => {
    setBusy(true);
    setErr(null);
    client.twoFactor
      .setup()
      .then((s) => setSetup({ secret: s.secret, provisioningUri: s.provisioningUri }))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Setup failed."))
      .finally(() => setBusy(false));
  };

  const enable = () => {
    if (!setup) return;
    setBusy(true);
    setErr(null);
    client.twoFactor
      .enable(setup.secret, code.replace(/\D/g, ""))
      .then(() => {
        setSetup(null);
        setCode("");
        setMsg("Two-factor enabled. Save your recovery codes from the authenticator setup screen.");
        reload();
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Invalid code."))
      .finally(() => setBusy(false));
  };

  const disable = () => {
    setBusy(true);
    setErr(null);
    client.twoFactor
      .disable(code.replace(/\D/g, ""))
      .then(() => {
        setCode("");
        setMsg("Two-factor disabled.");
        reload();
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Invalid code."))
      .finally(() => setBusy(false));
  };

  return (
    <Card>
      <p className="mb-1 text-sm font-semibold">Two-factor authentication</p>
      <p className="mb-3 flex items-center gap-1.5 text-xs text-muted">
        Status:{" "}
        {status === null ? (
          "…"
        ) : status ? (
          <span className="inline-flex items-center gap-1 text-ok">
            <Check size={12} aria-hidden /> enabled
          </span>
        ) : (
          "not enabled"
        )}
      </p>
      {msg ? <div className="mb-3"><Alert tone="success">{msg}</Alert></div> : null}
      {err ? <div className="mb-3"><Alert>{err}</Alert></div> : null}
      {status ? (
        <div className="flex max-w-md flex-col gap-2">
          <Field label="Authenticator code (to disable)" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          <div><Button size="sm" variant="secondary" loading={busy} onClick={disable}>Disable 2FA</Button></div>
        </div>
      ) : setup ? (
        <div className="flex max-w-md flex-col gap-3">
          <Alert tone="info">
            Scan this secret into your authenticator app, or open the provisioning link:<br />
            <code className="break-all text-xs">{setup.secret}</code><br />
            <a href={setup.provisioningUri} className="inline-flex items-center gap-1 text-tungsten hover:underline">
              Open in authenticator app <ArrowRight size={12} aria-hidden />
            </a>
          </Alert>
          <Field label="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
          <div className="flex gap-2">
            <Button size="sm" loading={busy} onClick={enable}>Enable 2FA</Button>
            <Button size="sm" variant="ghost" onClick={() => setSetup(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" loading={busy} onClick={start}>Enable 2FA</Button>
      )}
    </Card>
  );
}

function ApiKeysCard({ token }: { token: string | undefined }) {
  const keys = useMotionGet<{ keys: KeyRow[] }>("/api/keys");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    motionApi<{ key: string }>(token, "/api/keys", {
      method: "POST",
      body: JSON.stringify({ name: name || undefined }),
    })
      .then((res) => {
        setCreated(res.key);
        setName("");
        keys.reload();
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Create failed."));
  };

  return (
    <Card>
      <p className="mb-1 text-sm font-semibold">API Keys <span className="ml-1 text-[10px] font-normal text-dim">Business</span></p>
      <p className="mb-3 text-xs text-muted">Call the Motion REST API with <code>X-API-Key</code>. Keys are shown once.</p>
      {err ? <div className="mb-3"><Alert>{err}</Alert></div> : null}
      {created ? (
        <div className="mb-3"><Alert tone="success">Copy now — never shown again:<br /><code className="break-all text-xs">{created}</code></Alert></div>
      ) : null}
      {keys.loading ? (
        <LoadingPage />
      ) : keys.error ? (
        <Alert>{keys.error}</Alert>
      ) : (
        <div className="mb-3 flex flex-col gap-1.5">
          {(keys.data?.keys ?? []).length === 0 ? (
            <p className="text-xs text-muted">No keys yet.</p>
          ) : (
            (keys.data?.keys ?? []).map((k) => (
              <div key={k.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono">sk_live_{k.prefix}…</span>
                <span className="text-muted">{k.name ?? "Unnamed"}</span>
                {k.revoked ? <span className="text-bad">revoked</span> : null}
                {!k.revoked ? (
                  <button
                    className="ml-auto text-muted hover:text-bad"
                    onClick={() => {
                      if (!confirm("Revoke this key?")) return;
                      motionApi(token, `/api/keys/${encodeURIComponent(k.id)}`, { method: "DELETE" })
                        .then(() => keys.reload())
                        .catch(() => undefined);
                    }}
                  >
                    Revoke
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}
      <form onSubmit={create} className="flex gap-2">
        <div className="flex-1">
          <Field label="Key name" value={name} onChange={(e) => setName(e.target.value)} placeholder="CI deploy" />
        </div>
        <Button type="submit" size="sm" className="mt-6">Create Key</Button>
      </form>
    </Card>
  );
}

function DangerZoneCard({ token }: { token: string | undefined }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card>
      <p className="mb-1 text-sm font-semibold text-bad">Danger Zone</p>
      <p className="mb-3 text-xs text-muted">Permanently removes your Motion profile, projects and data. Stack auth identity is unaffected.</p>
      {!confirming ? (
        <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
          Delete My Account
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              motionApi(token, "/api/auth/account", { method: "DELETE" })
                .catch(() => undefined)
                .finally(() => {
                  void signOut().then(() => navigate("/", { replace: true }));
                });
            }}
          >
            Yes, delete everything
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}
