import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PasswordStrength, useAuth } from "@slyxup/ui";
import { Alert, AuthShell, Button, Field } from "~/components/ui";
import { friendlyAuthError } from "~/lib/stack";

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <AuthShell title="Invalid reset link">
        <Alert>This link is missing its token. Request a fresh one.</Alert>
        <Link to="/forgot-password" className="inline-flex items-center gap-1 text-sm text-tungsten hover:underline">
          Request a new link <ArrowRight size={13} aria-hidden />
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          resetPassword(token, password)
            .then(() => navigate("/login?reset=1", { replace: true }))
            .catch((err: unknown) => setError(friendlyAuthError(err)))
            .finally(() => setBusy(false));
        }}
      >
        {error ? <Alert>{error}</Alert> : null}
        <Field
          label="New password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {password ? <PasswordStrength password={password} /> : null}
        <Button type="submit" loading={busy}>
          Update Password
        </Button>
      </form>
    </AuthShell>
  );
}
