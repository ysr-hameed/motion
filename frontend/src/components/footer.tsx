import { Link } from "react-router-dom";
import { Logo } from "./ui";

const COLUMNS = [
  {
    title: "Product",
    links: [
      ["Features", "/features"],
      ["Pricing", "/pricing"],
      ["Use Cases", "/use-cases"],
      ["Templates", "/templates"],
      ["Changelog", "/changelog"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Docs", "/docs"],
      ["Blog", "/blog"],
      ["Status", "/status"],
      ["API Reference", "/docs"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "/about"],
      ["Contact", "/contact"],
      ["Careers", "https://slyxup.com/careers"],
      ["Press Kit", "https://slyxup.com/press"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
      ["Cookie Policy", "/terms"],
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-panel/30">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              Motion graphics in 60 seconds. Describe what you want — an AI
              director builds production-ready animations while you watch.
            </p>
            <div className="mt-4 flex gap-3">
              {["twitter", "github", "discord"].map((s) => (
                <a
                  key={s}
                  href={`https://${s}.com/slyxup`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-panel text-muted transition-colors hover:border-tungsten/50 hover:text-tungsten"
                  aria-label={s}
                >
                  <span className=" text-[10px] font-bold uppercase">
                    {s[0]}
                  </span>
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="mb-3 text-[10px] uppercase tracking-widest text-dim">
                {col.title}
              </p>
              <ul className="flex flex-col gap-2">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <Link
                      to={href}
                      className="text-sm text-muted transition-colors hover:text-paper"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="rule-glow mt-10" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-dim">
          <p>© {new Date().getFullYear()} SlyxUp Motion. All rights reserved.</p>
          <p>Built with Remotion · Cloudflare · React</p>
        </div>
      </div>
    </footer>
  );
}
