import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Check, Clapperboard, Clock, Megaphone, Monitor, Palette,
  Plus, RectangleHorizontal, Smartphone, Sparkles, Square, Type, Zap,
} from "lucide-react";
import { motionApi } from "~/lib/stack";
import { publishStarter } from "~/lib/composition";
import { useMotionToken } from "./data";

/**
 * Every brief starts a FRESH session. The old code reused one session per
 * browser, so a second brief landed in a session that already had a cut —
 * and Studio (correctly) never fires a pending brief into ongoing work.
 * That is why "enter did nothing".
 */
function freshSession(): string {
  const fresh = crypto.randomUUID();
  try {
    localStorage.setItem("motion.session", fresh);
  } catch {
    /* storage unavailable — Studio falls back to its own id */
  }
  return fresh;
}

function savePending(pkg: Record<string, unknown>) {
  try {
    localStorage.setItem("motion.pending", JSON.stringify(pkg));
  } catch {
    /* storage unavailable — Studio will simply open empty */
  }
}

const FRAMINGS = [
  { id: "landscape", label: "Landscape", hint: "16:9", icon: RectangleHorizontal, brief: "Compose for 16:9 widescreen (1920×1080)." },
  { id: "vertical", label: "Vertical", hint: "9:16", icon: Smartphone, brief: "Compose for 9:16 vertical framing — keep the action in the center crop, safe for 1080×1920." },
  { id: "square", label: "Square", hint: "1:1", icon: Square, brief: "Compose for 1:1 square framing — keep the action centered, safe for 1080×1080." },
] as const;

const DURATIONS = [
  { id: "5s", label: "5s", seconds: 5 },
  { id: "10s", label: "10s", seconds: 10 },
  { id: "15s", label: "15s", seconds: 15 },
  { id: "30s", label: "30s", seconds: 30 },
] as const;

function durationBrief(seconds: number): string {
  const s = Math.min(30, Math.max(2, Math.round(seconds)));
  return `Duration: about ${s} seconds (~${s * 30} frames).`;
}

