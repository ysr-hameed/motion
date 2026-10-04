import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PasswordStrength } from "@slyxup/ui";
import { useAuth, useUser } from "@slyxup/ui";
import { Alert, AuthShell, Button, Field } from "~/components/ui";
import { friendlyAuthError } from "~/lib/stack";
import { OAuthButtons, authErrorMessage, useOAuthReturn } from "./shared";

export default function Signup() {
  const { signUp } = useAuth();
  const { isLoaded, isSignedIn } = useUser();
  const navigate = useNavigate();
  const { oauthError } = useOAuthReturn();

  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerify, setNeedsVerify] = useState(false);

  if (isLoaded && isSignedIn) {
    navigate("/studio", { replace: true });
    return null;
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      setError("Please agree to the Terms & Privacy Policy.");
      return;
    }
    setError(null);
    setBusy(true);
    signUp({ email: email.trim(), password, firstName: firstName.trim() || undefined })
      .then(() => {
        // Password sign-up requires email verification before first sign-in.
        setNeedsVerify(true);
      })
      .catch((err: unknown) => setError(authErrorMessage(err) || friendlyAuthError(err)))
      .finally(() => setBusy(false));
  };

  if (needsVerify) {
    return (
      <AuthShell title="Check your inbox">
        <Alert tone="success">
          Account created. We sent a verification link to <strong>{email}</strong> —
          verify it, then sign in.
        </Alert>
        <Link to="/login">
          <Button className="w-full">Continue to login <ArrowRight size={15} aria-hidden /></Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your free account"
      subtitle={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-tungsten hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {oauthError ? <Alert>{oauthError}</Alert> : null}
      <OAuthButtons mode="up" />
      <div className="flex items-center gap-3 text-xs text-dim">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field
          label="Full Name"
          autoComplete="name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <Field
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <Field
            label="Password"
            type="password"
            required
            autoComplete="new-password"
            hint="Minimum 8 characters."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {password ? <PasswordStrength password={password} /> : null}
        </div>
        <label className="flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 accent-[#d94800]"
          />
          I agree to the Terms &amp; Privacy Policy
        </label>
        <Button type="submit" loading={busy}>
          Create Account <ArrowRight size={15} aria-hidden />
        </Button>
      </form>
    </AuthShell>
  );
}
