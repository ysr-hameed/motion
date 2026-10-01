import { useEffect, useState } from "react"
import { ArrowRight, PanelLeft, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { UserButton } from "@/components/user-button"
import { cn } from "@/lib/utils"

const NAV = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Showcase", href: "#showcase" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
]

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 transition-all",
          // Glass + a shadow that only appears once content is scrolled
          // under it: without the shadow a translucent bar on a busy page
          // reads as a seam rather than as elevation.
          scrolled
            ? "border-b border-border bg-background/80 shadow-elev-2 backdrop-blur-xl"
            : "border-b border-transparent bg-background/40 backdrop-blur-sm"
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <PanelLeft />
          </Button>

          <Logo />

          <nav
            className="mx-auto hidden items-center gap-1 lg:flex"
            aria-label="Primary"
          >
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground interactive focus-ring hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex-1 lg:hidden" />

          <div className="flex items-center gap-2">
            <a
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground interactive focus-ring hover:bg-muted hover:text-foreground sm:block"
            >
              Sign in
            </a>
            <Button asChild>
              <a href="/studio">
                Start creating
                <ArrowRight />
              </a>
            </Button>
            <UserButton />
          </div>
        </div>
      </header>

      <div
        aria-hidden={!open}
        className={cn("fixed inset-0 z-50 lg:hidden", !open && "pointer-events-none")}
      >
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/40 transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0"
          )}
        />
        <aside
          className={cn(
            "absolute left-0 top-0 flex h-full w-80 max-w-[85vw] flex-col overscroll-contain bg-background shadow-2xl transition-transform duration-300 ease-out",
            open ? "translate-x-0" : "-translate-x-full"
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="flex h-16 items-center justify-between border-b px-4">
            <Logo />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X />
            </Button>
          </div>
          <nav
            className="flex flex-1 flex-col gap-1 overflow-y-auto p-4"
            aria-label="Mobile"
          >
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-3 text-[15px] font-medium transition-colors hover:bg-muted"
              >
                {item.label}
              </a>
            ))}
            <a
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-3 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Sign in
            </a>
            <a
              href="/signup"
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-3 text-[15px] font-medium transition-colors hover:bg-muted"
            >
              Create account
            </a>
          </nav>
          <div className="border-t p-4">
            <Button className="w-full" asChild onClick={() => setOpen(false)}>
              <a href="/studio">
                Start creating
                <ArrowRight />
              </a>
            </Button>
          </div>
        </aside>
      </div>
    </>
  )
}
