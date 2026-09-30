/**
 * Device-level preferences backing the Settings page. Everything here is
 * local (localStorage) and applied without a backend round-trip.
 */

export interface PlaybackPrefs {
  autoplay: boolean
  loop: boolean
}

const PLAYBACK_KEY = "motion:playback:v1"
const REDUCE_MOTION_KEY = "motion:reduce-motion:v1"
const NOTIF_KEY = "motion:notif-prefs:v1"

export interface NotifPrefs {
  generations: boolean
  product: boolean
  tips: boolean
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) }
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

export function getPlaybackPrefs(): PlaybackPrefs {
  return read<PlaybackPrefs>(PLAYBACK_KEY, { autoplay: true, loop: true })
}

export function setPlaybackPrefs(prefs: PlaybackPrefs) {
  write(PLAYBACK_KEY, prefs)
}

export function getReduceMotion(): boolean {
  try {
    return localStorage.getItem(REDUCE_MOTION_KEY) === "1"
  } catch {
    return false
  }
}

export function setReduceMotion(on: boolean) {
  try {
    localStorage.setItem(REDUCE_MOTION_KEY, on ? "1" : "0")
  } catch {
    /* storage unavailable */
  }
  applyReduceMotion(on)
}

export function applyReduceMotion(on: boolean) {
  document.documentElement.classList.toggle("reduce-motion", on)
}

export function getNotifPrefs(): NotifPrefs {
  return read<NotifPrefs>(NOTIF_KEY, {
    generations: true,
    product: true,
    tips: false,
  })
}

export function setNotifPrefs(prefs: NotifPrefs) {
  write(NOTIF_KEY, prefs)
}

/** Applied once on boot (see ThemeProvider). */
export function applyPreferences() {
  applyReduceMotion(getReduceMotion())
}
