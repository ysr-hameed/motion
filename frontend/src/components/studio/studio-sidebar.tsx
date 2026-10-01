import { useEffect, useState } from "react"
import {
  Check,
  LayoutGrid,
  LogIn,
  PanelLeftClose,
  PanelLeftOpen,
  PenSquare,
  Search,
  Settings,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { UserButton } from "@/components/user-button"
import { useUser, userInitials } from "@/lib/auth"
import { navigate, usePathRoute } from "@/lib/router"
import { cn } from "@/lib/utils"

export interface SidebarProjectItem {
  id: number
  name: string
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </p>
  )
}

function NavItem({
  icon: Icon,
  label,
  hint,
  active = false,
  count,
  onClick,
}: {
  icon: LucideIcon
  label: string
  hint?: string
  active?: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={hint ?? label}
      className={cn(
        "group flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
        )}
      />
      <span className="truncate">{label}</span>
      {count != null && count > 0 && (
        <span className="ml-auto shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] tabular-nums text-secondary-foreground">
          {count}
        </span>
      )}
    </button>
  )
}

function ProjectRow({
  project,
  active = false,
  onOpen,
  onDelete,
}: {
  project: SidebarProjectItem
  active?: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const [arming, setArming] = useState(false)

  useEffect(() => {
    if (!arming) return
    const t = setTimeout(() => setArming(false), 2500)
    return () => clearTimeout(t)
  }, [arming])

  if (arming) {
    return (
      <div className="flex h-9 items-center gap-1 rounded-lg bg-destructive/10 px-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-medium text-destructive">
          Delete this video?
        </span>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Confirm delete ${project.name}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive hover:text-white"
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setArming(false)}
          aria-label="Cancel delete"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group flex h-9 items-center gap-0.5 rounded-lg py-0 pl-2.5 pr-1 text-sm transition-colors",
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "page" : undefined}
        title={project.name}
        className="min-w-0 flex-1 truncate px-0 text-left font-medium"
      >
        {project.name}
      </button>
      <button
        type="button"
        onClick={() => setArming(true)}
        aria-label={`Delete ${project.name}`}
        title={`Delete ${project.name}`}
        className="flex size-8 min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

export function StudioSidebar({
  onNew,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
  projects = [],
  activeProjectId = null,
  onSelectProject,
  onDeleteProject,
}: {
  onNew: () => void
  onNavigate?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  projects?: SidebarProjectItem[]
  activeProjectId?: number | null
  onSelectProject?: (id: number) => void
  onDeleteProject?: (id: number) => void
}) {
  const user = useUser()
  const path = usePathRoute()
  const [dismissedTip, setDismissedTip] = useState(() => {
    try {
      return localStorage.getItem("motion:sidebar-tip:v1") === "1"
    } catch {
      return false
    }
  })
  const dismissTip = () => {
    setDismissedTip(true)
    try {
      localStorage.setItem("motion:sidebar-tip:v1", "1")
    } catch {
      /* storage unavailable */
    }
  }
  const onProjects = path === "/studio"
  const onEditor = path.startsWith("/playground")
  const onSettings = path === "/settings"

  const goProjects = () => {
    navigate("/studio")
    onNavigate?.()
  }

  const goSettings = () => {
    navigate("/settings")
    onNavigate?.()
  }

  const openProject = (id: number) => {
    onSelectProject?.(id)
    onNavigate?.()
  }

  const focusSearch = () => {
    const focusVisibleSearch = () => {
      // Header search is desktop-only; the section search is mobile-only.
      const mobile = document.getElementById("studio-search-mobile")
      const target =
        mobile && mobile.offsetParent
          ? mobile
          : document.getElementById("studio-search")
      ;(target as HTMLInputElement | null)?.focus()
    }
    if (path !== "/studio") {
      navigate("/studio")
      onNavigate?.()
      window.setTimeout(focusVisibleSearch, 450)
      return
    }
    if (collapsed) onToggleCollapse?.()
    onNavigate?.()
    window.setTimeout(focusVisibleSearch, collapsed ? 350 : 0)
  }

  if (collapsed) {
    return (
      <div className="flex h-full flex-col bg-sidebar">
        <div className="flex h-14 shrink-0 items-center justify-center border-b border-sidebar-border">
          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-muted"
            >
              <PanelLeftOpen className="size-4 text-muted-foreground" />
            </button>
          ) : (
            <Logo showText={false} />
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 p-2">
          <Button
            size="icon"
            className="size-9 shrink-0"
            onClick={() => {
              onNew()
              onNavigate?.()
            }}
            aria-label="New video"
            title="New video"
          >
            <PenSquare />
          </Button>

          <nav aria-label="Primary" className="mt-2 flex w-full flex-col items-center gap-1">
            <button
              type="button"
              onClick={goProjects}
              aria-current={onProjects ? "page" : undefined}
              aria-label="Projects"
              title="Projects — your video library"
              className={cn(
                "flex size-9 items-center justify-center rounded-lg transition-colors",
                onProjects
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              onClick={focusSearch}
              aria-label="Search videos"
              title="Search videos"
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Search className="size-4" />
            </button>
          </nav>

          <div className="flex-1" />
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1 border-t border-sidebar-border p-2">
          <button
            type="button"
            onClick={goSettings}
            aria-label="Settings"
            title="Settings"
            className={cn(
              "flex size-9 items-center justify-center rounded-lg transition-colors",
              onSettings
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Settings className="size-4" />
          </button>
          {user ? (
            onToggleCollapse ? (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label={`${user.name} — expand sidebar for account`}
                title={user.name}
                className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-[13px] font-semibold text-primary transition-transform hover:scale-105"
              >
                {userInitials(user)}
              </button>
            ) : (
              <UserButton align="left" side="top" />
            )
          ) : (
            <button
              type="button"
              onClick={() => {
                navigate("/login")
                onNavigate?.()
              }}
              aria-label="Log in"
              title="Log in"
              className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <LogIn className="size-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-sidebar-border pl-3 pr-2">
        <Logo showText />
        <div className="flex-1" />
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <Button
          className="h-9 w-full shrink-0"
          onClick={() => {
            onNew()
            onNavigate?.()
          }}
        >
          <PenSquare />
          New video
        </Button>

        <nav aria-label="Primary" className="mt-4 w-full shrink-0">
          <SectionLabel>Workspace</SectionLabel>
          <div className="flex flex-col gap-0.5">
            <NavItem
              icon={LayoutGrid}
              label="Projects"
              hint="Projects — your video library"
              active={onProjects}
              count={projects.length}
              onClick={goProjects}
            />
            <NavItem
              icon={Search}
              label="Search"
              hint="Search your videos"
              onClick={focusSearch}
            />
          </div>
        </nav>

        {onEditor && activeProjectId != null && !dismissedTip && (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/[0.06] px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
            <div className="flex items-start justify-between gap-2">
              <p>
                You are editing one video. Use{" "}
                <button
                  type="button"
                  onClick={goProjects}
                  className="font-medium text-primary hover:underline"
                >
                  Projects
                </button>{" "}
                to switch videos.
              </p>
              <button
                type="button"
                onClick={dismissTip}
                aria-label="Dismiss tip"
                className="flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-muted"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex min-h-0 w-full flex-1 flex-col">
          <SectionLabel>Recent videos</SectionLabel>
          {projects.length === 0 ? (
            <p className="px-2 text-xs leading-relaxed text-muted-foreground">
              No videos yet — describe a clip above to create your first one.
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-1">
              {projects.slice(0, 30).map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  active={p.id === activeProjectId}
                  onOpen={() => openProject(p.id)}
                  onDelete={() => onDeleteProject?.(p.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <NavItem
          icon={Settings}
          label="Settings"
          active={onSettings}
          onClick={goSettings}
        />
        {user ? (
          <div className="mt-1.5 flex items-center justify-start gap-2 rounded-lg px-1.5 py-1.5">
            <UserButton align="left" side="top" />
            <div className="min-w-0 text-left">
              <p className="truncate text-[13px] font-semibold">{user.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {user.plan}
              </p>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-1.5 w-full"
            onClick={() => {
              navigate("/login")
              onNavigate?.()
            }}
          >
            <LogIn />
            Log in
          </Button>
        )}
      </div>
    </div>
  )
}
