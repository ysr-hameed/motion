import { useState } from "react"
import { LayoutDashboard, LogOut, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { auth, useUser, userInitials } from "@/lib/auth"
import { navigate } from "@/lib/router"

export function UserButton({
  align = "right",
  side = "bottom",
  hideLoginButton = false,
}: {
  /** Horizontal edge of the avatar the menu aligns to. */
  align?: "left" | "right"
  /** Whether the menu opens below the avatar or above it. */
  side?: "top" | "bottom"
  /** Return null when logged out (headers that already offer Sign in). */
  hideLoginButton?: boolean
}) {
  const user = useUser()
  const [open, setOpen] = useState(false)

  if (!user) {
    if (hideLoginButton) return null
    return (
      <Button variant="ghost" onClick={() => navigate("/login")}>
        Log in
      </Button>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex size-8 items-center justify-center rounded-full border border-primary/50 bg-background text-[13px] font-bold text-primary transition-transform hover:scale-105"
      >
        {userInitials(user)}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className={`absolute z-50 w-56 overflow-hidden rounded-xl border bg-popover shadow-xl ${
              side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
            } ${align === "left" ? "left-0" : "right-0"}`}
          >
            <div className="border-b px-3.5 py-2.5">
              <p className="text-[13px] font-semibold">{user.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {user.email}
              </p>
            </div>
            <div className="p-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  navigate("/studio")
                }}
                className="flex w-full items-center gap-2 rounded-full px-2.5 py-1.5 text-[13px] transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <LayoutDashboard className="size-4 text-muted-foreground" />
                Open studio
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  navigate("/settings")
                }}
                className="flex w-full items-center gap-2 rounded-full px-2.5 py-1.5 text-[13px] transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Settings className="size-4 text-muted-foreground" />
                Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  auth.logout()
                  setOpen(false)
                  navigate("/")
                }}
                className="flex w-full items-center gap-2 rounded-full px-2.5 py-1.5 text-[13px] transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="size-4 text-muted-foreground" />
                Log out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
