import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@slyxup/ui";
import { SlyxupError } from "@slyxup/core";
import { Alert, Button } from "~/components/ui";

/** Completes a provider redirect (?slyxup_code=…) on any auth page. */
export function useOAuthReturn() {
  const { client } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.get("slyxup_code")) return;
    let cancelled = false;
    setBusy(true);
    client.auth
      .completeOAuth()
      .then((res) => {
        if (cancelled) return;
        if (res && "challengeToken" in res) {
          navigate(`/login?challenge=${res.challengeToken}`, { replace: true });
        } else {
          navigate(params.get("returnTo") ?? "/studio", { replace: true });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "OAuth failed.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, params, navigate]);

  return { oauthBusy: busy, oauthError: error };
}

export function OAuthButtons({ mode }: { mode: "in" | "up" }) {
  const { client } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const start = (provider: "google" | "github") => {
    setError(null);
    const back = `${window.location.origin}/login?oauth=1&returnTo=${encodeURIComponent("/studio")}`;
    client.auth.startOAuth(provider, back).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : `${provider} sign-${mode} failed.`);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={() => start("google")}>
        Continue with Google
      </Button>
      <Button variant="secondary" onClick={() => start("github")}>
        Continue with GitHub
      </Button>
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}

export function isTwoFactorChallenge(
  res: unknown,
): res is { challengeToken: string } {
  return (
    !!res &&
    typeof res === "object" &&
    (res as { code?: string }).code === "2FA_REQUIRED" &&
    typeof (res as { challengeToken?: string }).challengeToken === "string"
  );
}

/** Second-factor step after sign-in returns a challenge token. */
export function TwoFactorForm({ challengeToken }: { challengeToken: string }) {
  const { completeSignIn } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        completeSignIn({ challengeToken, code })
          .then(() => navigate("/studio", { replace: true }))
          .catch((err: unknown) =>
            setError(err instanceof Error ? err.message : "Invalid code."),
          )
          .finally(() => setBusy(false));
      }}
    >
      <p className="text-sm text-muted">
        Enter the 6-digit code from your authenticator app.
      </p>
      {error ? <Alert>{error}</Alert> : null}
      <input
        className="h-10 rounded-md border border-line bg-panel px-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-tungsten"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="••••••"
      />
      <Button type="submit" loading={busy}>
        Verify
      </Button>
    </form>
  );
}

export function authErrorMessage(err: unknown): string {
  if (err instanceof SlyxupError) {
    if (err.code === "EMAIL_NOT_VERIFIED") return "EMAIL_NOT_VERIFIED";
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
