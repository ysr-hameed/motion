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
 * Projects = your video library. Editor = the workspace for one video,
 * with the assistant on the left and the preview on the right.
 * The route is still /playground/:id — only the labels changed.
 */
function stageFrameClass(format: string | undefined) {
  if (format === "9:16")
    return "mx-auto aspect-[9/16] w-[min(100%,calc((100svh_-_14rem)*9/16))]"
  if (format === "1:1")
    return "mx-auto aspect-square w-[min(100%,calc(100svh_-_14rem))]"
  return "aspect-video w-full"
}

function GeneratingCard({
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
        "relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950",
        stageFrameClass(format)
      )}
    >
      <div aria-hidden className="absolute inset-0 bg-grid-dark opacity-70" />
      <div
        aria-hidden
        className="absolute left-1/2 top-1/3 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl"
      />
      <span className="absolute left-3 top-3 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
        {format}
      </span>
      <span className="absolute right-3 top-3 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-300">
        {elapsed}s
      </span>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-medium tabular-nums text-white" aria-live="polite">
            {line?.text ?? "Starting"}
            {line?.detail ? ` — ${line.detail}` : ""}
          </p>
          <p className="text-xs text-zinc-400">Rendering version… you can stop anytime</p>
        </div>
        <div className="flex w-full max-w-56 flex-col gap-1.5">
          <div
            role="progressbar"
            aria-label="Render progress"
            aria-valuenow={line?.pct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${line?.pct ?? 4}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] tabular-nums text-zinc-500">
            <span>Composing</span>
            <span>{line?.pct ?? 4}%</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
        >
          <Square className="size-3" />
          Stop
        </button>
      </div>
    </div>
  )
}

function agentFooter(t: MotionStudio): string | undefined {
  const active = t.active
  if (!active) return undefined
  const artifact = active.artifacts[active.activeVersion] as Artifact | undefined
  if (!artifact) return undefined
  return active.spec
    ? `${active.spec.format} · Version ${active.activeVersion}`
    : `Version ${active.activeVersion}`
}

