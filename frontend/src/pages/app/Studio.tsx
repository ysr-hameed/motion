import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useCallback, useEffect, useState } from "react";
import { Conversation } from "~/components/Conversation";
import { ExportDialog } from "~/components/ExportDialog";
import { Inspector } from "~/components/Inspector";
import { ProgressView } from "~/components/ProgressView";
import { Stage } from "~/components/Stage";
import { Timeline } from "~/components/Timeline";
import { fetchComposition, type MotionPlan } from "~/lib/composition";
import { DEMO_CODE, DEMO_PLAN } from "~/lib/demo";
import { motionApi } from "~/lib/stack";
import { warmCompileChunk } from "~/components/Stage";
import { useMotionToken } from "./data";

/**
 * Studio — the main workspace (/studio). One Durable Object instance per
 * session, so a reload reattaches to the same transcript and cut.
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
  const [plan, setPlan] = useState<MotionPlan | null>(null);
  const [version, setVersion] = useState(0);
  const [reloadKey, setReloadKey] = useState("0");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chunkStale, setChunkStale] = useState(false);
  // Small screens show one panel at a time; desktop keeps both side by side.
  const [tab, setTab] = useState<"preview" | "chat">("preview");

  // Warm the preview chunk on mount: a tab left open across a deploy fails
  // here (with a reload prompt) instead of after minutes of agent work.
  useEffect(() => {
    if (DEMO) return;
    warmCompileChunk(() => setChunkStale(true));
  }, []);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await fetchComposition(sessionId, signal);
        setCode(next.code);
        setPlan(next.plan);
        setVersion(next.version);
        setReloadKey(String(next.version));
        setLoadError(null);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setLoadError(err instanceof Error ? err.message : String(err));
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

  return (
    // Mobile: the app shell's content div is an unbounded scroll container,
    // so h-full collapses and the preview's fit-box measures 0px — the
    // player looks missing. Bound the studio to the viewport on small
    // screens (lg keeps h-full inside the desktop grid).
    <div className="flex h-[calc(100dvh-3rem)] min-h-0 flex-col lg:h-full lg:grid lg:grid-cols-[1fr_400px]">
      <div className="flex shrink-0 gap-1 border-b border-line p-2 lg:hidden" role="tablist" aria-label="Studio panels">
        {(["preview", "chat"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm capitalize ${
              tab === t ? "bg-tungsten font-semibold text-ink" : "text-muted hover:text-paper"
            }`}
          >
            {t}
            {t === "chat" && busy ? " •" : ""}
          </button>
        ))}
      </div>
      <main className={`${
        tab === "preview" ? "flex" : "hidden"
      } scroll-thin min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:flex lg:h-full lg:p-4`}>
        <header className="flex shrink-0 items-center gap-3">
          <span className="text-[13px] font-semibold tracking-tight">Studio</span>
          <span className="eyebrow">workspace</span>
          <div className="ml-auto flex items-center gap-2 text-[10px] text-dim">
            {loadError ? (
              <span className="text-bad">offline — {loadError}</span>
            ) : (
              <span className="font-mono">{version > 0 ? `cut v${version}` : "no cut"}</span>
            )}
          </div>
        </header>
        {chunkStale ? (
          <div className="flex shrink-0 items-center gap-3 rounded-md border border-tungsten/50 bg-tungsten/10 px-3 py-2 text-sm" role="alert">
            <span className="text-tungsten">A new studio version is available.</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="ml-auto rounded-md bg-tungsten px-3 py-1 text-xs font-semibold text-ink hover:brightness-110"
            >
              Reload
            </button>
          </div>
        ) : null}
        {/* Fixed stage height on mobile: inside the scrolling column the
            Stage's flex-1 would otherwise resolve against unbounded content
            height and the fit-box measures 0px. Desktop keeps the old
            flex-1 behaviour inside the bounded grid. */}
        <div className="flex h-[42dvh] min-h-[280px] shrink-0 flex-col lg:h-auto lg:min-h-0 lg:flex-1">
          <Stage code={code} plan={plan} version={version} reloadKey={reloadKey} sessionId={sessionId} />
        </div>
        <Timeline plan={plan} duration={duration} />
        <div className="flex shrink-0 flex-col gap-3 xl:flex-row">
          <Inspector plan={plan} code={code} version={version} />
          <ProgressView code={code} plan={plan} version={version} busy={busy} messages={chat.messages} sessionId={sessionId} />
        </div>
      </main>
      <div
        className={`${
          tab === "chat" ? "flex" : "hidden"
        } min-h-0 min-w-0 flex-1 flex-col lg:flex lg:h-full [&>aside]:min-h-0 [&>aside]:flex-1`}
      >
        <Conversation chat={chat} sessionId={sessionId} onFiles={() => {}} />
      </div>
      <ExportDialog totalFrames={duration} sessionId={sessionId} />
    </div>
  );
}
