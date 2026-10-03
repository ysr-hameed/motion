import { SlyxUpProvider } from "@slyxup/ui";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "~/components/ErrorBoundary";
import { AppShell, PublicShell } from "~/components/layout";
import { RequireAuth } from "~/components/RequireAuth";
import {
  SLYXUP_API_URL,
  SLYXUP_BILLING_URL,
  SLYXUP_PUBLISHABLE_KEY,
} from "~/lib/stack";
import About from "~/pages/About";
import Blog from "~/pages/Blog";
import Changelog from "~/pages/Changelog";
import Contact from "~/pages/Contact";
import Demo from "~/pages/Demo";
import Docs from "~/pages/Docs";
import Features from "~/pages/Features";
import Home from "~/pages/Home";
import Pricing from "~/pages/Pricing";
import Privacy from "~/pages/Privacy";
import Status from "~/pages/Status";
import Terms from "~/pages/Terms";
import UseCases from "~/pages/UseCases";
import Studio from "~/pages/app/Studio";
import Billing from "~/pages/app/Billing";
import BrandKit from "~/pages/app/BrandKit";
import Exports from "~/pages/app/Exports";
import Projects from "~/pages/app/Projects";
import Settings from "~/pages/app/Settings";
import Team from "~/pages/app/Team";
import Templates from "~/pages/app/Templates";
import ForgotPassword from "~/pages/auth/ForgotPassword";
import Login from "~/pages/auth/Login";
import ResetPassword from "~/pages/auth/ResetPassword";
import Signup from "~/pages/auth/Signup";
import VerifyEmail from "~/pages/auth/VerifyEmail";
import "./styles.css";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/features" element={<Features />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/use-cases" element={<UseCases />} />
      <Route path="/about" element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/demo" element={<Demo />} />
      <Route path="/docs" element={<Docs />} />
      <Route path="/blog" element={<Blog />} />
      <Route path="/changelog" element={<Changelog />} />
      <Route path="/status" element={<Status />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />

      <Route path="/login" element={<PublicShell><Login /></PublicShell>} />
      <Route path="/signup" element={<PublicShell><Signup /></PublicShell>} />
      <Route
        path="/forgot-password"
        element={<PublicShell><ForgotPassword /></PublicShell>}
      />
      <Route
        path="/reset-password"
        element={<PublicShell><ResetPassword /></PublicShell>}
      />
      <Route
        path="/verify-email"
        element={<PublicShell><VerifyEmail /></PublicShell>}
      />

      {(
        [
          ["/studio", <Studio />],
          ["/projects", <Projects />],
          ["/templates", <Templates />],
          ["/brand-kit", <BrandKit />],
          ["/exports", <Exports />],
          ["/settings", <Settings />],
          ["/billing", <Billing />],
          ["/team", <Team />],
        ] as const
      ).map(([path, page]) => (
        <Route
          key={path}
          path={path}
          element={
            <RequireAuth>
              <AppShell>
                <ErrorBoundary region={path}>{page}</ErrorBoundary>
              </AppShell>
            </RequireAuth>
          }
        />
      ))}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <SlyxUpProvider
    publishableKey={SLYXUP_PUBLISHABLE_KEY}
    apiUrl={SLYXUP_API_URL}
    billingApiUrl={SLYXUP_BILLING_URL}
    tokenStorage="sessionStorage"
  >
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </SlyxUpProvider>,
);
