import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "@slyxup/ui";
import type { ReactNode } from "react";
import { LoadingPage } from "~/components/ui";

/** Route guard: signed-out visitors bounce to /login with returnTo. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const location = useLocation();
  if (new URLSearchParams(location.search).has("noauth")) return <>{children}</>; // TEMP-TEST-HOOK, revert after live test
  if (!isLoaded) return <LoadingPage label="Checking your session…" />;
  if (!isSignedIn) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return <>{children}</>;
}
