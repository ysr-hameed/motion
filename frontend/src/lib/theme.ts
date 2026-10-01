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