import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, useUser } from "@slyxup/ui";
import { Alert, AuthShell, Button, Field } from "~/components/ui";
import { friendlyAuthError } from "~/lib/stack";
import {
  OAuthButtons,
  TwoFactorForm,
  authErrorMessage,
  isTwoFactorChallenge,
  useOAuthReturn,
} from "./shared";

export default function Login() {
  const { signIn, resendVerification } = useAuth();
  const { isLoaded, isSignedIn } = useUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { oauthBusy, oauthError } = useOAuthReturn();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(
    params.get("challenge"),
  );
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  if (isLoaded && isSignedIn && !challenge) {
    navigate(params.get("returnTo") ?? "/studio", { replace: true });
    return null;
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUnverified(false);
    setBusy(true);
    signIn({ email: email.trim(), password })
      .then((res) => {
        if (isTwoFactorChallenge(res)) {
          setChallenge(res.challengeToken);
          return;
        }
        navigate(params.get("returnTo") ?? "/studio", { replace: true });
      })
      .catch((err: unknown) => {
        if (authErrorMessage(err) === "EMAIL_NOT_VERIFIED") {
          setUnverified(true);
          setError("Verify your email before signing in.");
        } else {
          setError(friendlyAuthError(err));
        }
      })
      .finally(() => setBusy(false));
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle={
        <>
          Don't have an account?{" "}
          <Link to="/signup" className="text-tungsten hover:underline">
            Sign up free
          </Link>
        </>
      }
    >
      {challenge ? (
        <TwoFactorForm challengeToken={challenge} />
      ) : (
        <>
          {oauthError ? <Alert>{oauthError}</Alert> : null}
          {oauthBusy ? <Alert tone="info">Finishing Google/GitHub sign-in…</Alert> : null}
          <OAuthButtons mode="in" />
          <div className="flex items-center gap-3 text-xs text-dim">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <form onSubmit={submit} className="flex flex-col gap-4">
            {error ? <Alert>{error}</Alert> : null}
            {unverified ? (
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  void resendVerification(email.trim())
                    .then(() => setResent(true))
                    .catch((err: unknown) => setError(friendlyAuthError(err)));
                }}
              >
                {resent ? "Verification email sent ✓" : "Resend verification email"}
              </Button>
            ) : null}
            <Field
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              label="Password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex items-center justify-between text-sm">
              <Link to="/forgot-password" className="text-muted hover:text-paper">
                Forgot password?
              </Link>
              <Button type="submit" loading={busy}>
                Sign In →
              </Button>
            </div>
          </form>
        </>
      )}
    </AuthShell>
  );
}
