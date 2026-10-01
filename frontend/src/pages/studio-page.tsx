import { useEffect, useMemo, useState } from "react"
import {
  ArrowUpRight,
  Clapperboard,
  FolderOpen,
  LayoutGrid,
  List,
  PanelLeft,
  Play,
  Plus,
  Search,
  Trash2,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PromptBox } from "@/components/prompt-box"
import { StudioSidebar } from "@/components/studio/studio-sidebar"
import { useUser } from "@/lib/auth"
import { stashPendingPrompt, type MotionStudio } from "@/lib/use-motion-studio"
import { smalltalkReply } from "@/lib/motion"
import { navigate } from "@/lib/router"
import { cn } from "@/lib/utils"

function gotoEditor(id?: number) {
  navigate(id == null ? "/playground" : `/playground/${id}`)
}

function focusPrompt() {
  document
    .getElementById("dashboard-prompt")
    ?.scrollIntoView({ behavior: "smooth", block: "center" })
}

function timeAgo(ts: number): string {
  const diffMs = ts - Date.now()
  const absS = Math.abs(Math.floor(diffMs / 1000))
  if (absS < 60) return "Just now"
  try {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
    const m = Math.round(diffMs / 60000)
    if (Math.abs(m) < 60) return rtf.format(m, "minute")
    const h = Math.round(diffMs / 3600000)
    if (Math.abs(h) < 24) return rtf.format(h, "hour")
    const d = Math.round(diffMs / 86400000)
    if (Math.abs(d) < 7) return rtf.format(d, "day")
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleDateString()
  }
}

type CardProject = {
  id: number
  name: string
  spec: { style: string; format: string; duration: string } | null
  versions: number
  attachments: unknown[]
  updatedAt: number
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: CardProject
  onOpen: () => void
  onDelete: () => void
}) {
  const [arming, setArming] = useState(false)

  useEffect(() => {
    if (!arming) return
    const t = setTimeout(() => setArming(false), 2500)
    return () => clearTimeout(t)
  }, [arming])

  return (
    <article className="group relative overflow-hidden rounded-2xl border bg-card transition-all hover:border-primary/30 hover:shadow-md">
      <a
        href={`/playground/${project.id}`}
        onClick={(e) => {
          // Allow Cmd/Ctrl+click + middle-click to open in new tab.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
          e.preventDefault()
          onOpen()
        }}
        aria-label={`Open ${project.name} in the editor`}
        className="block w-full text-left"
      >
        <span className="relative flex aspect-video items-center justify-center overflow-hidden bg-zinc-950">
          <span aria-hidden className="absolute inset-0 bg-grid-dark opacity-60" />
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl"
          />
          {project.spec ? (
            <span className="relative flex flex-col items-center gap-1 px-4">
              <Clapperboard className="size-5 text-zinc-500" />
              <span className="text-sm font-medium capitalize text-zinc-200">
                {project.spec.style}
              </span>
              <span className="text-[11px] tabular-nums text-zinc-500">
                {project.spec.format} · {project.spec.duration}
              </span>
            </span>
          ) : (
            <span className="relative flex flex-col items-center gap-1.5">
              <Clapperboard className="size-5 text-zinc-600" />
              <span className="text-xs font-medium text-zinc-500">Draft</span>
            </span>
          )}
          <span className="absolute left-2.5 top-2.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur">
            {project.spec?.format ?? "Draft"}
          </span>
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums text-white backdrop-blur">
            {project.versions === 0 ? "No versions" : `v${project.versions}`}
          </span>
          <span
            aria-hidden
            className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/30"
          />
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-white text-zinc-950 shadow-lg">
              <Play className="size-4 translate-x-[1px] fill-current" />
            </span>
          </span>
        </span>
        <span className="block p-3.5">
          <span className="flex items-start justify-between gap-2">
            <span className="truncate text-sm font-semibold">
              {project.name}
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          </span>
          <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {project.spec
                ? `${project.spec.style} · ${project.spec.duration}`
                : "Describe it to render version 1"}
            </span>
          </span>
          <span className="mt-2.5 block border-t pt-2.5 text-[11px] tabular-nums text-muted-foreground">
            {timeAgo(project.updatedAt)}
            {project.attachments.length > 0 &&
              ` · ${project.attachments.length} reference${project.attachments.length > 1 ? "s" : ""}`}
          </span>
        </span>
      </a>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (arming) {
            onDelete()
          } else {
            setArming(true)
          }
        }}
        aria-label={arming ? `Confirm delete ${project.name}` : `Delete ${project.name}`}
        title={arming ? "Click again to confirm delete" : "Delete video"}
        className={
          arming
            ? "absolute right-2.5 top-2.5 min-h-[44px] rounded-lg bg-destructive px-3 py-2 text-[11px] font-semibold text-white shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2"
            : "absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-lg bg-black/50 text-white backdrop-blur transition-colors hover:bg-destructive focus-visible:outline-2 focus-visible:outline-offset-2 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
        }
      >
        {arming ? "Confirm?" : <Trash2 className="size-3.5" />}
      </button>
    </article>
  )
}

