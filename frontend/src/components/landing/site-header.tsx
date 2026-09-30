import { useEffect, useState } from "react"
import { PanelLeft, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { UserButton } from "@/components/user-button"
import { cn } from "@/lib/utils"

const NAV = [
  { label: "Features", href: "#features" },
  { label: "Showcase", href: "#showcase" },
  { label: "Templates", href: "#templates" },
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

  // lock body scroll while the sidebar is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [open ])

  // close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open ])

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 transition-all",
          scrolled
            ? "border-b bg-background/80 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
          {/* left: menu (mobile) */}
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <PanelLeft />
          </Button>

          <Logo />

          {/* center: nav (desktop) */}
          <nav
            className="mx-auto hidden items-center gap-1 lg:flex"
            aria-label="Primary"
          >
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex-1 lg:hidden" />

          {/* right: CTA + account (desktop) */}
          <div className="flex items-center lg:hidden">
            <UserButton />
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <Button asChild>
              <a href="/studio">
                <Sparkles />
                Open dashboard
              </a>
            </Button>
            <UserButton />
          </div>
        </div>
      </header>

      {/* left slide-over sidebar (mobile) */}
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
            "absolute left-0 top-0 flex h-full w-80 max-w-[85vw] flex-col rounded-r-3xl bg-background shadow-2xl transition-transform duration-300 ease-out",
            open ? "translate-x-0" : "-translate-x-full"
          )}
          role="dialog"
          aria-label="Menu"
        >
          <div className="flex h-16 items-center justify-between border-b px-4">
            <Logo />
            <Button
              variant="outline"
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
            {NAV.map((item, i) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                style={{ transitionDelay: open ? `${80 + i * 50}ms` : "0ms" }}
                className={cn(
                  "rounded-2xl px-4 py-3 text-base font-medium transition-all duration-300 hover:bg-accent hover:text-accent-foreground",
                  open ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"
                )}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="border-t p-4">
            <Button className="w-full" asChild onClick={() => setOpen(false)}>
              <a href="/studio">
                <Sparkles />
                Open dashboard
              </a>
            </Button>
          </div>
        </aside>
      </div>
    </>
  )
}
