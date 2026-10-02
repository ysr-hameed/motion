import { useEffect } from "react"

/**
 * Body scroll lock, shared by every drawer (mobile nav, overlays).
 *
 * WHY THIS EXISTS
 *
 * Four components used to manage `document.body.style.overflow` themselves:
 * the landing header, and the studio / editor / settings sidebars. Each set
 * it to `"hidden"` while open and cleared it with a bare `= ""` on cleanup.
 * That is three real bugs in one pattern:
 *
 *   1. A bare `= ""` discards whatever the value was BEFORE. If any other
 *      lock was holding it, unlocking one drawer unlocked all of them.
 *   2. The drawers are on different pages, and an SPA navigation unmounts
 *      the old one while mounting the new one. Whoever cleans up last wins,
 *      so the page could be left with `overflow: hidden` and NO visible
 *      reason — which is exactly the "the whole page stopped scrolling"
 *      report, while the chat panel (an inner scroller) kept working fine.
 *   3. Nothing coordinated the two drawers on the SAME page.
 *
 * So the lock is ref-counted here, and restores the value it replaced
 * instead of guessing. `unlockScroll()` is idempotent, so a stray extra
 * cleanup can never leave the page stuck.
 */

let locks = 0
let previous = ""

/** Lock page scroll. Returns an idempotent unlock. */
export function lockScroll(): () => void {
  // Read the incoming value only on the first lock, so nested locks restore
  // the true original rather than the previous lock's "hidden".
  if (locks === 0) {
    previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
  }
  locks += 1

  let released = false
  return () => {
    if (released) return
    released = true
    locks = Math.max(0, locks - 1)
    if (locks === 0) {
      document.body.style.overflow = previous
      previous = ""
    }
  }
}

/**
 * Emergency release. Call on route change: it clears any lock left behind by
 * a component that unmounted mid-animation, which would otherwise strand the
 * page with no scroll and nothing on screen to explain it.
 */
export function resetScrollLock(): void {
  locks = 0
  document.body.style.overflow = previous
  previous = ""
}

/**
 * Locks body scroll while `active`, and always releases — including on
 * unmount, which is the case the hand-written effects kept getting subtly
 * wrong.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    return lockScroll()
  }, [active])
}