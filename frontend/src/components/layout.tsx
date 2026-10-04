import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Clapperboard,
  CreditCard,
  Download,
  Folders,
  LayoutTemplate,
  LogOut,
  Menu,
  Plus,
  Settings,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth, useUser } from "@slyxup/ui";
import type { ReactNode } from "react";
import { Logo } from "./ui";

/** Public marketing shell: floating glass header + rich footer. */
export function PublicShell({ children }: { children: ReactNode }) {
  const { isSignedIn } = useUser();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `relative px-1 py-1 transition-colors ${isActive ? "text-paper" : "text-muted hover:text-paper"} after:absolute after:-bottom-0.5 after:left-0 after:h-px after:transition-all after:duration-300 ${isActive ? "after:w-full after:bg-tungsten" : "after:w-0 after:bg-tungsten hover:after:w-full"}`;

  return (
    <div className="flex min-h-full flex-col">
      {/* announcement bar */}
      <div className="z-20 flex items-center justify-center gap-2 bg-paper px-4 py-1.5 text-xs text-ink">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-tungsten" aria-hidden />
        <p className="font-medium">
          7 directing models live — free tier, no credit card
        </p>
        <Link to="/pricing" className="hidden font-bold text-tungsten-bright underline-offset-2 hover:underline sm:inline">
          See plans
        </Link>
      </div>
      <header
        className={`sticky top-0 z-10 bg-transparent transition-all duration-300 ${scrolled ? "glass border-b border-line shadow-[0_8px_32px_-12px_rgb(0_0_0/0.8)]" : "border-b border-transparent bg-transparent"}`}
      >
        <nav className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 text-sm md:px-6">
          <Logo />
          <div className="hidden items-center gap-5 lg:flex">
            <NavLink to="/features" className={linkCls}>Features</NavLink>
            <NavLink to="/use-cases" className={linkCls}>Use Cases</NavLink>
            <NavLink to="/pricing" className={linkCls}>Pricing</NavLink>
            <NavLink to="/docs" className={linkCls}>Docs</NavLink>
            <NavLink to="/blog" className={linkCls}>Blog</NavLink>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isSignedIn ? (
              <Link
                to="/studio"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-paper px-4 text-sm font-bold text-ink transition-colors hover:bg-tungsten hover:text-white"
              >
                Open Studio
                <ArrowRight size={15} aria-hidden />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden h-10 items-center rounded-lg px-4 text-sm text-muted transition-colors hover:text-paper sm:inline-flex"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-paper px-4 text-sm font-bold text-ink transition-colors hover:bg-tungsten hover:text-white"
                >
                  Start Free
                  <ArrowRight size={15} aria-hidden />
                </Link>
              </>
            )}
            <button
              className="rounded-md p-2 text-muted hover:text-paper lg:hidden"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} aria-hidden />
            </button>
          </div>
        </nav>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="Menu">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <nav className="glass absolute right-0 top-0 flex h-full w-72 flex-col gap-1 border-l border-line p-4">
            <div className="mb-3 flex items-center justify-between">
              <Logo compact />
              <button aria-label="Close menu" className="rounded-md p-2 text-muted hover:text-paper" onClick={() => setMobileOpen(false)}>
                <X size={18} aria-hidden />
              </button>
            </div>
            {[["Features", "/features"], ["Use Cases", "/use-cases"], ["Pricing", "/pricing"], ["Docs", "/docs"], ["Blog", "/blog"], ["About", "/about"], ["Contact", "/contact"]].map(([label, to]) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `rounded-lg px-3 py-2.5 text-[15px] ${isActive ? "bg-tungsten/10 text-tungsten" : "text-muted hover:bg-panel hover:text-paper"}`}
              >
                {label}
              </NavLink>
            ))}
            <Link to="/signup" onClick={() => setMobileOpen(false)} className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-paper font-bold text-ink">
              Start Free <ArrowRight size={16} aria-hidden />
            </Link>
          </nav>
        </div>
      ) : null}

      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteFooter() {
  const cols: Array<[string, Array<[string, string]>]> = [
    ["Product", [["Features", "/features"], ["Pricing", "/pricing"], ["Use Cases", "/use-cases"], ["Templates", "/templates"], ["Changelog", "/changelog"], ["Live Demo", "/demo"]]],
    ["Resources", [["Docs", "/docs"], ["Blog", "/blog"], ["Status", "/status"], ["Support", "/contact"]]],
    ["Company", [["About", "/about"], ["Contact", "/contact"]]],
    ["Legal", [["Terms", "/terms"], ["Privacy", "/privacy"]]],
  ];
  return (
    <footer className="relative overflow-hidden border-t border-line">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[52rem] -translate-x-1/2 rounded-full bg-tungsten/[0.07] blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-4 py-14 md:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              The AI director for motion graphics. Brief in words, watch scenes
              build live, export anywhere.
            </p>
            <div className="mt-5 flex items-center gap-2  text-[11px] text-dim">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-ok" />
              all systems rendering
              <Link to="/status" className="ml-2 text-muted underline-offset-2 hover:text-paper hover:underline">status</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {cols.map(([title, links]) => (
              <div key={title}>
                <p className="eyebrow mb-4">{title}</p>
                <div className="flex flex-col gap-2.5 text-sm">
                  {links.map(([label, to]) => (
                    <Link key={label} to={to} className="w-fit text-muted transition-all hover:translate-x-0.5 hover:text-paper">
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rule-glow mt-12" />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-dim">
          <p>© {new Date().getFullYear()} SlyxUp Motion. Directed by machines, finished by you.</p>
          <p className="">cut · render · export — 60s</p>
        </div>
      </div>
    </footer>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Trimmed to what an AI clip generator needs: make, find, fetch, pay. */
const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [
      { to: "/studio", label: "Studio", icon: SlidersHorizontal },
      { to: "/projects", label: "Projects", icon: Folders },
      { to: "/templates", label: "Templates", icon: LayoutTemplate },
      { to: "/downloads", label: "Downloads", icon: Download },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/billing", label: "Billing", icon: CreditCard },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function NewCutButton({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      to="/create"
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-paper text-sm font-extrabold text-ink transition-colors hover:bg-tungsten hover:text-white"
    >
      <Plus size={15} strokeWidth={2.75} aria-hidden />
      New Cut
    </Link>
  );
}

function SectionLinks({ onNavigate, rowClass }: { onNavigate?: () => void; rowClass: string }) {
  return (
    <>
      {NAV_SECTIONS.map((sec) => (
        <div key={sec.label}>
          <p className="px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-dim">
            {sec.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {sec.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `${rowClass} ${isActive ? "bg-paper font-extrabold text-ink" : "font-medium text-muted hover:bg-panel-2 hover:text-paper"}`
                }
              >
                <item.icon size={15} aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

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
          className="rounded-md p-1.5 text-muted hover:text-paper md:hidden"
          aria-label="Open navigation"
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={18} aria-hidden />
        </button>
        <Link to="/studio" className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-tungsten text-white">
            <Clapperboard size={13} strokeWidth={2.4} aria-hidden />
          </span>
          SlyxUp Motion <span className="eyebrow ml-1">studio</span>
        </Link>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted">
          <span className="hidden max-w-48 truncate sm:inline">
            {(user?.email as string) ?? ""}
          </span>
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 hover:bg-panel"
            onClick={() => {
              void signOut().then(() => navigate("/"));
            }}
          >
            <LogOut size={13} aria-hidden />
            Sign out
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {menuOpen ? (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-label="Navigation">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
            <nav className="absolute left-0 top-0 flex h-full w-60 flex-col gap-4 overflow-y-auto border-r border-line bg-ink p-3">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-[13px] font-extrabold">SlyxUp Motion</span>
                <button
                  className="rounded-full p-1.5 text-muted hover:bg-panel-2 hover:text-paper"
                  aria-label="Close navigation"
                  onClick={() => setMenuOpen(false)}
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
              <NewCutButton onClick={() => setMenuOpen(false)} />
              <SectionLinks onNavigate={() => setMenuOpen(false)} rowClass="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors" />
            </nav>
          </div>
        ) : null}
        <aside className="hidden w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-panel/60 p-3 md:flex">
          <NewCutButton />
          <SectionLinks rowClass="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors" />
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