function ProjectListRow({
  project,
  onOpen,
  onDelete,
}: {
  project: CardProject
  onOpen: () => void
  onDelete: () => void
}) {
  const [arming, setArming] = useState(false)

  useEffect(() => {
    if (!arming) return
    const t = setTimeout(() => setArming(false), 2500)
    return () => clearTimeout(t)
  }, [arming])

  return (
    <div className="group flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 transition-colors hover:border-primary/30">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${project.name} in the editor`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-zinc-400"
        >
          <Clapperboard className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">
              {project.name}
            </span>
            <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-secondary-foreground">
              {project.versions === 0 ? "Draft" : `v${project.versions}`}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {project.spec
              ? `${project.spec.style} · ${project.spec.format} · ${project.spec.duration}`
              : "Draft — render version 1 to begin"}
          </span>
        </span>
      </button>
      <span className="hidden shrink-0 text-[11px] tabular-nums text-muted-foreground sm:block">
        {timeAgo(project.updatedAt)}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (arming) onDelete()
          else setArming(true)
        }}
        aria-label={arming ? `Confirm delete ${project.name}` : `Delete ${project.name}`}
        title={arming ? "Click again to confirm delete" : "Delete video"}
        className={cn(
          "flex h-8 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
          arming
            ? "bg-destructive px-2.5 text-[11px] font-semibold text-white"
            : "px-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 lg:focus-visible:opacity-100"
        )}
      >
        {arming ? "Confirm?" : <Trash2 className="size-3.5" />}
      </button>
    </div>
  )
}

export function StudioPage({ studio: t }: { studio: MotionStudio }) {
  const user = useUser()
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"grid" | "list">(() => {
    try {
      return localStorage.getItem("motion:studio-view:v1") === "list"
        ? "list"
        : "grid"
    } catch {
      return "grid"
    }
  })

  const changeView = (v: "grid" | "list") => {
    setView(v)
    try {
      localStorage.setItem("motion:studio-view:v1", v)
    } catch {
      /* storage unavailable */
    }
  }

  const term = query.trim().toLowerCase()
  const visible = useMemo(
    () =>
      term
        ? t.projects.filter(
            (p) =>
              p.name.toLowerCase().includes(term) ||
              (p.spec?.style ?? "").toLowerCase().includes(term)
          )
        : t.projects,
    [t.projects, term]
  )

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

  const handleGenerate = (prompt: string, format: string, secs: number) => {
    stashPendingPrompt(prompt, format, t.staged, smalltalkReply(prompt) ?? undefined, secs)
    gotoEditor()
  }

  const openProject = (id: number) => {
    t.selectProject(id)
    gotoEditor(id)
  }

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 overflow-hidden border-r transition-all duration-300 lg:block",
          collapsed ? "w-16" : "w-72"
        )}
      >
        <div className={cn("h-full transition-all", collapsed ? "w-16" : "w-72")}>
          <StudioSidebar
            onNew={focusPrompt}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((v) => !v)}
            projects={t.projects}
            activeProjectId={t.activeId}
            onSelectProject={(id) => openProject(id)}
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
            "absolute left-0 top-0 h-full w-72 max-w-[85vw] overflow-hidden overscroll-contain bg-background shadow-2xl transition-transform duration-300 ease-out",
            navOpen ? "translate-x-0" : "-translate-x-full"
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Projects menu"
        >
          <StudioSidebar
            onNew={() => {
              focusPrompt()
              setNavOpen(false)
            }}
            onNavigate={() => setNavOpen(false)}
            projects={t.projects}
            activeProjectId={t.activeId}
            onSelectProject={(id) => openProject(id)}
            onDeleteProject={(id) => t.deleteProject(id)}
          />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3.5 backdrop-blur-xl sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 lg:hidden"
            onClick={() => setNavOpen(true)}
            aria-label="Open projects menu"
          >
            <PanelLeft />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold">
              Projects
            </h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {t.projects.length === 0
                ? "Your video library — create your first clip below"
                : `${t.projects.length} video${t.projects.length === 1 ? "" : "s"} in your library`}
            </p>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => navigate("/settings")}
            title="Plan and billing"
            aria-label="Plan and billing settings"
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Zap className="size-3.5 text-primary" />
            <span className="hidden min-[420px]:inline">
              {user?.plan ?? "Free plan"}
            </span>
          </button>
          <label className="relative hidden items-center sm:flex">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
            <input
              id="studio-search"
              type="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search videos…"
              aria-label="Search videos"
              className="h-9 w-44 rounded-lg border bg-background pl-8 pr-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15 lg:w-56"
            />
          </label>
          <Button size="sm" className="h-8 sm:hidden" onClick={focusPrompt} aria-label="New video">
            <Plus />
            New
          </Button>
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 p-4 outline-none sm:p-6">
          <section
            aria-label="Create a new video"
            className="rounded-2xl border bg-card p-5 sm:p-6"
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-lg">Create a new video</h2>
              <p className="text-sm text-muted-foreground">
                Describe the shot. The editor opens and renders version 1 —
                it is saved here automatically.
              </p>
            </div>
            <div className="mt-4">
              <PromptBox
                id="dashboard-prompt"
                onGenerate={handleGenerate}
                showHint={false}
                attachments={t.staged}
                onAttachFiles={t.stageFiles}
                onRemoveAttachment={t.removeStaged}
              />
            </div>
          </section>

          <section aria-label="Your videos">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[15px] font-semibold">Your videos</h2>
              <Badge variant="secondary">
                {term ? `${visible.length}/${t.projects.length}` : t.projects.length}
              </Badge>              {term && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear “{query.trim()}”
                </button>
              )}
              <div className="flex-1" />
              {t.projects.length > 0 && (
                <div
                  role="group"
                  aria-label="Videos view"
                  className="flex items-center gap-0.5 rounded-lg border p-0.5"
                >
                  {(
                    [
                      { id: "grid", icon: LayoutGrid, label: "Grid view" },
                      { id: "list", icon: List, label: "List view" },
                    ] as const
                  ).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => changeView(v.id)}
                      aria-label={v.label}
                      aria-pressed={view === v.id}
                      title={v.label}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md transition-colors",
                        view === v.id
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <v.icon className="size-3.5" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {t.projects.length > 0 && (
              <label className="relative mt-3 flex items-center sm:hidden">
                <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
                <input
                  id="studio-search-mobile"
                  type="search"
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search videos…"
                  aria-label="Search videos"
                  className="h-11 w-full rounded-lg border bg-background pl-9 pr-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                />
              </label>
            )}
            {t.projects.length === 0 ? (
              <div className="mt-3.5 flex flex-col items-center gap-1.5 rounded-2xl border border-dashed px-6 py-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-xl bg-secondary">
                  <FolderOpen className="size-4 text-muted-foreground" />
                </span>
                <p className="text-sm font-semibold">No videos yet</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Use the composer above — your first video and its version 1
                  will appear here.
                </p>
              </div>
            ) : visible.length === 0 ? (
              <div className="mt-3.5 flex flex-col items-center gap-1.5 rounded-2xl border border-dashed px-6 py-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-xl bg-secondary">
                  <Search className="size-4 text-muted-foreground" />
                </span>
                <p className="text-sm font-semibold">No matches</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Nothing matches “{query.trim()}”. Try a different search.
                </p>
              </div>
            ) : view === "grid" ? (
              <div className="mt-3.5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onOpen={() => openProject(p.id)}
                    onDelete={() => t.deleteProject(p.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-3.5 flex flex-col gap-2">
                {visible.map((p) => (
                  <ProjectListRow
                    key={p.id}
                    project={p}
                    onOpen={() => openProject(p.id)}
                    onDelete={() => t.deleteProject(p.id)}
                  />
                ))}
              </div>
            )}
            {t.projects.length > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Tip: selecting a video opens it in the editor, where you
                describe changes in the chat and compare versions.
              </p>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
