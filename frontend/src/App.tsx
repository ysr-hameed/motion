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
import { usePathRoute } from "@/lib/router"

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
    return shell(<PlaygroundPage studio={studio} projectId={Number(pgMatch[1])} />)
  }

  switch (path) {
    case "/playground":
      return shell(<PlaygroundPage studio={studio} projectId={null} />)
    case "/studio":
      return shell(<StudioPage studio={studio} />)
    case "/settings":
      return shell(<SettingsPage studio={studio} />)
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
