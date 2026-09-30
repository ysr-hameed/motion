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

  // /playground/123 — project slug; bare /playground handled in-page.
  const pgMatch = path.match(/^\/playground\/(\d+)$/)
  if (pgMatch) {
    return <PlaygroundPage studio={studio} projectId={Number(pgMatch[1])} />
  }

  switch (path) {
    case "/playground":
      return <PlaygroundPage studio={studio} projectId={null} />
    case "/studio":
      return <StudioPage studio={studio} />
    case "/settings":
      return <SettingsPage studio={studio} />
    case "/privacy":
      return <PrivacyPage />
    case "/terms":
      return <TermsPage />
    case "/login":
      return <LoginPage />
    case "/signup":
      return <SignupPage />
    case "/forgot-password":
      return <ForgotPasswordPage />
    case "/reset-password":
      return <ResetPasswordPage />
    case "/auth/callback":
      return <OAuthCallbackPage />
    default:
      return <LandingPage />
  }
}
