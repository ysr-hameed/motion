import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  Check,
  Clapperboard,
  FolderOpen,
  MessageSquare,
  MonitorPlay,
  PanelLeft,
  Share2,
  Square,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { AgentChatCard } from "@/components/agent-chat-card"
import { ClipPlayer } from "@/components/studio/clip-player"
import { ExportMenu } from "@/components/studio/export-menu"
import { StudioSidebar } from "@/components/studio/studio-sidebar"
import { liveStatus } from "@/lib/stages"
import { takeAgentHandoff } from "@/lib/use-motion-studio"
import type { MotionStudio, Phase, RunProgress } from "@/lib/use-motion-studio"
import { requestVideoExport } from "@/lib/video-export"
import { navigate } from "@/lib/router"
import type { Artifact } from "@/lib/artifact"
import { cn } from "@/lib/utils"

/**
 * The waiting state, shown on the stage until there is something to play.
 *
 * It used to cycle three invented phrases on a timer — "Directing your
 * scenes…", "Composing motion layers…", "Painting preview…" — behind an
 * indeterminate bar. None of that was true, it told the user nothing, and
 * on a run that takes 90 seconds to compose it read as a stall. Now it
 * shows the real stage and a real count of what has been written.
 */
/**
 * Stage frame sizing. Landscape fills the width; portrait and square must
 * also fit the stage *height* — a width-driven 9:16 at 400px wide is 711px
 * tall and blows out the viewport. The min() caps width by the available
 * stage height so the frame always fits without scrolling.
 */
function stageFrameClass(format: string | undefined) {
  if (format === "9:16")
    return "mx-auto aspect-[9/16] w-[min(100%,calc((100svh_-_14rem)*9/16))]"
  if (format === "1:1")
    return "mx-auto aspect-square w-[min(100%,calc(100svh_-_14rem))]"
  return "aspect-video w-full"
}