const MOODS = [
  { id: "Energetic", hint: "punchy + fast" },
  { id: "Minimal", hint: "quiet + spaced" },
  { id: "Cinematic", hint: "film-grade" },
  { id: "Playful", hint: "bouncy + fun" },
  { id: "Bold", hint: "loud + proud" },
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
  const [durationOpt, setDurationOpt] = useState<(typeof DURATIONS)[number]["id"] | "custom">("5s");
  const [customSec, setCustomSec] = useState("8");
  const [mood, setMood] = useState<(typeof MOODS)[number]["id"]>("Cinematic");
  const [popup, setPopup] = useState<"framing" | "duration" | "mood" | null>(null);
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

  const seconds = durationOpt === "custom"
    ? Math.min(30, Math.max(2, Math.round(Number(customSec) || 5)))
    : (DURATIONS.find((x) => x.id === durationOpt)?.seconds ?? 5);

  const start = () => {
    const text = prompt.trim();
    if (!text) return;
    const f = FRAMINGS.find((x) => x.id === framing)!;
    savePending({
      kind: "brief",
      text: `${projectName ? `Project context: ${projectName}.\n` : ""}${f.brief}\n${durationBrief(seconds)}\nMood: ${mood.toLowerCase()}.\nBrief: ${text}`,
      project: projectName,
      projectId,
    });
    freshSession();
    navigate("/studio");
  };

  const instant = () => {
    if (instantBusy !== null) return;
    setInstantBusy("starter");
    setInstantError(null);
    const headline = prompt.trim() || undefined;
    publishStarter(freshSession(), headline ? { headline } : {})
      .then(() => navigate("/studio"))
      .catch((e: unknown) => setInstantError(e instanceof Error ? e.message : String(e)))
      .finally(() => setInstantBusy(null));
  };

  const toolBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-2.5 text-[11px] font-semibold text-muted transition-all hover:border-dim hover:text-paper";

  const framingIcon = FRAMINGS.find((x) => x.id === framing)!;
  const durationLabel = durationOpt === "custom" ? `${seconds}s` : (DURATIONS.find((x) => x.id === durationOpt)?.label ?? "5s");

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
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              start();
            }
          }}
          rows={4}
          autoFocus
          placeholder="A 5s product reveal — logo punches in on an overshoot…"
          aria-label="Describe your clip"
          className="w-full resize-none bg-transparent px-5 pb-2 pt-5 text-base leading-relaxed text-paper outline-none placeholder:text-dim"
        />
        <div className="relative border-t border-line-soft bg-ink/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Shoot options">
            <button type="button" onClick={() => setPopup(popup === "framing" ? null : "framing")} aria-expanded={popup === "framing"} title="Framing" className={toolBtn}>
              <framingIcon.icon size={13} className="text-tungsten" aria-hidden />
              {framingIcon.hint}
            </button>
            <button type="button" onClick={() => setPopup(popup === "duration" ? null : "duration")} aria-expanded={popup === "duration"} title="Duration" className={toolBtn}>
              <Clock size={13} className="text-tungsten" aria-hidden />
              {durationLabel}
            </button>
            <button type="button" onClick={() => setPopup(popup === "mood" ? null : "mood")} aria-expanded={popup === "mood"} title="Mood" className={toolBtn}>
              <Palette size={13} className="text-tungsten" aria-hidden />
              {mood}
            </button>
            {projectName ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-tungsten/40 bg-tungsten/10 px-2.5 text-[11px] font-semibold text-tungsten" title={`Cutting in ${projectName}`}>
                <Monitor size={13} aria-hidden />
                <span className="max-w-28 truncate">{projectName}</span>
              </span>
            ) : null}
          </div>

          {popup ? (
            <>
              <button type="button" aria-label="Close options" onClick={() => setPopup(null)} className="fixed inset-0 z-40 cursor-default bg-transparent" />
              <div className="absolute bottom-14 left-4 z-50 w-60 overflow-hidden rounded-2xl border border-line bg-panel-2 shadow-[0_16px_48px_-12px_rgb(0_0_0/0.8)]">
                {popup === "framing" ? (
                  <div className="p-1.5">
                    {FRAMINGS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => { setFraming(f.id); setPopup(null); }}
                        aria-pressed={framing === f.id}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${framing === f.id ? "bg-tungsten/10" : "hover:bg-white/5"}`}
                      >
                        <f.icon size={15} className={framing === f.id ? "text-tungsten" : "text-dim"} aria-hidden />
                        <span className="flex-1 text-[12.5px] font-semibold text-paper">{f.label}</span>
                        <span className="text-[11px] text-dim">{f.hint}</span>
                        {framing === f.id ? <Check size={13} className="text-tungsten" strokeWidth={3} aria-hidden /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
                {popup === "duration" ? (
                  <div className="p-1.5">
                    <div className="grid grid-cols-4 gap-1">
                      {DURATIONS.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => { setDurationOpt(d.id); setPopup(null); }}
                          aria-pressed={durationOpt === d.id}
                          className={`rounded-lg py-2 text-[12px] font-bold transition-colors ${durationOpt === d.id ? "bg-tungsten text-white" : "text-dim hover:bg-white/5 hover:text-paper"}`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-ink px-2.5 py-2">
                      <span className="text-[11px] font-semibold text-dim">Custom</span>
                      <input
                        value={customSec}
                        onChange={(e) => setCustomSec(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            setDurationOpt("custom");
                            setPopup(null);
                          }
                        }}
                        inputMode="numeric"
                        aria-label="Custom seconds (2–30)"
                        className="h-7 w-12 rounded-md border border-line bg-panel px-1.5 text-center text-[12px] font-bold text-paper outline-none focus:border-tungsten"
                      />
                      <span className="text-[11px] text-dim">sec</span>
                      <button
                        type="button"
                        onClick={() => { setDurationOpt("custom"); setPopup(null); }}
                        className="ml-auto rounded-lg bg-paper px-2.5 py-1 text-[11px] font-bold text-ink hover:bg-tungsten hover:text-white"
                      >
                        Set
                      </button>
                    </div>
                  </div>
                ) : null}
                {popup === "mood" ? (
                  <div className="p-1.5">
                    {MOODS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { setMood(m.id); setPopup(null); }}
                        aria-pressed={mood === m.id}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${mood === m.id ? "bg-tungsten/10" : "hover:bg-white/5"}`}
                      >
                        <Sparkles size={13} className={mood === m.id ? "text-tungsten" : "text-dim"} aria-hidden />
                        <span className="flex-1 text-[12.5px] font-semibold text-paper">{m.id}</span>
                        <span className="text-[10.5px] text-dim">{m.hint}</span>
                        {mood === m.id ? <Check size={13} className="text-tungsten" strokeWidth={3} aria-hidden /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
          <span className="hidden items-center gap-1.5 text-xs text-dim sm:inline-flex">
            <Sparkles size={13} className="text-tungsten" aria-hidden />
            Enter to start · Shift+Enter for a new line
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

      {/* instant preview — one proven starter, no template menu */}
      <div className="mt-6 rounded-2xl border border-tungsten/25 bg-tungsten/[0.04] p-4">
        <p className="flex items-center justify-center gap-1.5 text-center text-xs font-bold uppercase tracking-widest text-tungsten">
          <Zap size={12} aria-hidden /> skip the brief — preview instantly
        </p>
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            disabled={instantBusy !== null}
            onClick={() => instant()}
            className="rounded-xl border border-tungsten/40 bg-tungsten/10 px-5 py-2 text-xs font-bold text-tungsten transition-all hover:brightness-125 disabled:cursor-wait disabled:opacity-50"
          >
            {instantBusy !== null ? "Publishing…" : "▶ Instant preview"}
          </button>
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
