import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth, useUser } from "@slyxup/ui";
import type { ReactNode } from "react";

/** Public marketing shell: header + footer per FRONTEND_DESIGN_PLAN §2.2. */
export function PublicShell({ children }: { children: ReactNode }) {
  const { isSignedIn } = useUser();
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 text-sm">
          <Link to="/" className="font-bold tracking-tight">
            SlyxUp <span className="text-tungsten">Motion</span>
          </Link>
          <div className="hidden items-center gap-5 text-muted md:flex">
            <NavLink to="/features" className="hover:text-paper">Features</NavLink>
            <NavLink to="/use-cases" className="hover:text-paper">Use Cases</NavLink>
            <NavLink to="/pricing" className="hover:text-paper">Pricing</NavLink>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isSignedIn ? (
              <Link
                to="/studio"
                className="inline-flex h-9 items-center rounded-md bg-tungsten px-4 text-sm font-semibold text-ink hover:brightness-110"
              >
                Open Studio
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex h-9 items-center rounded-md px-3 text-sm text-muted hover:text-paper"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex h-9 items-center rounded-md bg-tungsten px-4 text-sm font-semibold text-ink hover:brightness-110"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 text-sm md:grid-cols-4">
          <div>
            <p className="mb-3 text-xs uppercase tracking-widest text-dim">Product</p>
            <div className="flex flex-col gap-2 text-muted">
              <Link to="/features" className="hover:text-paper">Features</Link>
              <Link to="/pricing" className="hover:text-paper">Pricing</Link>
              <Link to="/use-cases" className="hover:text-paper">Use Cases</Link>
              <Link to="/changelog" className="hover:text-paper">Changelog</Link>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs uppercase tracking-widest text-dim">Resources</p>
            <div className="flex flex-col gap-2 text-muted">
              <Link to="/docs" className="hover:text-paper">Docs</Link>
              <Link to="/blog" className="hover:text-paper">Blog</Link>
              <Link to="/templates" className="hover:text-paper">Templates</Link>
              <Link to="/status" className="hover:text-paper">Status</Link>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs uppercase tracking-widest text-dim">Company</p>
            <div className="flex flex-col gap-2 text-muted">
              <Link to="/about" className="hover:text-paper">About</Link>
              <Link to="/contact" className="hover:text-paper">Contact</Link>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs uppercase tracking-widest text-dim">Legal</p>
            <div className="flex flex-col gap-2 text-muted">
              <Link to="/terms" className="hover:text-paper">Terms</Link>
              <Link to="/privacy" className="hover:text-paper">Privacy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

const NAV = [
  { to: "/studio", label: "Studio" },
  { to: "/projects", label: "Projects" },
  { to: "/templates", label: "Templates" },
  { to: "/brand-kit", label: "Brand Kit" },
  { to: "/exports", label: "Exports" },
  { to: "/team", label: "Team" },
  { to: "/billing", label: "Billing" },
  { to: "/settings", label: "Settings" },
];

/** Authenticated app shell: top bar + sidebar per FRONTEND_DESIGN_PLAN §2.2. */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-3">
        <button
          className="rounded-md px-2 py-1 text-lg text-muted hover:text-paper md:hidden"
          aria-label="Open navigation"
          onClick={() => setMenuOpen(true)}
        >
          ≡
        </button>
        <Link to="/studio" className="text-[13px] font-semibold tracking-tight">
          SlyxUp Motion <span className="eyebrow ml-1">studio</span>
        </Link>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted">
          <span className="hidden max-w-48 truncate sm:inline">
            {(user?.email as string) ?? ""}
          </span>
          <button
            className="rounded-md border border-line px-2.5 py-1.5 hover:bg-panel"
            onClick={() => {
              void signOut().then(() => navigate("/"));
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {menuOpen ? (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-label="Navigation">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
            <nav className="absolute left-0 top-0 flex h-full w-56 flex-col gap-1 overflow-y-auto border-r border-line bg-ink p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-[13px] font-semibold">SlyxUp Motion</span>
                <button
                  className="rounded-md px-2 py-1 text-muted hover:text-paper"
                  aria-label="Close navigation"
                  onClick={() => setMenuOpen(false)}
                >
                  ✕
                </button>
              </div>
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-2.5 text-sm transition-colors ${
                      isActive ? "bg-panel text-paper" : "text-muted hover:text-paper"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        ) : null}
        <aside className="hidden w-44 shrink-0 flex-col gap-1 border-r border-line p-2 md:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm transition-colors hover:bg-panel ${
                  isActive
                    ? "border-l-2 border-tungsten bg-panel text-paper"
                    : "text-muted hover:text-paper"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
