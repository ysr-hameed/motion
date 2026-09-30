import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  Bell,
  Briefcase,
  Check,
  Clapperboard,
  Copy,
  CreditCard,
  Download,
  LogOut,
  Monitor,
  Moon,
  Palette,
  PanelLeft,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StudioSidebar } from "@/components/studio/studio-sidebar"
import { auth, useUser, userInitials } from "@/lib/auth"
import { navigate } from "@/lib/router"
import {
  getThemePref,
  setThemePref,
  type ThemePref,
} from "@/components/theme-provider"
import {
  getNotifPrefs,
  getPlaybackPrefs,
  getReduceMotion,
  setNotifPrefs,
  setPlaybackPrefs,
  setReduceMotion,
  type NotifPrefs,
  type PlaybackPrefs,
} from "@/lib/preferences"
import { formatBytes } from "@/lib/attachments"
import type { MotionStudio } from "@/lib/use-motion-studio"
import { cn } from "@/lib/utils"

type TabId =
  | "profile"
  | "workspace"
  | "subscription"
  | "playback"
  | "appearance"
  | "notifications"

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "workspace", label: "Workspace", icon: Briefcase },
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "playback", label: "Playback", icon: Clapperboard },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
]

function Card({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border bg-card">
      <div className="border-b px-5 py-4 sm:px-6">
        <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  )
}

