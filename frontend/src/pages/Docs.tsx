import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Search } from "lucide-react";
import { PublicShell } from "~/components/layout";
import { Magnetic, Reveal } from "~/components/motion";

const SECTIONS = [
  {
    id: "brief", title: "Write a brief", time: "20s",
    items: [
      "Open New Cut and describe the clip: subject, platform, length, mood.",
      "Attach a logo or reference image when you have one — the agent extracts palette and style from it.",
      "Answer the quick picks only for what the brief leaves open; everything else is auto-filled.",
    ],
  },
  {
    id: "build", title: "Watch it build", time: "40s",
    items: [
      "Scenes stream into the player as they are written — no blank waiting.",
      "Open the Scenes panel to retime any beat with one-tap tweaks.",
      "The Director narrates every step; the preview is the proof.",
    ],
  },
  {
    id: "refine", title: "Refine in plain English", time: "10s",
    items: [
      "“Make the logo entrance faster” or “change background to blue” — small edits, no rebuild.",
      "Every version is kept; roll back without losing history.",
    ],
  },
  {
    id: "export", title: "Export and share", time: "30s",
    items: [
      "Hit Export and pick a platform preset — IG Story, TikTok, YouTube, the full bundle.",
      "Copy the CDN URL, grab the embed code, or share a watch link.",
      "Free exports carry a watermark and 30-day links; Pro links are permanent.",
    ],
  },
  {
    id: "limits", title: "Limits to know", time: "∞",
    items: [
      "Free: 5 compositions and 5 exports per calendar month, 720p.",
      "One composition per chat session; start a new cut for a new idea.",
      "Clips run up to 30 seconds at 30fps by default.",
    ],
  },
];

export default function Docs() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("brief");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      items: s.items.filter((i) => i.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)),
    })).filter((s) => s.items.length > 0);
  }, [query]);

  return (
    <PublicShell>
      <section className="dots relative overflow-hidden">
        <div className="relative mx-auto max-w-3xl px-4 pb-8 pt-14 text-center md:pt-20">
          <Reveal>
            <span className="sticker inline-block -rotate-1 rounded-full bg-paper px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-ink">
              Docs — brief to export in a minute
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight md:text-6xl">
              The manual is <span className="hl">four steps.</span>
            </h1>
          </Reveal>
          <Reveal delay={100}>
            <div className="relative mx-auto mt-6 max-w-md">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search docs… (try “watermark”)"
                aria-label="Search docs"
                className="h-12 w-full rounded-2xl border-[1.5px] border-paper/25 bg-panel pl-11 pr-4 text-sm font-medium outline-none transition-all placeholder:text-dim focus:border-tungsten focus:shadow-[0_0_0_3px_rgb(217_72_0/0.15)]"
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 md:px-6">
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-line bg-panel p-2">
              {SECTIONS.map((s, i) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={() => setActive(s.id)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${active === s.id ? "bg-paper text-ink" : "text-muted hover:bg-panel-2 hover:text-paper"}`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-extrabold ${active === s.id ? "bg-tungsten text-white" : "bg-panel-2 text-dim"}`}>
                    {i + 1}
                  </span>
                  {s.title}
                  <span className="ml-auto text-[10px] font-bold text-dim">{s.time}</span>
                </a>
              ))}
              <div className="mt-2 rounded-xl bg-paper p-4 text-ink">
                <BookOpen size={15} className="text-tungsten-bright" aria-hidden />
                <p className="mt-2 text-xs font-medium leading-relaxed text-[#6b6357]">Faster to watch? The demo renders a real cut in your browser.</p>
                <Link to="/demo" className="mt-2 inline-block text-xs font-extrabold text-tungsten hover:underline">Open live demo</Link>
              </div>
            </div>
          </aside>

          <div>
            {filtered.length === 0 ? (
              <div className="panel-lift p-8 text-center text-sm font-medium text-muted">
                No sections match “{query}”. Try “export”, “watermark”, or “limit”.
              </div>
            ) : (
              filtered.map((s, i) => (
                <Reveal key={s.id} delay={Math.min(i * 60, 180)}>
                  <section id={s.id} className="panel-lift card-hover mb-4 scroll-mt-24 p-6 md:p-7">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tungsten text-sm font-extrabold text-white">
                        {SECTIONS.findIndex((x) => x.id === s.id) + 1}
                      </span>
                      <h2 className="text-lg font-extrabold tracking-tight">{s.title}</h2>
                      <span className="ml-auto rounded-full bg-panel-2 px-2.5 py-0.5 text-[10px] font-extrabold text-dim">{s.time}</span>
                    </div>
                    <ul className="mt-4 flex flex-col gap-2.5">
                      {s.items.map((item) => (
                        <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-tungsten" />
                          <span className="font-medium">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </Reveal>
              ))
            )}
            <Reveal className="mt-8 text-center">
              <Magnetic>
                <Link to="/signup" className="inline-flex h-13 items-center gap-2 rounded-2xl bg-paper px-8 py-4 font-extrabold text-ink shadow-[5px_5px_0_rgb(217_72_0)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-tungsten hover:text-white hover:shadow-none">
                  Try it free <ArrowRight size={17} aria-hidden />
                </Link>
              </Magnetic>
            </Reveal>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