function GeneratingShimmer({
  format,
  onStop,
  progress,
}: {
  format: string
  onStop: () => void
  progress?: RunProgress | null
}) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - t0) / 1000)),
      1000
    )
    return () => clearInterval(t)
  }, [])

  const line = liveStatus(progress)

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-neutral-950",
        stageFrameClass(format)
      )}
    >
      <div aria-hidden className="absolute inset-0 bg-grid-dark" />
      <div
        aria-hidden
        className="absolute left-1/2 top-[38%] size-72 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-primary/20 blur-3xl"
      />
      {/* film edging */}
      <div aria-hidden className="absolute inset-x-0 top-0 flex justify-between px-3 pt-2 opacity-40">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className="h-1.5 w-2.5 rounded-[2px] bg-white/25" />
        ))}
      </div>
      <div aria-hidden className="absolute inset-x-0 bottom-0 flex justify-between px-3 pb-2 opacity-40">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className="h-1.5 w-2.5 rounded-[2px] bg-white/25" />
        ))}
      </div>
      <span className="absolute left-3 top-6 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur">
        {format}
      </span>
      <span className="absolute right-3 top-6 rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-rose-200 backdrop-blur">
        {elapsed}s
      </span>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
        {/* equalizer mark */}
        <span className="flex h-12 items-end gap-1.5" aria-hidden>
          {[0.55, 0.9, 0.4, 1, 0.65].map((h, i) => (
            <span
              key={i}
              className="w-2.5 rounded-full bg-gradient-to-t from-primary to-rose-300"
              style={{
                height: `${h * 100}%`,
                opacity: 0.65,
                animation: `genbar ${1.4 + i * 0.18}s ease-in-out ${i * 0.12}s infinite alternate`,
              }}
            />
          ))}
        </span>
        <div className="flex flex-col items-center gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-200/70">
            SlyxUp Motion
          </p>
          <p
            aria-live="polite"
            className="text-sm font-medium tabular-nums text-white/90"
          >
            {line?.text ?? "Starting"}
            {line?.detail ? ` ${line.detail}` : ""}
          </p>
        </div>
        <div className="flex w-full max-w-56 flex-col gap-1.5">
          <div
            role="progressbar"
            aria-label="Progress"
            aria-valuenow={line?.pct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1 w-full overflow-hidden rounded-full bg-white/15"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-rose-300 shadow-[0_0_12px_var(--color-primary)] transition-[width] duration-500"
              style={{ width: `${line?.pct ?? 4}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] tabular-nums text-white/40">
            <span>Composing your cut</span>
            <span>{line?.pct ?? 4}%</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-medium text-white backdrop-blur transition-all duration-200 hover:bg-white/20 active:scale-95"
        >
          <Square className="size-3" />
          Stop
        </button>
      </div>
      <style>{`@keyframes genbar{from{transform:scaleY(0.3);opacity:.4}to{transform:scaleY(1);opacity:.9}}
@media (prefers-reduced-motion: reduce){@keyframes genbar{from{transform:none;opacity:.6}to{transform:none;opacity:.6}}}`}</style>
    </div>
  )
}

function agentFooter(t: MotionStudio): string | undefined {
  const active = t.active
  if (!active) return undefined
  const artifact = active.artifacts[active.activeVersion] as Artifact | undefined
  // No footer until something actually exists — no placeholder export line.
  if (!artifact) return undefined
  return active.spec
    ? `${active.spec.format} · v${active.activeVersion}`
    : `v${active.activeVersion}`
}

function StatusDot({ phase }: { phase: Phase }) {
  const meta = {
    thinking: { dot: "bg-sky-400", pulse: true, label: "Thinking" },
    generating: { dot: "bg-amber-400", pulse: true, label: "Composing" },
    ready: { dot: "bg-emerald-400", pulse: false, label: "Ready" },
    idle: { dot: "bg-muted-foreground/40", pulse: false, label: "Draft" },
  }[phase] ?? { dot: "bg-muted-foreground/40", pulse: false, label: "Draft" }
  return (
    <span className="flex shrink-0 items-center" title={meta.label}>
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          meta.dot,
          meta.pulse && "animate-pulse"
        )}
      />
      <span className="sr-only">{meta.label}</span>
    </span>
  )
}

export function PlaygroundPage({
  studio: t,
  projectId,
}: {
  studio: MotionStudio
  projectId: number | null
}) {
  const consumed = useRef(false)
  const [sideOpen, setSideOpen] = useState(true)
  const [navOpen, setNavOpen] = useState(false)
  const [shared, setShared] = useState(false)
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat")
  const [firstPrompt, setFirstPrompt] = useState<string | null>(null)

  // Route-driven project: slug wins, else pending handoff, else most
  // recent, else back to the dashboard. Runs once per mount.
  useEffect(() => {
    if (consumed.current) return
    consumed.current = true
    if (projectId != null) {
      const exists = t.projects.some((p) => p.id === projectId)
      if (exists) {
        t.selectProject(projectId)
        return
      }
      navigate("/studio", { replace: true })
      return
    }
    const created = t.consumePending()
    if (created != null) {
      setFirstPrompt(takeAgentHandoff(created))
      navigate(`/playground/${created}`, { replace: true })
      return
    }
    if (t.activeId != null) {
      navigate(`/playground/${t.activeId}`, { replace: true })
      return
    }
    if (t.projects.length > 0) {
      const recent = t.projects[0]
      t.selectProject(recent.id)
      navigate(`/playground/${recent.id}`, { replace: true })
      return
    }
    navigate("/studio", { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : ""
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", onKey)
    }
  }, [navOpen])

  const active = t.active
  // Preview shows ONLY composed versions — never a synthetic render.
  // No artifact means nothing was actually made (show the honest empty card).
  const preview = (active?.artifacts[active.activeVersion] as Artifact) ?? null

  useEffect(() => {
    if (!shared) return
    const t = setTimeout(() => setShared(false), 1600)
    return () => clearTimeout(t)
  }, [shared])

  const shareProject = async () => {
    if (!active) return
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/playground/${active.id}`
      )
      setShared(true)
    } catch {
      /* clipboard unavailable */
    }
  }

  /** Jump to the chat and focus the composer — the empty stage's CTA. */
  const goToChat = () => {
    setMobileTab("chat")
    window.setTimeout(() => {
      document
        .querySelector<HTMLTextAreaElement>('textarea[aria-label="Ask the agent"]')
        ?.focus()
    }, 60)
  }

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      {/* collapsible desktop sidebar — rail, never fully hidden */}
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 overflow-hidden border-r border-border/50 transition-all duration-300 lg:block",
          sideOpen ? "w-72" : "w-16"
        )}
      >
        <div className={cn("h-full transition-all", sideOpen ? "w-72" : "w-16")}>
          <StudioSidebar
            onNew={() => navigate("/studio")}
            collapsed={!sideOpen}
            onToggleCollapse={() => setSideOpen((v) => !v)}
            projects={t.projects}
            activeProjectId={t.activeId}
            onSelectProject={(id) => {
              t.selectProject(id)
              navigate(`/playground/${id}`)
            }}
            onDeleteProject={(id) => t.deleteProject(id)}
          />
        </div>
      </aside>

      {/* mobile slide-over */}
      <div
        aria-hidden={!navOpen}
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          !navOpen && "pointer-events-none"
        )}
      >
        <div
          onClick={() => setNavOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/40 transition-opacity duration-300",
            navOpen ? "opacity-100" : "opacity-0"
          )}
        />
        <aside
          className={cn(
            "absolute left-0 top-0 h-full w-72 max-w-[85vw] overflow-hidden rounded-r-2xl bg-background shadow-2xl transition-transform duration-300 ease-out",
            navOpen ? "translate-x-0" : "-translate-x-full"
          )}
          role="dialog"
          aria-label="Studio menu"
        >
          <StudioSidebar
            onNew={() => {
              navigate("/studio")
              setNavOpen(false)
            }}
            onNavigate={() => setNavOpen(false)}
            projects={t.projects}
            activeProjectId={t.activeId}
            onSelectProject={(id) => {
              t.selectProject(id)
              navigate(`/playground/${id}`)
            }}
            onDeleteProject={(id) => t.deleteProject(id)}
          />
        </aside>
      </div>

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3.5 backdrop-blur-xl sm:px-4">
          <Button
            variant="outline"
            size="icon"
            className="size-8 lg:hidden"
            onClick={() => setNavOpen(true)}
            aria-label="Open studio menu"
          >
            <PanelLeft />
          </Button>
          <button
            type="button"
            onClick={() => navigate("/studio")}
            aria-label="Back to all projects"
            title="Back to all projects"
            className="hidden size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
          >
            <ArrowLeft className="size-4" />
          </button>
          <nav
            className="flex min-w-0 items-center gap-1.5 truncate text-[13px]"
            aria-label="Breadcrumb"
          >
            <button
              type="button"
              onClick={() => navigate("/studio")}
              className="hidden shrink-0 font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              All projects
            </button>
            <span aria-hidden className="hidden shrink-0 text-border sm:block">
              /
            </span>
            <span className="truncate font-semibold tracking-[-0.01em]">
              {active ? active.name : "Playground"}
            </span>
            {active && <StatusDot phase={active.phase} />}
          </nav>
          <div className="flex-1" />
          {active?.designedBy && (
            <span
              title={`Composed by ${active.designedBy}`}
              className="hidden shrink-0 text-[11px] tabular-nums text-muted-foreground md:block"
            >
              by {active.designedBy.split("/").pop()}
            </span>
          )}
          {active && (
            <button
              type="button"
              onClick={shareProject}
              aria-label={shared ? "Link copied" : "Copy link to project"}
              title={shared ? "Link copied" : "Copy link to project"}
              className="hidden size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
            >
              {shared ? (
                <Check className="size-4 text-primary" />
              ) : (
                <Share2 className="size-4" />
              )}
            </button>
          )}
          {active && (
            <ExportMenu
              settings={active.exportSettings}
              onChange={t.updateExportSettings}
              onExportVideo={() => requestVideoExport()}
              disabled={!active.spec || active.versions === 0}
            />
          )}
        </header>

        <main className="flex flex-1 flex-col p-3 sm:p-4">
          {!active ? (
            <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed px-6 py-14 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
                <FolderOpen className="size-4 text-muted-foreground" />
              </span>
              <p className="text-[13px] font-semibold">No project open</p>
              <p className="max-w-xs text-[13px] text-muted-foreground">
                Generate a clip from the dashboard to open it here.
              </p>
              <Button size="sm" className="mt-1.5 h-8" asChild>
                <a href="/studio">Go to dashboard</a>
              </Button>
            </div>
          ) : (
            /* chat + preview side by side, always — no full-page takeover */
            <div className="flex h-[calc(100svh-5rem)] flex-col gap-3 xl:h-[calc(100svh-4.5rem)] xl:flex-row">
              <div className="sticky top-14 z-20 -mx-3 bg-background/90 px-3 py-2 backdrop-blur-xl xl:hidden">
                <div
                  role="tablist"
                  aria-label="Playground view"
                  className="grid shrink-0 grid-cols-2 gap-1 rounded-full border bg-card p-1"
                >
                {(
                  [
                    { id: "chat", label: "Chat", icon: MessageSquare },
                    { id: "preview", label: "Preview", icon: MonitorPlay },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={mobileTab === tab.id}
                    type="button"
                    onClick={() => setMobileTab(tab.id)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-full py-1.5 text-[13px] font-medium transition-colors",
                      mobileTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <tab.icon className="size-4" />
                    {tab.label}
                  </button>
                ))}
                </div>
              </div>

              {/* left: AI bar */}
              <section
                aria-label="AI chat"
                className={cn(
                  "min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card",
                  mobileTab === "chat" ? "flex" : "hidden",
                  "xl:flex xl:h-full xl:w-96 xl:flex-none"
                )}
              >
                {active && (
                  <AgentChatCard
                    key={active.id}
                    serverProjectId={active.serverId}
                    onEnsureServerProject={t.ensureServerProject}
                    onArtifact={(artifact, reply) => {
                      if (t.activeId != null) t.commitAgentResult(t.activeId, artifact, reply)
                    }}
                    legacyThread={(active.thread ?? []).map(({ role, text }) => ({ role, text }))}
                    attachments={active.attachments ?? []}
                    onAttachFiles={t.attachToActive}
                    onRemoveAttachment={t.removeActiveAttachment}
                    footer={agentFooter(t)}
                    firstPrompt={firstPrompt}
                  />
                )}
              </section>

              {/* right: screening room */}
              <section
                aria-label="Preview"
                className={cn(
                  "min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950 p-3 shadow-2xl sm:p-4",
                  mobileTab === "preview" ? "flex" : "hidden",
                  "xl:flex xl:h-full xl:flex-1"
                )}
              >
                <div
                  className={cn(
                    "m-auto w-full",
                    active.spec?.format === "9:16"
                      ? "max-w-[400px]"
                      : "max-w-3xl"
                  )}
                >
                  {/* version rail — only when there is something to compare */}
                  {active.versions > 1 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1 pb-3">
                      <div
                        role="group"
                        aria-label="Versions"
                        className="flex max-w-full items-center gap-1 overflow-x-auto"
                      >
                        {Array.from(
                          { length: active.versions },
                          (_, i) => i + 1
                        ).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => t.setActiveVersion(v)}
                            aria-label={`View version ${v}`}
                            aria-current={
                              v === active.activeVersion ? "true" : undefined
                            }
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors",
                              v === active.activeVersion
                                ? "bg-white text-black"
                                : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                            )}
                          >
                            v{v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(active.phase === "generating" || active.phase === "thinking") && (
                    <GeneratingShimmer
                      format={active.spec?.format ?? "16:9"}
                      onStop={() => t.stopGeneration()}
                      progress={t.genProgress}
                    />
                  )}
                  {active.phase !== "generating" && active.phase !== "thinking" && preview && (
                    <div key={active.activeVersion} className={stageFrameClass(active.spec?.format)}>
                      <ClipPlayer
                        artifact={preview}
                        title={active.name}
                        version={active.activeVersion}
                        container={active.exportSettings.container}
                        quality={active.exportSettings.quality}
                        framed={false}
                        onError={(errors) => t.repairVersion(active.id, active.activeVersion, errors)}
                      />
                    </div>
                  )}
                  {active.phase !== "generating" && active.phase !== "thinking" && !preview && (
                    <div
                      className={cn(
                        "relative m-auto w-full overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-2xl",
                        stageFrameClass(active.spec?.format)
                      )}
                    >
                      <div aria-hidden className="absolute inset-0 bg-grid-dark" />
                      <div
                        aria-hidden
                        className="absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl"
                      />
                      {/* film edging — centered, clipped, never stretched */}
                      <div aria-hidden className="absolute inset-x-0 top-0 flex justify-center gap-1.5 overflow-hidden px-4 pt-2 opacity-40">
                        {Array.from({ length: 40 }).map((_, i) => (
                          <span key={i} className="h-1.5 w-2.5 shrink-0 rounded-[2px] bg-white/25" />
                        ))}
                      </div>
                      <div aria-hidden className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 overflow-hidden px-4 pb-2 opacity-40">
                        {Array.from({ length: 40 }).map((_, i) => (
                          <span key={i} className="h-1.5 w-2.5 shrink-0 rounded-[2px] bg-white/25" />
                        ))}
                      </div>
                      <span className="absolute left-3 top-6 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur">
                        {active.spec?.format ?? "16:9"}
                      </span>
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                        <span className="relative flex size-16 items-center justify-center">
                          <span
                            aria-hidden
                            className="absolute inset-0 animate-ping rounded-2xl bg-primary/20"
                          />
                          <span className="relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-xl shadow-primary/40 ring-1 ring-white/25">
                            <Clapperboard className="size-7" />
                          </span>
                        </span>
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-200/70">
                            Screening room
                          </p>
                          <p className="text-lg font-semibold tracking-tight text-white">
                            {active.versions === 0 ? "Nothing here yet" : "Pick a version"}
                          </p>
                          <p className="max-w-xs text-[13px] leading-relaxed text-white/60">
                            {active.versions === 0
                              ? "Describe the motion in the chat — the first cut premieres on this screen."
                              : "The first cut is done — use the version rail above to compare, or ask for a change."}
                          </p>
                        </div>
                        {active.versions === 0 ? (
                          <Button
                            size="sm"
                            className="mt-1 h-8 cursor-pointer shadow-lg shadow-primary/30"
                            onClick={goToChat}
                          >
                            <MessageSquare />
                            Start in chat
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="mt-1 h-8 cursor-pointer xl:hidden"
                            onClick={() => setMobileTab("chat")}
                          >
                            <MessageSquare />
                            Open chat
                          </Button>
                        )}
                        </div>
                    </div>
                  )}

                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
