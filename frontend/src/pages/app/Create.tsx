import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Clapperboard, Megaphone, Plus, Sparkles, Type, Zap } from "lucide-react";
import { motionApi } from "~/lib/stack";
import { publishStarter } from "~/lib/composition";
import { TEMPLATES as TEMPLATE_CHIPS } from "~/lib/templates";
import { useMotionToken } from "./data";

/** Same session key the Studio reads — one session per browser. */
function getSessionId(): string {
  const key = "motion.session";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

function savePending(pkg: Record<string, unknown>) {
  try {
    localStorage.setItem("motion.pending", JSON.stringify(pkg));
  } catch {
    /* storage unavailable — Studio will simply open empty */
  }
}

const FRAMINGS = [
  { id: "landscape", label: "Landscape", hint: "16:9", brief: "Compose for 16:9 widescreen (1920×1080)." },
  { id: "vertical", label: "Vertical", hint: "9:16", brief: "Compose for 9:16 vertical framing — keep the action in the center crop, safe for 1080×1920." },
  { id: "square", label: "Square", hint: "1:1", brief: "Compose for 1:1 square framing — keep the action centered, safe for 1080×1080." },
] as const;

const DURATIONS = [
  { id: "5s", label: "5s", brief: "Duration: about 5 seconds (~150 frames)." },
  { id: "10s", label: "10s", brief: "Duration: about 10 seconds (~300 frames)." },
  { id: "15s", label: "15s", brief: "Duration: about 15 seconds (~450 frames)." },
  { id: "30s", label: "30s", brief: "Duration: about 30 seconds (~900 frames)." },
] as const;

const MOODS = ["Energetic", "Minimal", "Cinematic", "Playful", "Bold"] as const;

const INSTANT_STARTERS = [
  { id: "product-reveal", label: "Product reveal" },
  { id: "logo-animation", label: "Logo sting" },
  { id: "quote-card", label: "Quote card" },
] as const;

const EXAMPLES = [
  {
    icon: Clapperboard,
    title: "Product reveal",
    desc: "Logo punches in on an overshoot · 5s",
    prompt: "A 5s product reveal — the logo punches in on an overshoot and settles with a spring",
  },
  {
    icon: Type,
    title: "Kinetic headline",
    desc: "Per-character mask reveal · 10s",
    prompt: "Kinetic type that masks the headline in, one character at a time, beat-aligned",
  },
  {
    icon: Megaphone,
    title: "Social ad",
    desc: "Hook + payoff for vertical · 15s",
    prompt: "A 15s vertical social ad with a punchy hook in the first second and a logo payoff",
  },
  {
    icon: Sparkles,
    title: "Logo sting",
    desc: "Spring settle with grain · 5s",
    prompt: "A logo sting with a spring settle, subtle film grain and a glow pulse",
  },
] as const;

interface Project {
  id: string;
  name: string;
  updated_at: number;
}

/**
 * /create — the New Cut dashboard. Prompt box with shoot options, examples,
 * templates, instant starters and project picker. It never talks to the
 * agent directly: it hands a pending package to /studio, which fires it
 * into a fresh session only.
 */
export default function Create() {
  const navigate = useNavigate();
  const token = useMotionToken();
  const [prompt, setPrompt] = useState("");
  const [framing, setFraming] = useState<(typeof FRAMINGS)[number]["id"]>("landscape");
  const [durationOpt, setDurationOpt] = useState<(typeof DURATIONS)[number]["id"]>("5s");
  const [mood, setMood] = useState<(typeof MOODS)[number]>("Cinematic");
  const [instantBusy, setInstantBusy] = useState<string | null>(null);
  const [instantError, setInstantError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (token === undefined) return;
    motionApi<{ projects: Project[] }>(token, "/api/projects")
      .then((r) => setProjects(r.projects ?? []))
      .catch(() => setProjects([]));
  }, [token]);

  const projectName = projects?.find((p) => p.id === projectId)?.name ?? null;

  const createProject = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    motionApi<{ id: string }>(token, "/api/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    })
      .then((r) => {
        setProjects((p) => [{ id: r.id, name, updated_at: Date.now() }, ...(p ?? [])]);
        setProjectId(r.id);
        setNewName("");
      })
      .catch(() => undefined)
      .finally(() => setCreating(false));
  };

  const start = () => {
    const text = prompt.trim();
    if (!text) return;
    const f = FRAMINGS.find((x) => x.id === framing)!;
    const d = DURATIONS.find((x) => x.id === durationOpt)!;
    savePending({
      kind: "brief",
      text: `${projectName ? `Project context: ${projectName}.\n` : ""}${f.brief}\n${d.brief}\nMood: ${mood.toLowerCase()}.\nBrief: ${text}`,
      project: projectName,
    });
    navigate("/studio");
  };

  const instant = (template: string) => {
    if (instantBusy !== null) return;
    setInstantBusy(template);
    setInstantError(null);
    const headline = prompt.trim() || undefined;
    publishStarter(getSessionId(), template, headline ? { headline } : {})
      .then(() => navigate("/studio"))
      .catch((e: unknown) => setInstantError(e instanceof Error ? e.message : String(e)))
      .finally(() => setInstantBusy(null));
  };

  const pill = (on: boolean) =>
    `rounded-full border px-3 py-1 text-[11px] font-semibold transition-all ${
      on
        ? "border-tungsten/60 bg-tungsten/10 text-tungsten shadow-[0_0_14px_rgb(217_72_0/0.2)]"
        : "border-line text-muted hover:border-dim hover:text-paper"
    }`;

  return (
    <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
      <p className="eyebrow mb-2 mt-2 text-center">new cut — describe it once</p>
      <h1 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
        What are we <span className="gold-animate">shooting today?</span>
      </h1>

      {/* hero prompt box */}
      <div className="panel-lift mt-6 overflow-hidden shadow-[0_24px_80px_-32px_rgb(0_0_0/0.9)] transition-shadow focus-within:shadow-[0_0_0_1px_rgb(217_72_0/0.4),0_24px_80px_-32px_rgb(0_0_0/0.9)]">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start();
          }}
          rows={4}
          autoFocus
          placeholder="A 5s product reveal — logo punches in on an overshoot…"
          aria-label="Describe your clip"
          className="w-full resize-none bg-transparent px-5 pb-2 pt-5 text-base leading-relaxed text-paper outline-none placeholder:text-dim"
        />
        <div className="space-y-2.5 border-t border-line-soft bg-ink/40 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Framing">
            {FRAMINGS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFraming(f.id)} aria-pressed={framing === f.id} className={pill(framing === f.id)}>
                {f.label} · {f.hint}
              </button>
            ))}
            <span className="mx-1 hidden h-4 w-px bg-line sm:inline-block" aria-hidden />
            {DURATIONS.map((d) => (
              <button key={d.id} type="button" onClick={() => setDurationOpt(d.id)} aria-pressed={durationOpt === d.id} className={pill(durationOpt === d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Mood">
            {MOODS.map((m) => (
              <button key={m} type="button" onClick={() => setMood(m)} aria-pressed={mood === m} className={pill(mood === m)}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
          <span className="hidden items-center gap-1.5 text-xs text-dim sm:inline-flex">
            <Sparkles size={13} className="text-tungsten" aria-hidden />
            ⌘/Ctrl + Enter to start
          </span>
          <button
            type="button"
            onClick={start}
            disabled={!prompt.trim()}
            className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-xl bg-paper px-6 text-sm font-bold text-ink shadow-[4px_4px_0_rgb(217_72_0)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-tungsten hover:text-white hover:shadow-none disabled:cursor-not-allowed disabled:bg-panel-3 disabled:text-dim disabled:shadow-none"
          >
            Start directing
            <ArrowRight size={15} aria-hidden />
          </button>
        </div>
      </div>

      {/* examples */}
      <p className="eyebrow mb-2 mt-8">try an example</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.title}
            type="button"
            onClick={() => setPrompt(ex.prompt)}
            className="spotlight panel-lift card-hover group flex items-start gap-3 p-3.5 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-tungsten/25 bg-tungsten/10 text-tungsten">
              <ex.icon size={16} aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-bold text-paper">{ex.title}</span>
              <span className="mt-0.5 block text-xs text-dim transition-colors group-hover:text-muted">{ex.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {/* templates */}
      <p className="eyebrow mb-2 mt-7">or start from a template</p>
      <div className="mask-fade-x -mx-4 overflow-x-auto px-4 pb-1">
        <div className="flex w-max gap-2">
          {TEMPLATE_CHIPS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPrompt(t.prompt)}
              className="w-40 shrink-0 snap-start rounded-xl border border-line bg-panel p-3 text-left transition-all hover:-translate-y-0.5 hover:border-tungsten/50"
            >
              <span className="block truncate text-[13px] font-bold text-paper">{t.name}</span>
              <span className="mt-1 block truncate text-[11px] text-dim">{t.prompt}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-tungsten">
                Use <ArrowRight size={11} aria-hidden />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* instant starters */}
      <div className="mt-6 rounded-2xl border border-tungsten/25 bg-tungsten/[0.04] p-4">
        <p className="flex items-center justify-center gap-1.5 text-center text-xs font-bold uppercase tracking-widest text-tungsten">
          <Zap size={12} aria-hidden /> preview a starter instantly
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {INSTANT_STARTERS.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={instantBusy !== null}
              onClick={() => instant(s.id)}
              className="rounded-xl border border-tungsten/40 bg-tungsten/10 px-4 py-2 text-xs font-bold text-tungsten transition-all hover:brightness-125 disabled:cursor-wait disabled:opacity-50"
            >
              {instantBusy === s.id ? "Publishing…" : `▶ ${s.label}`}
            </button>
          ))}
        </div>
        {instantError ? (
          <p className="mt-2 text-center text-xs text-bad">{instantError}</p>
        ) : (
          <p className="mt-2 text-center text-[11px] text-dim">
            renders immediately in the Studio — then describe the change you want
          </p>
        )}
      </div>

      {/* project-based */}
      {token !== undefined ? (
        <div className="mt-6 rounded-2xl border border-line bg-panel p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-dim">
            cut inside a project <span className="ml-1 font-semibold normal-case tracking-normal">— optional</span>
          </p>
          {projects === null ? (
            <p className="mt-3 text-xs text-dim">Loading projects…</p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProjectId(projectId === p.id ? null : p.id)}
                  aria-pressed={projectId === p.id}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all ${
                    projectId === p.id
                      ? "border-tungsten/60 bg-tungsten/[0.08]"
                      : "border-line-soft hover:border-dim"
                  }`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${projectId === p.id ? "bg-tungsten text-white" : "bg-panel-3 text-muted"}`}>
                    {projectId === p.id ? <Check size={12} aria-hidden /> : p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-paper">{p.name}</span>
                  <span className="shrink-0 text-[11px] text-dim">{new Date(p.updated_at).toLocaleDateString()}</span>
                </button>
              ))}
              <form onSubmit={createProject} className="flex gap-2 pt-1">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New project name…"
                  aria-label="New project name"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 text-xs text-paper outline-none placeholder:text-dim focus:border-tungsten/60"
                />
                <button
                  type="submit"
                  disabled={!newName.trim() || creating}
                  className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-paper px-3 text-xs font-bold text-ink transition-all hover:bg-tungsten hover:text-white disabled:cursor-not-allowed disabled:bg-panel-3 disabled:text-dim"
                >
                  <Plus size={13} aria-hidden />
                  {creating ? "…" : "Create"}
                </button>
              </form>
            </div>
          )}
        </div>
      ) : null}

      <div className="h-8" />
    </div>
  );
}
