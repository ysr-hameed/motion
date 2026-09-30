import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { auth, authErrorMessage } from "@/lib/auth"
import { navigate } from "@/lib/router"

/** Handles the provider redirect: exchanges slyxup_code via the SDK. */
export function OAuthCallbackPage() {
  const [error, setError] = useState("")
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    auth
      .completeOAuth()
      .then((user) => {
        if (user) navigate("/studio")
        else setError("Nothing to complete — try signing in again.")
      })
      .catch((e) => setError(authErrorMessage(e, "Sign-in failed — try again.")))
  }, [])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-4 text-foreground">
      <Logo />
      {error ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl border bg-card p-7 text-center">
          <p className="font-bold">Sign-in didn't complete</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button className="w-full" onClick={() => navigate("/login")}>
            Back to log in
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Finishing sign-in…
        </p>
      )}
    </div>
  )
}
