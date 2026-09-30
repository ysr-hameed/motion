import { useEffect, useState } from "react"
import {
  Check,
  LayoutGrid,
  LogIn,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
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
    <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
      {children}
    </p>
  )
}

function NavItem({
  icon: Icon,
  label,
  active = false,
  count,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium tracking-[-0.01em] transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0 transition-colors",
          active
            ? "text-primary"
            : "text-muted-foreground/70 group-hover:text-foreground"
        )}
      />
      <span className="truncate">{label}</span>
      {count != null && count > 0 && (
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
          {count}
        </span>
      )}
    </button>
  )
}

function RailIconButton({
  icon: Icon,
  label,
  active = false,
  hint,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={hint ? `${label} · ${hint}` : label}
      title={hint ? `${label} · ${hint}` : label}
      className={cn(
        "relative mx-auto flex size-9 items-center justify-center rounded-lg transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground/70 hover:bg-accent/60 hover:text-foreground"
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          active ? "text-primary" : "text-current"
        )}
      />
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
      <div className="flex h-8 items-center gap-0.5 rounded-lg bg-destructive/10 px-2 text-[12px]">
        <span className="min-w-0 flex-1 truncate font-medium text-destructive">
          Delete?
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
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group flex h-8 items-center gap-0.5 rounded-lg py-0 pl-2.5 pr-1 text-[13px] transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "page" : undefined}
        title={project.name}
        className="min-w-0 flex-1 truncate px-0 text-left font-medium tracking-[-0.01em]"
      >
        {project.name}
      </button>
      <button
        type="button"
        onClick={() => setArming(true)}
        aria-label={`Delete ${project.name}`}
        title={`Delete ${project.name}`}
        className="hidden size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:flex group-focus-within:flex"
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
  const onStudio = path === "/studio"
  const onSettings = path === "/settings"

  const goStudio = () => {
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
    if (path !== "/studio") {
      navigate("/studio")
      onNavigate?.()
      window.setTimeout(() => {
        document.getElementById("studio-search")?.focus()
      }, 450)
      return
    }
    if (collapsed) onToggleCollapse?.()
    onNavigate?.()
    window.setTimeout(() => {
      document.getElementById("studio-search")?.focus()
    }, collapsed ? 350 : 0)
  }

  // Collapsed rail: shortcut icons only — no project list. Projects live in
  // the expanded sidebar; the rail links back via dashboard + expand.
  if (collapsed) {
    return (
      <div className="flex h-full flex-col bg-background">
        {/* h-14 to match the main header so the borders line up */}
        <div className="flex h-14 shrink-0 items-center justify-center border-b">
          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="group flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-accent"
            >
              <img
                src="/slyxup-fox.svg"
                alt=""
                aria-hidden
                width={28}
                height={28}
                className="size-7 object-contain group-hover:hidden group-focus-visible:hidden"
              />
              <PanelLeftOpen className="hidden size-4 text-muted-foreground group-hover:block group-hover:text-foreground group-focus-visible:block group-focus-visible:text-foreground" />
            </button>
          ) : (
            <Logo showText={false} />
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center p-2">
          <Button
            size="icon"
            className="size-9 shrink-0 rounded-lg"
            onClick={() => {
              onNew()
              onNavigate?.()
            }}
            aria-label="New project"
            title="New project"
          >
            <Plus />
          </Button>

          <nav
            aria-label="Studio sections"
            className="mt-3 flex w-full flex-col items-center gap-1"
          >
            {!onStudio && (
              <RailIconButton
                icon={LayoutGrid}
                label="Studio"
                active={false}
                hint="Back to Studio"
                onClick={goStudio}
              />
            )}
            <RailIconButton
              icon={Search}
              label="Search projects"
              onClick={focusSearch}
            />
          </nav>

          <div className="flex-1" />
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1 border-t p-2">
          <RailIconButton
            icon={Settings}
            label="Settings"
            active={onSettings}
            onClick={goSettings}
          />
          {user ? (
            <div className="flex items-center justify-center">
              {onToggleCollapse ? (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  aria-label={`${user.name} — expand sidebar to manage account`}
                  title={`${user.name} — expand for account`}
                  className="flex size-8 items-center justify-center rounded-full border border-primary/50 bg-background text-[13px] font-bold text-primary transition-transform hover:scale-105"
                >
                  {userInitials(user)}
                </button>
              ) : (
                <UserButton align="left" side="top" />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center">
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
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* brand + collapse live in the header row: logo left, toggle right */}
      <div className="flex h-14 shrink-0 items-center gap-1.5 border-b pl-3 pr-2">
        <Logo showText />
        <div className="flex-1" />
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
      </div>

      {/* middle */}
      <div className="flex min-h-0 flex-1 flex-col p-2.5">
        <Button
          size="sm"
          className="h-8 w-full shrink-0 text-[13px]"
          onClick={() => {
            onNew()
            onNavigate?.()
          }}
        >
          <Plus />
          New project
        </Button>

        {!onStudio && (
          <nav aria-label="Studio sections" className="mt-4 w-full shrink-0">
            <SectionLabel>Workspace</SectionLabel>
            <div className="flex flex-col gap-0.5">
              <NavItem
                icon={LayoutGrid}
                label="Studio"
                active={false}
                count={projects.length}
                onClick={goStudio}
              />
            </div>
          </nav>
        )}

        {/* project list — ChatGPT/Claude style rows */}
        <div className="mt-4 flex min-h-0 w-full flex-1 flex-col">
          <SectionLabel>Projects</SectionLabel>
          {projects.length === 0 ? (
            <p className="px-2 text-[11px] leading-relaxed text-muted-foreground/70">
              No projects yet — describe a clip to start one.
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-1">
              {projects.map((p) => (
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

      {/* footer: settings + identity */}
      <div className="shrink-0 border-t p-2.5">
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
              <p className="truncate text-[13px] font-semibold tracking-[-0.01em]">
                {user.name}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {user.plan}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-start">
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
          </div>
        )}
      </div>
    </div>
  )
}
