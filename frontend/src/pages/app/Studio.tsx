import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Film, Plus } from "lucide-react";
import { Conversation } from "~/components/Conversation";
import { ExportDialog } from "~/components/ExportDialog";
import { Stage } from "~/components/Stage";
import { suggest } from "~/components/Timeline";
import { fetchComposition, publishStarter, type MotionPlan } from "~/lib/composition";
import { DEMO_CODE, DEMO_PLAN } from "~/lib/demo";
import { openExport } from "~/lib/exportPresets";
import { motionApi } from "~/lib/stack";
import { useMotionToken } from "./data";

/**
 * Studio — the main workspace (/studio). One Durable Object instance per
 * session, so a reload reattaches to the same transcript and cut.
 *
 * Deliberately minimal: a preview and a conversation. The user only ever
 * asks two questions — "what am I looking at?" and "what do I type next?" —
 * and both are answered on screen at all times. Everything analytical
 * (quality bars, ratings, beat inspectors) stays inside the agent loop,
 * not in the user's face.
 */
function useSessionId() {
  const [id] = useState(() => {
    const key = "motion.session";
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(key, fresh);
    return fresh;
  });
  return id;
}

const API_HOST = import.meta.env.VITE_API_HOST ?? "";
const DEMO = new URLSearchParams(location.search).has("demo");

