import { useEffect, type ReactNode } from "react"
import { applyPreferences } from "@/lib/preferences"

export type ThemePref = "system" | "light" | "dark"

const KEY = "motion:theme:v1"

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === "light" || v === "dark" ? v : "system"
  } catch {
    return "system"
  }
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* storage unavailable */
  }
  applyThemePref(pref)
}

export function applyThemePref(pref: ThemePref) {
  const dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
  // Fixes native scrollbars / form controls in dark mode (Windows).
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
}

/**
 * Applies the stored appearance pref (OS theme by default) and
 * follows system changes. The visible toggle lives in Settings.
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
