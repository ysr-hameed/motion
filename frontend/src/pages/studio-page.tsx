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
  Sparkles,
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

function gotoPlayground(id?: number) {
  navigate(id == null ? "/playground" : `/playground/${id}`)
}

function focusPrompt() {
  document
    .getElementById("dashboard-prompt")
    ?.scrollIntoView({ behavior: "smooth", block: "center" })
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return "Just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return "Yesterday"
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: {
    id: number
    name: string
    spec: { style: string; format: string; duration: string } | null
    versions: number
    attachments: unknown[]
    updatedAt: number
  }
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
    <article className="group relative overflow-hidden rounded-2xl border bg-card text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${project.name}`}
        className="block w-full text-left"
      >
        {/* film-frame thumb: sprocket edging + style identity */}
        <span className="relative flex aspect-[16/8] items-center justify-center overflow-hidden bg-neutral-950">
          <span
            aria-hidden
            className="absolute inset-0 bg-grid-dark opacity-70"
          />
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-3 film-sprockets"
          />
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-3 film-sprockets"
          />
          {project.spec ? (
            <span className="relative flex flex-col items-center gap-1 px-4">
              <span
                aria-hidden
                className="font-display text-4xl font-bold tracking-tight text-white/90"
              >
                {project.spec.style.charAt(0).toUpperCase()}
              </span>
              <span className="text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
                {project.spec.style}
              </span>
            </span>
          ) : (
            <span className="relative flex flex-col items-center gap-1.5">
              <Clapperboard className="size-6 text-white/40" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
                Draft
              </span>
            </span>
          )}
          {project.spec && (
            <span className="absolute left-2.5 top-5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur">
              {project.spec.format}
            </span>
          )}
          <span className="absolute bottom-5 right-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] tabular-nums text-white backdrop-blur">
            {project.versions === 0 ? "No versions" : `v${project.versions}`}
          </span>
          {/* hover: dim + play reveal — this opens the motion */}
          <span
            aria-hidden
            className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/35"
          />
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          >
            <span className="flex size-11 scale-90 items-center justify-center rounded-full bg-white text-black shadow-xl transition-transform duration-300 group-hover:scale-100">
              <Play className="size-4 translate-x-[2px] fill-current" />
            </span>
          </span>
        </span>
        <span className="block p-3.5">
          <span className="flex items-start justify-between gap-2">
            <span className="truncate text-[13px] font-semibold tracking-[-0.01em]">
              {project.name}
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {project.spec
              ? `${project.spec.style} · ${project.spec.duration}`
              : "Draft — generate to start versioning"}
          </span>
          <span className="mt-2.5 block border-t pt-2.5 text-[11px] tabular-nums text-muted-foreground">
            {timeAgo(project.updatedAt)}
            {project.attachments.length > 0 &&
              ` · ${project.attachments.length} ref${project.attachments.length > 1 ? "s" : ""}`}
          </span>
        </span>
      </button>
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
        aria-label={arming ? "Confirm delete" : `Delete ${project.name}`}
        title={arming ? "Click again to confirm" : "Delete project"}
        className={
          arming
            ? "absolute right-2.5 top-5 rounded-full bg-destructive px-2.5 py-1 text-[10px] font-bold text-white shadow-lg"
            : "absolute right-2.5 top-5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition-opacity hover:bg-destructive focus-visible:opacity-100 group-hover:opacity-100"
        }
      >
        {arming ? "Sure?" : <Trash2 className="size-3" />}
      </button>
    </article>
  )
}

