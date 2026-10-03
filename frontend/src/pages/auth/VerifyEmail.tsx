import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useAuth } from "@slyxup/ui";
import { Alert, AuthShell, Button, Field, LoadingPage } from "~/components/ui";
import { friendlyAuthError } from "~/lib/stack";

export default function VerifyEmail() {
  const { verifyEmail, resendVerification } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setBusy(true);
    verifyEmail(token)
      .then(() => {
        if (!cancelled) setDone(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(friendlyAuthError(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, verifyEmail]);

  if (token && busy && !done && !error) return <LoadingPage label="Verifying your email…" />;

  if (done) {
    return (
      <AuthShell title="Email verified">
        <Alert tone="success">Your email is confirmed. Welcome aboard.</Alert>
        <Button onClick={() => navigate("/studio", { replace: true })}>
          Open Studio
          <ArrowRight size={15} aria-hidden />
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Verify your email"
      subtitle="Enter the email you signed up with to get a fresh link."
    >
      {token && error ? <Alert>{error}</Alert> : null}
      <div className="flex flex-col gap-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={!email.includes("@")}
          onClick={() => {
            setError(null);
            void resendVerification(email.trim())
              .then(() => setResent(true))
              .catch((err: unknown) => setError(friendlyAuthError(err)));
          }}
        >
          {resent ? (
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} className="text-ok" aria-hidden />
              Verification email sent
            </span>
          ) : (
            "Resend verification email"
          )}
        </Button>
        <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-paper">
          <ArrowLeft size={14} aria-hidden />
          Back to login
        </Link>
      </div>
    </AuthShell>
  );
}
