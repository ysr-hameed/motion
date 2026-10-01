import { Logo } from "@/components/logo"
import { navigate } from "@/lib/router"

const PRODUCT = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Showcase", href: "#showcase" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
]

const APP = [
  { label: "Projects", href: "/studio" },
  { label: "Editor", href: "/playground" },
  { label: "Settings", href: "/settings" },
]

const LEGAL = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
]

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="flex flex-col items-start gap-3">
            <Logo />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              AI motion graphics for video creators. Describe a clip, refine it
              in words, export for your edit.
            </p>
          </div>
          <nav aria-label="Product">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Product
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {PRODUCT.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="App">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              App
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {APP.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    onClick={(e) => {
                      e.preventDefault()
                      navigate(l.href)
                    }}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Company
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {LEGAL.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    onClick={(e) => {
                      e.preventDefault()
                      navigate(l.href)
                    }}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="mailto:hello@slyxup.com"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  hello@slyxup.com
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-1 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © 2026 SlyxUp. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Projects live in the library · Each video opens in the editor
          </p>
        </div>
      </div>
    </footer>
  )
}