function ProjectListRow({
  project,
  onOpen,
  onDelete,
}: {
  project: {
    id: number
    name: string
    spec: { style: string; format: string; duration: string } | null
    versions: number
    attachments: unknown[]
    updatedAt: number
  }
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
    <div className="group flex items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 transition-colors hover:border-primary/40">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${project.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-[13px] font-bold text-white"
        >
          {project.spec ? project.spec.style.charAt(0).toUpperCase() : "–"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold tracking-[-0.01em]">
              {project.name}
            </span>
            <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-secondary-foreground">
              {project.versions === 0 ? "No versions" : `v${project.versions}`}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {project.spec
              ? `${project.spec.style} · ${project.spec.format} · ${project.spec.duration}`
              : "Draft — generate to start versioning"}
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
        aria-label={arming ? "Confirm delete" : `Delete ${project.name}`}
        title={arming ? "Click again to confirm" : "Delete project"}
        className={cn(
          "flex h-7 shrink-0 items-center justify-center rounded-full transition-colors",
          arming
            ? "bg-destructive px-2.5 text-[11px] font-bold text-white"
            : "size-7 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        )}
      >
        {arming ? "Sure?" : <Trash2 className="size-3.5" />}
      </button>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
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

  const totalVersions = useMemo(
    () => t.projects.reduce((n, p) => n + p.versions, 0),
    [t.projects]
  )

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
    gotoPlayground()
  }

  const openProject = (id: number) => {
    t.selectProject(id)
    gotoPlayground(id)
  }

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      {/* desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 overflow-hidden border-r border-border/50 transition-all duration-300 lg:block",
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

      {/* mobile sidebar */}
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

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3.5 backdrop-blur-xl sm:px-4">
          <Button
            variant="outline"
            size="icon"
            className="size-8 lg:hidden"
            onClick={() => setNavOpen(true)}
            aria-label="Open studio menu"
          >
            <PanelLeft />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-tight">
              Dashboard
            </h1>
            <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
              {t.projects.length === 0
                ? "Describe a clip to create your first project"
                : `${t.projects.length} project${t.projects.length === 1 ? "" : "s"} in your workspace`}
            </p>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => navigate("/settings")}
            title="Plan & billing"
            aria-label="Plan and billing settings"
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
              className="h-8 w-44 rounded-full border bg-background pl-8 pr-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring lg:w-56"
            />
          </label>
          <Button
            size="sm"
            className="h-8 sm:hidden"
            onClick={focusPrompt}
            aria-label="New project"
          >
            <Plus />
            New
          </Button>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 p-4 sm:p-5">
          {/* prompt entry */}
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 pt-4 text-center">
            {t.projects.length > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                <span
                  aria-hidden
                  className="size-1.5 animate-pulse rounded-full bg-primary"
                />
                {t.projects.length} project
                {t.projects.length === 1 ? "" : "s"} · {totalVersions}{" "}
                version{totalVersions === 1 ? "" : "s"} in the cutting room
              </span>
            ) : (
              <Badge variant="secondary" className="gap-1.5 text-[11px]">
                <Sparkles className="size-3" />
                New generation
              </Badge>
            )}
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
              What are we making today?
            </h2>
            <p className="-mt-2 text-[13px] text-muted-foreground sm:text-sm">
              Describe a clip — the playground opens and your project lands
              below with its first version.
            </p>
            <div className="relative w-full">
              <div
                aria-hidden
                className="absolute -inset-2 rounded-[1.75rem] bg-primary/10 blur-2xl"
              />
              <div className="relative">
                <PromptBox
                  id="dashboard-prompt"
                  onGenerate={handleGenerate}
                  showHint={false}
                  attachments={t.staged}
                  onAttachFiles={t.stageFiles}
                  onRemoveAttachment={t.removeStaged}
                />
              </div>
            </div>
          </div>

          {/* my projects */}
          <section aria-label="My projects">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[15px] font-semibold tracking-tight">
                My projects
              </h2>
              <Badge variant="secondary" className="text-[11px]">
                {term ? `${visible.length}/${t.projects.length}` : t.projects.length}
              </Badge>
              {term && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear “{query.trim()}”
                </button>
              )}
              <div className="flex-1" />
              {t.projects.length > 0 && (
                <div
                  role="group"
                  aria-label="Projects view"
                  className="flex items-center gap-0.5 rounded-full border p-0.5"
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
                        "flex size-7 items-center justify-center rounded-full transition-colors",
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
            {t.projects.length === 0 ? (
              <div className="mt-3.5 flex flex-col items-center gap-1.5 rounded-2xl border border-dashed px-6 py-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
                  <FolderOpen className="size-4 text-muted-foreground" />
                </span>
                <p className="text-[13px] font-semibold">No projects yet</p>
                <p className="max-w-xs text-[13px] text-muted-foreground">
                  Describe a clip above — the playground opens and your first
                  project lands here.
                </p>
              </div>
            ) : visible.length === 0 ? (
              <div className="mt-3.5 flex flex-col items-center gap-1.5 rounded-2xl border border-dashed px-6 py-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
                  <Search className="size-4 text-muted-foreground" />
                </span>
                <p className="text-[13px] font-semibold">No matches</p>
                <p className="max-w-xs text-[13px] text-muted-foreground">
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
          </section>
        </main>
      </div>
    </div>
  )
}
