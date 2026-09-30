import { useState } from "react"
import { KeyRound, LogIn, MailCheck, UserPlus } from "lucide-react"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { auth, authErrorMessage, isAuthConfigured } from "@/lib/auth"
import { navigate } from "@/lib/router"
import { cn } from "@/lib/utils"

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  )
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.15c0 .3.2.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  )
}

function OAuthButtons({ mode }: { mode: "in" | "up" }) {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<"google" | "github" | null>(null)

  const go = async (provider: "google" | "github") => {
    setError("")
    setBusy(provider)
    try {
      await auth.startOAuth(provider)
      // Redirects away to the provider — code below rarely runs.
    } catch (e) {
      setBusy(null)
      setError(authErrorMessage(e, "Social sign-in failed — try email instead."))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => go("google")}
          aria-label={`${mode === "in" ? "Log in" : "Sign up"} with Google`}
        >
          <GoogleIcon className="size-4" />
          Google
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => go("github")}
          aria-label={`${mode === "in" ? "Log in" : "Sign up"} with GitHub`}
        >
          <GitHubIcon className="size-4" />
          GitHub
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function Divider() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

function AuthShell({
  title,
  sub,
  children,
}: {
  title: string
  sub: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12 text-foreground">
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault()
          navigate("/")
        }}
        aria-label="SlyxUp home"
      >
        <Logo />
      </a>
      <div className="mt-8 w-full max-w-sm rounded-3xl border bg-card p-7">
        <h1 className="text-center text-xl font-bold">{title}</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">{sub}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function LoginPage() {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [resent, setResent] = useState(false)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const email = String(data.get("email") ?? "").trim()
    const password = String(data.get("password") ?? "")
    if (!email || !password) {
      setError("Enter your email and password to continue.")
      return
    }
    if (!EMAIL_RE.test(email)) {
      setError("That email doesn't look right — double-check it?")
      return
    }
    setError("")
    setBusy(true)
    try {
      const res = await auth.loginEmail(email, password)
      if ("challenge" in res) {
        setChallengeToken(res.challengeToken)
      } else if ("unverified" in res) {
        setUnverifiedEmail(email)
      } else {
        navigate("/studio")
      }
    } catch (err) {
      const msg = authErrorMessage(err, "Log-in failed — please try again.")
      if (msg.startsWith("Email not verified")) setUnverifiedEmail(email)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const submitChallenge = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const code = String(new FormData(e.currentTarget).get("code") ?? "").trim()
    if (!code || !challengeToken) return
    setError("")
    setBusy(true)
    try {
      await auth.completeChallenge(challengeToken, code)
      navigate("/studio")
    } catch (err) {
      setError(authErrorMessage(err, "Invalid code — try again."))
    } finally {
      setBusy(false)
    }
  }

  const resend = async (email: string) => {
    try {
      await auth.resendVerification(email)
      setResent(true)
    } catch (err) {
      setError(authErrorMessage(err, "Couldn't resend — try again later."))
    }
  }

  if (!isAuthConfigured()) {
    return (
      <AuthShell title="Auth not configured" sub="The backend key is missing.">
        <p className="text-center text-sm text-muted-foreground">
          Set <code className="rounded bg-muted px-1 font-mono text-xs">VITE_SLYXUP_PUBLISHABLE_KEY</code>{" "}
          (see .env.example) to enable real sign-in.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Welcome back" sub="Log in to your Motion workspace.">
      {challengeToken ? (
        <form onSubmit={submitChallenge} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Two-factor is on — enter the code from your authenticator app.
          </p>
          <Input
            name="code"
            inputMode="numeric"
            placeholder="6-digit code"
            className="rounded-2xl text-center tracking-[0.3em]"
            aria-label="Two-factor code"
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            <KeyRound />
            Verify
          </Button>
        </form>
      ) : unverifiedEmail ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{unverifiedEmail}</span>{" "}
            isn't verified yet. Check your inbox for the link.
          </p>
          <Button
            variant="outline"
            className="w-full"
            disabled={resent}
            onClick={() => resend(unverifiedEmail)}
          >
            {resent ? "Link resent — check inbox" : "Resend verification link"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUnverifiedEmail(null)}
          >
            Back to log in
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <OAuthButtons mode="in" />
          <Divider />
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input name="email" type="email" placeholder="Email" className="rounded-2xl" aria-label="Email" />
            <Input
              name="password"
              type="password"
              placeholder="Password"
              className="rounded-2xl"
              aria-label="Password"
            />
            <div className="text-right">
              <a
                href="/forgot-password"
                onClick={(e) => {
                  e.preventDefault()
                  navigate("/forgot-password")
                }}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
              </a>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              <LogIn />
              {busy ? "Logging in…" : "Log in"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            New here?{" "}
            <a
              href="/signup"
              onClick={(e) => {
                e.preventDefault()
                navigate("/signup")
              }}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Create an account
            </a>
          </p>
        </div>
      )}
    </AuthShell>
  )
}

export function SignupPage() {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState("Free plan")

  if (!isAuthConfigured()) {
    return (
      <AuthShell title="Auth not configured" sub="The backend key is missing.">
        <p className="text-center text-sm text-muted-foreground">
          Set <code className="rounded bg-muted px-1 font-mono text-xs">VITE_SLYXUP_PUBLISHABLE_KEY</code>{" "}
          (see .env.example) to enable real sign-up.
        </p>
      </AuthShell>
    )
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const name = String(data.get("name") ?? "").trim()
    const email = String(data.get("email") ?? "").trim()
    const password = String(data.get("password") ?? "")
    if (!name || !email || !password) {
      setError("Fill in every field to create your account.")
      return
    }
    if (!EMAIL_RE.test(email)) {
      setError("That email doesn't look right — double-check it?")
      return
    }
    if (password.length < 8) {
      setError("Password needs at least 8 characters.")
      return
    }
    setError("")
    setBusy(true)
    try {
      await auth.signupEmail(name, email, password)
      navigate("/studio")
    } catch (err) {
      setError(authErrorMessage(err, "Sign-up failed — please try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Create your account" sub="Free to start, no card needed.">
      <div className="flex flex-col gap-4">
        <OAuthButtons mode="up" />
        <Divider />
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input name="name" placeholder="Name" className="rounded-2xl" aria-label="Name" />
          <Input name="email" type="email" placeholder="Email" className="rounded-2xl" aria-label="Email" />
          <Input
            name="password"
            type="password"
            placeholder="Password (8+ characters)"
            className="rounded-2xl"
            aria-label="Password"
          />
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Plan">
            {["Free plan", "Pro plan"].map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={plan === p}
                onClick={() => setPlan(p)}
                className={cn(
                  "rounded-2xl border px-3 py-2.5 text-sm font-medium transition-colors",
                  plan === p
                    ? "border-primary bg-primary/5 text-foreground"
                    : "text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {p}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            <UserPlus />
            {busy ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Have an account?{" "}
          <a
            href="/login"
            onClick={(e) => {
              e.preventDefault()
              navigate("/login")
            }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Log in
          </a>
        </p>
      </div>
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim()
    if (!email) {
      setError("Enter your account email first.")
      return
    }
    if (!EMAIL_RE.test(email)) {
      setError("That email doesn't look right — double-check it?")
      return
    }
    setError("")
    setBusy(true)
    try {
      await auth.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(authErrorMessage(err, "Couldn't send the link — try again later."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Reset password" sub="We'll email you a reset link.">
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MailCheck className="size-6" />
          </span>
          <p className="font-bold">Check your inbox</p>
          <p className="text-sm text-muted-foreground">
            If an account exists for that email, a reset link is on its way.
          </p>
          <Button
            variant="outline"
            className="mt-2 w-full"
            onClick={() => navigate("/login")}
          >
            Back to log in
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input name="email" type="email" placeholder="Email" className="rounded-2xl" aria-label="Email" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            <KeyRound />
            {busy ? "Sending…" : "Send reset link"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <a
              href="/login"
              onClick={(e) => {
                e.preventDefault()
                navigate("/login")
              }}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Log in
            </a>
          </p>
        </form>
      )}
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const token = new URLSearchParams(window.location.search).get("token") ?? ""

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const pw = String(data.get("password") ?? "")
    const pw2 = String(data.get("confirm") ?? "")
    if (!pw || !pw2) {
      setError("Enter and confirm your new password.")
      return
    }
    if (pw.length < 8) {
      setError("Password needs at least 8 characters.")
      return
    }
    if (pw !== pw2) {
      setError("Passwords don't match — try again.")
      return
    }
    setError("")
    setBusy(true)
    try {
      await auth.resetPassword(token, pw)
      setDone(true)
    } catch (err) {
      setError(
        authErrorMessage(err, "This link expired — request a fresh one below.")
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Choose a new password" sub="Make it a good one.">
      {!token ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-sm text-muted-foreground">
            This reset link is invalid or expired.
          </p>
          <Button className="w-full" onClick={() => navigate("/forgot-password")}>
            Request a fresh link
          </Button>
        </div>
      ) : done ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MailCheck className="size-6" />
          </span>
          <p className="font-bold">Password updated</p>
          <p className="text-sm text-muted-foreground">
            Log in with your new password to continue.
          </p>
          <Button className="mt-2 w-full" onClick={() => navigate("/login")}>
            <LogIn />
            Log in
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            name="password"
            type="password"
            placeholder="New password (8+ characters)"
            className="rounded-2xl"
            aria-label="New password"
          />
          <Input
            name="confirm"
            type="password"
            placeholder="Confirm new password"
            className="rounded-2xl"
            aria-label="Confirm new password"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            <KeyRound />
            {busy ? "Saving…" : "Set new password"}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
