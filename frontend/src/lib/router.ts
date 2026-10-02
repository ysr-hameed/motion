import { useEffect, useState } from "react"
import { resetScrollLock } from "./scroll-lock"

/** Clean path routing (no hash): / → landing, /studio, /playground. */
export function navigate(path: string, opts?: { replace?: boolean }) {
  if (opts?.replace) {
    window.history.replaceState({}, "", path)
    window.dispatchEvent(new PopStateEvent("popstate"))
  } else {
    window.history.pushState({}, "", path)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }
  // A drawer that unmounted mid-animation can leave `overflow: hidden` on the
  // body. The `scrollTo` below would then silently do nothing and the new page
  // would look frozen, so any lock is released before navigating.
  resetScrollLock()
  window.scrollTo(0, 0)
}

function currentPath(): string {
  // legacy hash links (#/studio) fold into clean paths
  if (window.location.hash.startsWith("#/")) {
    const clean = window.location.hash.slice(1)
    window.history.replaceState({}, "", clean)
    return clean.split("?")[0].split("#")[0] || "/"
  }
  const p = window.location.pathname
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p
}

export function usePathRoute(): string {
  const [path, setPath] = useState(currentPath())
  useEffect(() => {
    const onChange = () => {
      setPath(currentPath())
      // Covers back/forward and legacy hash navigation, which do not go
      // through navigate(). Same reason as above.
      resetScrollLock()
      window.scrollTo(0, 0)
    }
    window.addEventListener("popstate", onChange)
    return () => window.removeEventListener("popstate", onChange)
  }, [])
  return path
}
