import { Component, useEffect, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  Check,
  Copy,
  Home,
  RotateCcw,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { navigate } from "@/lib/router"
import { cn } from "@/lib/utils"

/** Frontend env check — Vite sets this from NODE_ENV. */
const IS_DEV = import.meta.env.DEV

interface CrashInfo {
  message: string
  stack?: string
  componentStack?: string
  url: string
  time: string
}

function toCrashInfo(error: unknown, componentStack?: string): CrashInfo {
  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : JSON.stringify(error))
  return {
    message: err.message || "Unknown error",
    stack: err.stack,
    componentStack: componentStack?.trim() || undefined,
    url:
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "",
    time: new Date().toLocaleTimeString(),
  }
}

function CrashModal({
  crash,
  dismissable,
  onDismiss,
  onReset,
}: {
  crash: CrashInfo
  dismissable: boolean
  onDismiss?: () => void
  onReset: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copyReport = async () => {
    const report = [
      `Motion crash · ${crash.time} · ${crash.url}`,
      `Message: ${crash.message}`,
      crash.stack ? `Stack:\n${crash.stack}` : null,
      crash.componentStack
        ? `Component stack:\n${crash.componentStack}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n")
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const goHome = () => {
    onReset()
    navigate("/studio")
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="crash-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-3.5 sm:px-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-4 text-destructive" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="crash-title"
              className="text-[15px] font-semibold tracking-tight"
            >
              Something went wrong
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {IS_DEV
                ? "Dev build — exact error details below."
                : "Your projects are saved locally. Try again or head back."}
            </p>
          </div>
          {dismissable && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {IS_DEV ? (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto px-4 py-4 sm:px-5">
            <p className="break-words font-mono text-[12px] font-semibold text-destructive">
              {crash.message}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {crash.url} · {crash.time}
            </p>
            {crash.stack && (
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
                {crash.stack}
              </pre>
            )}
            {crash.componentStack && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Component stack
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
                  {crash.componentStack}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <p className="px-4 py-4 text-[13px] text-muted-foreground sm:px-5">
            The app hit an unexpected error and couldn't render this view.
            Nothing was deleted — reload or go back to the studio.
          </p>
        )}

        <div
          className={cn(
            "flex flex-wrap items-center gap-2 border-t px-4 py-3 sm:px-5",
            IS_DEV ? "justify-between" : "justify-end"
          )}
        >
          {IS_DEV && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={copyReport}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy report"}
            </Button>
          )}
          <div className="flex items-center gap-2">
            {!dismissable && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={goHome}
              >
                <Home />
                Studio
              </Button>
            )}
            <Button
              size="sm"
              className="h-8"
              onClick={() => {
                onReset()
                window.location.reload()
              }}
            >
              <RotateCcw />
              Reload
            </Button>
            {!IS_DEV && !dismissable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={onReset}
              >
                Try again
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface BoundaryState {
  crash: CrashInfo | null
}

/**
 * Catches render-time crashes anywhere below it so the app never dies
 * into a blank white page — a modal takes over instead.
 */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { crash: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { crash: toCrashInfo(error) }
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    this.setState({ crash: toCrashInfo(error, info.componentStack) })
    if (IS_DEV) {
      // Still log the real thing for the devtools console.
      console.error("[motion] uncaught render error:", error, info)
    }
  }

  componentDidMount() {
    // Browser back/forward (and in-app navigate) clears a stuck crash
    // screen so navigation itself is never a dead end.
    window.addEventListener("popstate", this.clear)
  }

  componentWillUnmount() {
    window.removeEventListener("popstate", this.clear)
  }

  clear = () => {
    if (this.state.crash) this.setState({ crash: null })
  }

  render() {
    if (this.state.crash) {
      return (
        <CrashModal
          crash={this.state.crash}
          dismissable={false}
          onReset={this.clear}
        />
      )
    }
    return this.props.children
  }
}

/**
 * Catches async/runtime errors outside React render (failed backend calls
 * that escape handlers, listener crashes, rejected promises) and shows
 * the same modal — dismissable, since the tree underneath may be fine.
 * Production stays safe: no message/stack details leave the modal copy,
 * only the generic text above.
 */
export function GlobalErrorTrap() {
  const [crash, setCrash] = useState<CrashInfo | null>(null)

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (e.error == null && !e.message) return
      setCrash(toCrashInfo(e.error ?? e.message))
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      setCrash(toCrashInfo(e.reason))
    }
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])

  useEffect(() => {
    if (crash && IS_DEV) console.error("[motion] global error:", crash.message)
  }, [crash])

  if (!crash) return null
  return (
    <CrashModal
      crash={crash}
      dismissable
      onDismiss={() => setCrash(null)}
      onReset={() => setCrash(null)}
    />
  )
}
