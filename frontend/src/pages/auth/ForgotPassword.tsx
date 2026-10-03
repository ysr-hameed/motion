import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@slyxup/ui";
import { Alert, AuthShell, Button, Field } from "~/components/ui";
import { SLYXUP_PROJECT_ID, friendlyAuthError } from "~/lib/stack";

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <AuthShell title="Check your inbox">
        <Alert tone="success">
          If an account exists for <strong>{email}</strong>, a reset link is on its way.
        </Alert>
        <Link to="/login" className="text-sm text-tungsten hover:underline">
          ← Back to login
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email you signed up with."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          forgotPassword(email.trim(), SLYXUP_PROJECT_ID)
            .then(() => setSent(true))
            .catch((err: unknown) => setError(friendlyAuthError(err)))
            .finally(() => setBusy(false));
        }}
      >
        {error ? <Alert>{error}</Alert> : null}
        <Field
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" loading={busy}>
          Send Reset Link
        </Button>
        <Link to="/login" className="text-sm text-muted hover:text-paper">
          ← Back to login
        </Link>
      </form>
    </AuthShell>
  );
}
