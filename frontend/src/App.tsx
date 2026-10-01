import { LandingPage } from "@/pages/landing-page"
import { StudioPage } from "@/pages/studio-page"
import { PlaygroundPage } from "@/pages/playground-page"
import { SettingsPage } from "@/pages/settings-page"
import { PrivacyPage, TermsPage } from "@/pages/legal"
import {
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  SignupPage,
} from "@/pages/auth-pages"
import { OAuthCallbackPage } from "@/pages/oauth-callback-page"
import { useMotionStudio } from "@/lib/use-motion-studio"
import { navigate, usePathRoute } from "@/lib/router"
import { isAuthConfigured, useAuthState } from "@/lib/auth"
import { useEffect } from "react"

/**
 * Account protection: studio, editor and settings require a session.
 * Landing, auth and legal pages stay public. When auth isn't configured
 * (no publishable key) everything stays open for local dev.
 */
function RequireAccount({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthState()

  useEffect(() => {
    if (!loading && !user && isAuthConfigured()) {
      navigate("/login", { replace: true })
    }
  }, [loading, user])

  if (isAuthConfigured() && (loading || !user)) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {loading ? "Checking your session…" : "Redirecting to sign in…"}
        </div>
      </div>
    )
  }
  return <>{children}</>
}

export default function App() {
  // One shared studio brain for dashboard + playground.
  const studio = useMotionStudio()
  const path = usePathRoute()

  const shell = (page: React.ReactNode) => (
    <>
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById("main-content")?.focus()
          document.getElementById("main-content")?.scrollIntoView()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      {page}
    </>
  )

  // /playground/123 — project slug; bare /playground handled in-page.
  const pgMatch = path.match(/^\/playground\/(\d+)$/)
  if (pgMatch) {
    return shell(
      <RequireAccount>
        <PlaygroundPage studio={studio} projectId={Number(pgMatch[1])} />
      </RequireAccount>
    )
  }

  switch (path) {
    case "/playground":
      return shell(
        <RequireAccount>
          <PlaygroundPage studio={studio} projectId={null} />
        </RequireAccount>
      )
    case "/studio":
      return shell(
        <RequireAccount>
          <StudioPage studio={studio} />
        </RequireAccount>
      )
    case "/settings":
      return shell(
        <RequireAccount>
          <SettingsPage studio={studio} />
        </RequireAccount>
      )
    case "/privacy":
      return shell(<PrivacyPage />)
    case "/terms":
      return shell(<TermsPage />)
    case "/login":
      return shell(<LoginPage />)
    case "/signup":
      return shell(<SignupPage />)
    case "/forgot-password":
      return shell(<ForgotPasswordPage />)
    case "/reset-password":
      return shell(<ResetPasswordPage />)
    case "/auth/callback":
      return shell(<OAuthCallbackPage />)
    default:
      return shell(<LandingPage />)
  }
}