function StatusPill({ phase }: { phase: Phase }) {
  const meta = {
    thinking: { dot: "bg-sky-400", pulse: true, label: "Working" },
    generating: { dot: "bg-amber-400", pulse: true, label: "Rendering" },
    ready: { dot: "bg-emerald-500", pulse: false, label: "Ready" },
    idle: { dot: "bg-zinc-400", pulse: false, label: "Draft" },
  }[phase] ?? { dot: "bg-zinc-400", pulse: false, label: "Draft" }
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium"
      title={meta.label}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", meta.dot, meta.pulse && "animate-pulse")}
      />
      {meta.label}
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

  const goToChat = () => {
    setMobileTab("chat")
    window.setTimeout(() => {
      document
        .querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')
        ?.focus()
    }, 60)
  }

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 overflow-hidden border-r transition-all duration-300 lg:block",
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
            "absolute left-0 top-0 h-full w-72 max-w-[85vw] overflow-hidden bg-background shadow-2xl transition-transform duration-300 ease-out",
            navOpen ? "translate-x-0" : "-translate-x-full"
          )}
          role="dialog"
          aria-label="Projects menu"
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

      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-3.5 backdrop-blur-xl sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 lg:hidden"
            onClick={() => setNavOpen(true)}
            aria-label="Open projects menu"
          >
            <PanelLeft />
          </Button>
          <button
            type="button"
            onClick={() => navigate("/studio")}
            aria-label="Back to projects"
            title="Back to projects"
            className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
          >
            <ArrowLeft className="size-4" />
          </button>
          <nav
            className="flex min-w-0 items-center gap-2 truncate text-sm"
            aria-label="Breadcrumb"
          >
            <button
              type="button"
              onClick={() => navigate("/studio")}
              className="hidden shrink-0 font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Projects
            </button>
            <span aria-hidden className="hidden shrink-0 text-border sm:block">
              /
            </span>
            <span className="truncate font-semibold">
              {active ? active.name : "Editor"}
            </span>
            {active && <StatusPill phase={active.phase} />}
          </nav>
          <div className="flex-1" />
          {active && (
            <button
              type="button"
              onClick={shareProject}
              aria-label={shared ? "Link copied" : "Copy link to video"}
              title={shared ? "Link copied" : "Copy link to video"}
              className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
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

        <main className="flex min-h-0 flex-1 flex-col overflow-x-clip p-2 sm:p-3">
          {!active ? (
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed px-6 py-12 text-center">
              <span className="flex size-10 items-center justify-center rounded-xl bg-secondary">
                <FolderOpen className="size-4 text-muted-foreground" />
              </span>
              <p className="text-sm font-semibold">No video open</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Create a video from Projects to open it in the editor.
              </p>
              <Button size="sm" className="mt-1.5 h-8" asChild>
                <a href="/studio">Go to projects</a>
              </Button>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2 xl:h-[calc(100svh-4.5rem)] xl:flex-row xl:overflow-hidden">
              <div className="shrink-0 xl:hidden">
                <div
                  role="tablist"
                  aria-label="Editor view"
                  className="grid shrink-0 grid-cols-2 gap-1 rounded-xl border bg-card p-1"
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
                      "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[13px] font-medium transition-colors",
                      mobileTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <tab.icon className="size-4" />
                    {tab.label}
                    {tab.id === "preview" && active.versions > 0 && (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-px text-[10px] font-semibold tabular-nums",
                          mobileTab === tab.id
                            ? "bg-white/20 text-white"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        v{active.activeVersion}
                      </span>
                    )}
                  </button>
                ))}
                </div>
              </div>

              <section
                aria-label="Chat"
                className={cn(
                  "min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border bg-card",
                  "h-[calc(100dvh-11.5rem)] min-h-[320px]",
                  mobileTab === "chat" ? "flex flex-1" : "hidden",
                  "xl:flex xl:h-full xl:min-h-0 xl:w-[400px] xl:max-w-[440px] xl:flex-none"
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

              <section
                aria-label="Preview"
                className={cn(
                  "min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950",
                  "h-[calc(100dvh-11.5rem)] min-h-[320px]",
                  mobileTab === "preview" ? "flex flex-1" : "hidden",
                  "xl:flex xl:h-full xl:min-h-0 xl:flex-1"
                )}
              >
                <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                    <MonitorPlay className="size-3.5" />
                    Preview
                  </span>
                  <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                    {active.spec?.format ?? "16:9"}
                  </span>
                  <div className="flex-1" />
                  {active.versions > 1 && (
                    <div
                      role="group"
                      aria-label="Versions"
                      className="flex max-w-[50vw] items-center gap-1 overflow-x-auto sm:max-w-none"
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
                            "shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums transition-colors",
                            v === active.activeVersion
                              ? "bg-white text-zinc-950"
                              : "bg-white/10 text-zinc-300 hover:bg-white/20 hover:text-white"
                          )}
                        >
                          v{v}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
                <div
                  className={cn(
                    "m-auto w-full",
                    active.spec?.format === "9:16"
                      ? "max-w-[400px]"
                      : "max-w-3xl"
                  )}
                >

                  {(active.phase === "generating" || active.phase === "thinking") && (
                    <GeneratingCard
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
                        "relative m-auto w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-950",
                        stageFrameClass(active.spec?.format)
                      )}
                    >
                      <div aria-hidden className="absolute inset-0 bg-grid-dark opacity-70" />
                      <span className="absolute left-3 top-3 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                        {active.spec?.format ?? "16:9"}
                      </span>
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-5 text-center">
                        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                          <Clapperboard className="size-5" />
                        </span>
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-base font-semibold text-white">
                            {active.versions === 0 ? "No preview yet" : "Select a version"}
                          </p>
                          <p className="max-w-xs text-[13px] leading-relaxed text-zinc-400">
                            {active.versions === 0
                              ? "Describe the clip in the chat — version 1 will render here."
                              : "Use the version buttons above to compare, or ask for a change."}
                          </p>
                        </div>
                        {active.versions === 0 ? (
                          <Button
                            size="sm"
                            className="mt-1 h-8"
                            onClick={goToChat}
                          >
                            <MessageSquare />
                            Describe your clip
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="mt-1 h-8 xl:hidden"
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
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
