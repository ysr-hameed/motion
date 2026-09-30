import { useEffect, useState } from "react"

/** Clean path routing (no hash): / → landing, /studio, /playground. */
export function navigate(path: string, opts?: { replace?: boolean }) {
  if (opts?.replace) {
    window.history.replaceState({}, "", path)
    window.dispatchEvent(new PopStateEvent("popstate"))
  } else {
    window.history.pushState({}, "", path)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }
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
      window.scrollTo(0, 0)
    }
    window.addEventListener("popstate", onChange)
    return () => window.removeEventListener("popstate", onChange)
  }, [])
  return path
}