function Row({
  label,
  hint,
  control,
}: {
  label: string
  hint?: string
  control: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        {hint && (
          <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border px-4 py-3.5">
      <p className="truncate text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{label}</p>
    </div>
  )
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-input"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
          checked ? "left-[22px]" : "left-0.5"
        )}
      />
    </button>
  )
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ProfileTab() {
  const user = useUser()
  const [copied, setCopied] = useState(false)

  if (!user) {
    return (
      <Card
        title="Profile"
        description="You are browsing as a guest — sign in to manage your profile."
      >
        <Button size="sm" className="h-8" onClick={() => navigate("/login")}>
          Log in
        </Button>
      </Card>
    )
  }

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(user.email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Profile" description="How you appear across Motion.">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-background text-lg font-bold text-primary"
          >
            {userInitials(user)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold tracking-tight">
              {user.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[11px]">
                {user.plan}
              </Badge>
              <Badge variant="outline" className="text-[11px] capitalize">
                {user.provider}
              </Badge>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col divide-y rounded-xl border px-4">
          <Row
            label="Email"
            hint="Managed by your sign-in provider"
            control={
              <button
                type="button"
                onClick={copyEmail}
                aria-label="Copy email address"
                title="Copy email address"
                className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <span className="max-w-44 truncate">{user.email}</span>
                {copied ? (
                  <Check className="size-3.5 text-primary" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            }
          />
          <Row
            label="Sign out"
            hint="End this session on this device"
            control={
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  void auth.logout()
                  navigate("/")
                }}
              >
                <LogOut />
                Log out
              </Button>
            }
          />
        </div>
      </Card>
    </div>
  )
}

function WorkspaceTab({ studio }: { studio: MotionStudio }) {
  const [arming, setArming] = useState(false)

  const stats = useMemo(() => {
    const projects = studio.projects.length
    const versions = studio.projects.reduce((n, p) => n + p.versions, 0)
    const refs = studio.projects.reduce((n, p) => n + p.attachments.length, 0)
    let bytes = 0
    try {
      bytes = new Blob([JSON.stringify(studio.projects)]).size
    } catch {
      /* unmeasurable */
    }
    return { projects, versions, refs, bytes }
  }, [studio.projects])

  const exportBackup = () => {
    downloadJson("motion-workspace-backup.json", {
      app: "SlyxUp Motion",
      exportedAt: new Date().toISOString(),
      projects: studio.projects,
    })
  }

  const deleteAll = () => {
    if (!arming) {
      setArming(true)
      window.setTimeout(() => setArming(false), 3000)
      return
    }
    studio.projects.forEach((p) => studio.deleteProject(p.id))
    setArming(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Workspace"
        description="Everything stored locally in this workspace."
      >
        <div className="grid grid-cols-2 gap-3">
          <Stat value={String(stats.projects)} label="Projects" />
          <Stat value={String(stats.versions)} label="Versions generated" />
          <Stat value={String(stats.refs)} label="Reference images" />
          <Stat value={formatBytes(stats.bytes)} label="Local data" />
        </div>
      </Card>

      <Card
        title="Data controls"
        description="Take your work with you — full backup as JSON."
      >
        <Row
          label="Export workspace"
          hint="Projects, versions, threads and references"
          control={
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={stats.projects === 0}
              onClick={exportBackup}
            >
              <Download />
              Download backup
            </Button>
          }
        />
      </Card>

      <section className="overflow-hidden rounded-2xl border border-destructive/30">
        <div className="border-b border-destructive/20 bg-destructive/5 px-5 py-4 sm:px-6">
          <h2 className="text-[14px] font-semibold tracking-tight text-destructive">
            Danger zone
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Irreversible actions — proceed with care.
          </p>
        </div>
        <div className="bg-card px-5 py-5 sm:px-6">
          <Row
            label="Delete all projects"
            hint={`${stats.projects} project${stats.projects === 1 ? "" : "s"} in this workspace`}
            control={
              <Button
                variant={arming ? "destructive" : "outline"}
                size="sm"
                className={cn("h-8", !arming && "text-destructive")}
                disabled={stats.projects === 0}
                onClick={deleteAll}
              >
                <Trash2 />
                {arming ? "Click again to confirm" : "Delete all"}
              </Button>
            }
          />
        </div>
      </section>
    </div>
  )
}

function SubscriptionTab({ studio }: { studio: MotionStudio }) {
  const user = useUser()

  const goPricing = () => {
    if (window.location.pathname !== "/") {
      navigate("/")
      window.setTimeout(() => {
        document
          .getElementById("pricing")
          ?.scrollIntoView({ behavior: "smooth" })
      }, 400)
    } else {
      document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Current plan"
        description="Your subscription and billing cycle."
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10">
              <Zap className="size-4 text-primary" />
            </span>
            <div>
              <p className="text-[13px] font-semibold">
                {user?.plan ?? "Free plan"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {user ? "Renews monthly · cancel anytime" : "Sign in to upgrade"}
              </p>
            </div>
          </div>
          <Badge className="text-[11px]">Active</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat value={String(studio.projects.length)} label="Projects" />
          <Stat
            value={String(
              studio.projects.reduce((n, p) => n + p.versions, 0)
            )}
            label="Versions generated"
          />
        </div>
      </Card>

      <Card
        title="Billing history"
        description="Receipts for past payments live here."
      >
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-[12px] text-muted-foreground">
          No invoices yet.
        </p>
      </Card>

      <Card
        title="Upgrade"
        description="More generations, longer clips and priority rendering."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            Compare plans and pick what fits your output.
          </p>
          <Button size="sm" className="h-8" onClick={goPricing}>
            View plans
          </Button>
        </div>
      </Card>
    </div>
  )
}

function PlaybackTab() {
  const [prefs, setPrefs] = useState<PlaybackPrefs>(() => getPlaybackPrefs())

  const set = (key: keyof PlaybackPrefs, v: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: v }
      setPlaybackPrefs(next)
      return next
    })
  }

  return (
    <Card
      title="Playback"
      description="Default behavior for every clip preview. Applies to newly opened previews."
    >
      <div className="flex flex-col divide-y rounded-xl border px-4">
        <Row
          label="Autoplay previews"
          hint="Start playing as soon as a preview loads"
          control={
            <Switch
              checked={prefs.autoplay}
              onChange={(v) => set("autoplay", v)}
              label="Autoplay previews"
            />
          }
        />
        <Row
          label="Loop previews"
          hint="Replay the clip when it reaches the end"
          control={
            <Switch
              checked={prefs.loop}
              onChange={(v) => set("loop", v)}
              label="Loop previews"
            />
          }
        />
      </div>
    </Card>
  )
}

function AppearanceTab() {
  const [pref, setPref] = useState<ThemePref>(() => getThemePref())
  const [reduceMotion, setReduce] = useState<boolean>(() => getReduceMotion())

  const pick = (v: ThemePref) => {
    setPref(v)
    setThemePref(v)
  }

  const toggleMotion = (v: boolean) => {
    setReduce(v)
    setReduceMotion(v)
  }

  const options: {
    id: ThemePref
    label: string
    hint: string
    icon: LucideIcon
  }[] = [
    { id: "system", label: "System", hint: "Follow OS", icon: Monitor },
    { id: "light", label: "Light", hint: "Always light", icon: Sun },
    { id: "dark", label: "Dark", hint: "Always dark", icon: Moon },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Appearance"
        description="Choose how Motion looks on this device."
      >
        <div
          role="radiogroup"
          aria-label="Theme"
          className="grid grid-cols-3 gap-2"
        >
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={pref === o.id}
              onClick={() => pick(o.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-4 transition-colors",
                pref === o.id
                  ? "border-primary bg-primary/5 text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <o.icon
                className={cn("size-5", pref === o.id && "text-primary")}
              />
              <span className="text-[13px] font-semibold">{o.label}</span>
              <span className="text-[11px] text-muted-foreground">
                {o.hint}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card
        title="Motion"
        description="Reduce non-essential animation across the interface."
      >
        <Row
          label="Reduce motion"
          hint="Minimizes transitions and ambient animation"
          control={
            <Switch
              checked={reduceMotion}
              onChange={toggleMotion}
              label="Reduce motion"
            />
          }
        />
      </Card>
    </div>
  )
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotifPrefs>(() => getNotifPrefs())

  const set = (key: keyof NotifPrefs, v: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: v }
      setNotifPrefs(next)
      return next
    })
  }

  return (
    <Card
      title="Notifications"
      description="Control what Motion tells you about. Stored on this device."
    >
      <div className="flex flex-col divide-y rounded-xl border px-4">
        <Row
          label="Generation updates"
          hint="Notify when a clip finishes rendering"
          control={
            <Switch
              checked={prefs.generations}
              onChange={(v) => set("generations", v)}
              label="Generation updates"
            />
          }
        />
        <Row
          label="Product updates"
          hint="New features and improvements"
          control={
            <Switch
              checked={prefs.product}
              onChange={(v) => set("product", v)}
              label="Product updates"
            />
          }
        />
        <Row
          label="Tips & inspiration"
          hint="Occasional creative prompts and ideas"
          control={
            <Switch
              checked={prefs.tips}
              onChange={(v) => set("tips", v)}
              label="Tips and inspiration"
            />
          }
        />
      </div>
    </Card>
  )
}

export function SettingsPage({ studio }: { studio: MotionStudio }) {
  const [tab, setTab] = useState<TabId>("profile")
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const active = TABS.find((t) => t.id === tab)!

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

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      {/* desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 overflow-hidden border-r border-border/50 transition-all duration-300 lg:block",
          collapsed ? "w-16" : "w-72"
        )}
      >
        <StudioSidebar
          onNew={() => navigate("/studio")}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          projects={studio.projects}
          onSelectProject={(id) => navigate(`/playground/${id}`)}
          onDeleteProject={(id) => studio.deleteProject(id)}
        />
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
              navigate("/studio")
              setNavOpen(false)
            }}
            onNavigate={() => setNavOpen(false)}
            projects={studio.projects}
            onSelectProject={(id) => navigate(`/playground/${id}`)}
            onDeleteProject={(id) => studio.deleteProject(id)}
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
          <button
            type="button"
            onClick={() => navigate("/studio")}
            aria-label="Back to studio"
            title="Back to studio"
            className="hidden size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-tight">
              Settings
            </h1>
            <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
              Manage your workspace
            </p>
          </div>
          <div className="flex-1" />
          <span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:flex">
            <SettingsIcon className="size-3.5" />
            {active.label}
          </span>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <nav
              aria-label="Settings sections"
              className="flex shrink-0 gap-1 overflow-x-auto rounded-2xl border bg-card p-2 lg:sticky lg:top-20 lg:w-56 lg:flex-col"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
                    tab === t.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  <t.icon
                    className={cn(
                      "size-4 shrink-0",
                      tab === t.id ? "text-primary" : "text-muted-foreground/70"
                    )}
                  />
                  {t.label}
                </button>
              ))}
            </nav>

            <div key={active.id} className="min-w-0 flex-1">
              {tab === "profile" && <ProfileTab />}
              {tab === "workspace" && <WorkspaceTab studio={studio} />}
              {tab === "subscription" && <SubscriptionTab studio={studio} />}
              {tab === "playback" && <PlaybackTab />}
              {tab === "appearance" && <AppearanceTab />}
              {tab === "notifications" && <NotificationsTab />}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
