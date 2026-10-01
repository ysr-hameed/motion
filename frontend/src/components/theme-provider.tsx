import { useEffect, type ReactNode } from "react"
import { applyPreferences } from "@/lib/preferences"
import { applyThemePref, getThemePref } from "@/lib/theme"

/**
 * Applies the stored appearance pref (OS theme by default) and
 * follows system changes. The visible toggle lives in Settings.
 *
 * The pref helpers live in `@/lib/theme` — keeping them here would export
 * non-components from a component file and break React Fast Refresh.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyThemePref(getThemePref())
    applyPreferences()
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      if (getThemePref() === "system") applyThemePref("system")
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return <>{children}</>
}