export default function Studio() {
  const sessionId = useSessionId();
  const token = useMotionToken();
  const agent = useAgent({ agent: "Chat", name: sessionId, host: API_HOST });
  const chat = useAgentChat({ agent });

  // Claim the D1 metadata row for this chat session so the agent's
  // fire-and-forget sync (via /api/internal/*) updates a row we own.
  useEffect(() => {
    if (DEMO || !token) return;
    motionApi(token, "/api/compositions/attach", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }).catch(() => undefined);
  }, [sessionId, token]);

  const [code, setCode] = useState("");
  const codeRef = useRef("");
  codeRef.current = code;
  const [plan, setPlan] = useState<MotionPlan | null>(null);
  const [version, setVersion] = useState(0);
  const [reloadKey, setReloadKey] = useState("0");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chunkStale, setChunkStale] = useState(false);
  // Small screens show one side at a time; desktop keeps both side by side.
  const [mobileView, setMobileView] = useState<"preview" | "direct">("preview");

  // The web player has no lazy compile chunk to go stale (the bundle
  // builds synchronously into a sandboxed iframe), so there is nothing to
  // warm up. chunkStale stays for the deploy notice below.
  void setChunkStale;

  const [booted, setBooted] = useState(DEMO);
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await fetchComposition(sessionId, signal);
        setCode(next.code);
        setPlan(next.plan);
        setVersion(next.version);
        setReloadKey(String(next.version));
        setLoadError(null);
        setBooted(true);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setBooted(true);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    if (DEMO) {
      setCode(DEMO_CODE);
      setPlan(DEMO_PLAN);
      setVersion(1);
      setReloadKey("demo");
      return;
    }
    const ac = new AbortController();
    void reload(ac.signal);
    return () => ac.abort();
  }, [reload]);

  const busy = chat.status === "submitted" || chat.status === "streaming";
  useEffect(() => {
    if (DEMO || !busy) return;
    const t = setInterval(() => void reload(), 3_000);
    return () => clearInterval(t);
  }, [busy, reload]);

  const last = plan?.beats?.at(-1);
  const duration = last ? Math.max(30, Math.ceil(last.to)) : 150;
  const hasCut = version > 0 && code.trim().length > 0;
  const sceneCount = plan?.beats.length ?? 0;

  const status = busy ? "Directing…" : hasCut ? `Cut v${version}` : "New cut";
  const [projectName, setProjectName] = useState<string | null>(null);

  // Handoff from /create: a pending package fires exactly once, and only
  // into a provably fresh session — never into ongoing work. Briefs land
  // in the Direct draft for one last look; instant starters publish right
  // away since the user already picked them.
  const consumed = useRef(false);
  useEffect(() => {
    if (DEMO || consumed.current || !booted || busy || hasCut) return;
    if (chat.messages.length > 0) return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem("motion.pending");
    } catch {
      raw = null;
    }
    if (!raw) return;
    consumed.current = true;
    try {
      localStorage.removeItem("motion.pending");
    } catch {
      /* ignore */
    }
    try {
      const p = JSON.parse(raw) as {
        kind?: string;
        text?: string;
        project?: string | null;
        projectId?: string | null;
        headline?: string;
      };
      if (p.kind === "brief" && p.text) {
        if (p.project) setProjectName(p.project);
        // Link this fresh session's cut to the chosen project (idempotent).
        if (p.projectId && token) {
          motionApi(token, "/api/compositions/attach", {
            method: "POST",
            body: JSON.stringify({ sessionId, projectId: p.projectId }),
          }).catch(() => undefined);
        }
        window.dispatchEvent(new CustomEvent("motion:suggest", { detail: p.text }));
        setMobileView("direct");
      } else if (p.kind === "instant") {
        void publishStarter(sessionId, p.headline ? { headline: p.headline } : {})
          .then(() => reload())
          .catch(() => undefined);
      }
    } catch {
      /* malformed package — ignore */
    }
  });

  return (
    <div className="flex h-[calc(100dvh-3rem)] min-h-0 flex-col bg-ink lg:h-full">
      {/* slim header (desktop): status left, actions right. On mobile this
          whole bar merges with the view tabs below into one compact bar, so
          the chat keeps every pixel. */}
      <div className="hidden shrink-0 items-center gap-2.5 border-b border-line px-4 py-2.5 lg:flex">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span
            className={`h-2 w-2 rounded-full ${busy ? "live-dot bg-tungsten" : hasCut ? "bg-ok" : "bg-dim"}`}
            aria-hidden
          />
          {status}
        </span>
        <span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold xl:inline-flex ${busy ? "border-tungsten/50 bg-tungsten/10 text-tungsten" : "border-line text-dim"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${busy ? "live-dot bg-tungsten" : "bg-ok"}`} aria-hidden />
          Director · {busy ? "directing your cut…" : "ready for your brief"}
        </span>
        {projectName ? (
          <span className="hidden max-w-40 truncate rounded-full border border-tungsten/40 bg-tungsten/10 px-2.5 py-0.5 text-[11px] font-semibold text-tungsten sm:inline" title={`Cutting in ${projectName}`}>
            {projectName}
          </span>
        ) : null}
        {loadError ? <span className="text-xs text-bad">· offline</span> : null}
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem("motion.session", crypto.randomUUID());
            } catch {
              /* ignore */
            }
            window.location.reload();
          }}
          title="Start a fresh cut in a new session"
          className="ml-auto inline-flex h-9 items-center gap-1 rounded-xl border border-line px-3 text-xs font-bold text-muted transition-all hover:border-tungsten hover:text-paper"
        >
          <Plus size={13} aria-hidden />
          New cut
        </button>
        <button
          type="button"
          onClick={openExport}
          disabled={!hasCut}
          title={hasCut ? "Export this cut" : "Export unlocks once your cut renders"}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl bg-paper px-4 text-sm font-bold text-ink transition-all hover:bg-tungsten hover:text-white disabled:cursor-not-allowed disabled:bg-panel-2 disabled:text-dim"
        >
          <Download size={14} aria-hidden />
          Export
        </button>
      </div>

      {/* mobile bar: view switch + status + actions in ONE row */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5 lg:hidden" role="tablist" aria-label="Studio views">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${busy ? "live-dot bg-tungsten" : hasCut ? "bg-ok" : "bg-dim"}`}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 gap-1 rounded-xl bg-ink p-0.5">
          {(["preview", "direct"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={mobileView === v}
              onClick={() => setMobileView(v)}
              className={`min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-xs font-medium capitalize transition-colors ${
                mobileView === v ? "bg-paper font-bold text-ink" : "text-muted hover:text-paper"
              }`}
            >
              {v === "preview" ? "Preview" : `Direct${busy ? " •" : ""}`}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem("motion.session", crypto.randomUUID());
            } catch {
              /* ignore */
            }
            window.location.reload();
          }}
          title="New cut"
          aria-label="New cut"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-dim transition-colors hover:bg-white/10 hover:text-paper"
        >
          <Plus size={15} aria-hidden />
        </button>
        <button
          type="button"
          onClick={openExport}
          disabled={!hasCut}
          title={hasCut ? "Export this cut" : "Export unlocks once your cut renders"}
          aria-label="Export"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-ink transition-all hover:bg-tungsten hover:text-white disabled:bg-panel-2 disabled:text-dim"
        >
          <Download size={14} aria-hidden />
        </button>
      </div>

      {chunkStale ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-tungsten/50 bg-tungsten/10 px-4 py-2 text-sm" role="alert">
          <span className="text-tungsten">A new studio version is available.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ml-auto rounded-lg bg-tungsten px-3 py-1 text-xs font-bold text-white hover:brightness-110"
          >
            Reload
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* preview: the stage fills everything */}
        <main
          className={`${
            mobileView === "preview" ? "flex" : "hidden"
          } min-h-0 min-w-0 flex-1 flex-col p-4 lg:order-2 lg:flex`}
          aria-label="Preview"
        >
          <div className="flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-black lg:min-h-0">
            <Stage code={code} plan={plan} version={version} reloadKey={reloadKey} sessionId={sessionId} />
          </div>

          {/* scenes: collapsed by default, one-tap tweaks inside */}
          {sceneCount > 0 ? (
            <details className="group mx-auto mt-2 w-full max-w-2xl shrink-0 overflow-hidden rounded-xl border border-line bg-panel">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm text-muted transition-colors hover:text-paper [&::-webkit-details-marker]:hidden">
                <Film size={14} className="text-tungsten" aria-hidden />
                <span className="font-medium">
                  Scenes <span className=" text-xs text-dim">({sceneCount})</span>
                </span>
                <ChevronDown size={14} className="ml-auto text-dim transition-transform duration-300 group-open:rotate-180" aria-hidden />
              </summary>
              <div className="scroll-thin max-h-56 space-y-1.5 overflow-y-auto border-t border-line-soft p-3">
                {plan!.beats.map((b, i) => (
                  <div key={i} className="rounded-lg bg-ink px-3 py-2">
                    <p className="flex items-baseline gap-2">
                      <span className=" text-[11px] font-bold text-tungsten">{String(i + 1).padStart(2, "0")}</span>
                      <span className="tc text-[11px] text-dim">{b.from}–{b.to}f</span>
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-paper" title={b.what}>{b.what}</p>
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      {(
                        [
                          ["Faster", `Make scene ${i + 1} ("${b.what.slice(0, 40)}") faster — retime, don't restyle`],
                          ["Slower", `Make scene ${i + 1} slower with room to land`],
                          ["Split", `Split scene ${i + 1} into two scenes with a change of state`],
                        ] as Array<[string, string]>
                      ).map(([label, text]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => {
                            suggest(text);
                            if (window.innerWidth < 1024) setMobileView("direct");
                          }}
                          className="rounded-md border border-line px-2 py-0.5  text-[10px] text-muted transition-colors hover:border-tungsten hover:text-tungsten"
                        >
                          {label}
                        </button>
                      ))}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </main>

        {/* direct: the conversation is the whole panel */}
        <aside
          className={`${
            mobileView === "direct" ? "flex" : "hidden"
          } min-h-0 w-full flex-col lg:order-1 lg:flex lg:w-[400px] lg:shrink-0 lg:border-r lg:border-line`}
          aria-label="Direct"
        >
          <Conversation chat={chat} sessionId={sessionId} onFiles={() => {}} />
        </aside>
      </div>

      <ExportDialog totalFrames={duration} sessionId={sessionId} getCode={() => codeRef.current} />
    </div>
  );
}
