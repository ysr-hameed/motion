import { Logo } from "@/components/logo"
import { navigate } from "@/lib/router"

const PRODUCT = [
  { label: "Features", href: "#features" },
  { label: "Showcase", href: "#showcase" },
  { label: "Templates", href: "#templates" },
  { label: "Pricing", href: "#pricing" },
]

const LEGAL = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
]

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-10 sm:grid-cols-[1.2fr_1fr_1fr]">
          <div className="flex flex-col items-start gap-4">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">
              Prompt-to-clip motion graphics for video creators. Made by
              SlyxUp.
            </p>
          </div>
          <nav aria-label="Product">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Legal
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
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Contact
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
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
        <div className="mt-12 border-t pt-6">
          <p className="text-xs text-muted-foreground">
            © 2026 SlyxUp. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
