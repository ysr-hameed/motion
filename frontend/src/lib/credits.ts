import { useCallback, useEffect, useState } from "react"
import { getAuthToken } from "./auth"

const API = import.meta.env.VITE_API_URL as string | undefined

export interface CreditStatus {
  balance: number
  unlimited: boolean
  tier: string
  tierLabel: string
  allowance: number | null
  spentThisPeriod: number
  periodKey: string
  resetsAt: string
}

export interface CreditsSnapshot {
  credits: CreditStatus
  costs: { agentTurn: number }
  tiers: Record<string, { allowance: number | null; label: string }>
}

/** Shared 15s cache so header pills and chat guards don't double-fetch. */
let cache: { at: number; snap: CreditsSnapshot } | null = null

export function clearCreditsCache() {
  cache = null
}

async function fetchSnapshot(): Promise<CreditsSnapshot> {
  if (!API) throw new Error("Backend not configured")
  if (cache && Date.now() - cache.at < 15_000) return cache.snap
  const token = getAuthToken()
  const res = await fetch(`${API}/api/credits`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Credits request failed (${res.status})`)
  }
  const snap = (await res.json()) as CreditsSnapshot
  cache = { at: Date.now(), snap }
  return snap
}

/** Bypass the cache for pre-send guards (a stale "0" must never block a paid user). */
export async function getCreditsFresh(): Promise<CreditsSnapshot> {
  clearCreditsCache()
  return fetchSnapshot()
}

/** True for exhausted-wallet failures (backend 402 or guard message). */
export function isOutOfCreditsError(msg: string): boolean {
  return /402|insufficient_credits|out of credits|run out|used all \d+ credits/i.test(msg)
}

export interface CreditsState {
  snapshot: CreditsSnapshot | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Wallet status for pills and pre-send guards. Silent when signed out or
 * unreachable — credits never block the UI from rendering, only sends.
 */
export function useCredits(): CreditsState {
  const [tick, setTick] = useState(0)
  // The result is tagged with the request that produced it, so `loading` is
  // DERIVED during render rather than pushed by a synchronous setState inside
  // the effect — that pattern cascades an extra render pass on every refetch.
  const [result, setResult] = useState<{
    key: number
    snap: CreditsSnapshot | null
    error: string | null
  }>({ key: -1, snap: null, error: null })

  useEffect(() => {
    let live = true
    fetchSnapshot()
      .then((s) => {
        if (live) setResult({ key: tick, snap: s, error: null })
      })
      .catch((e) => {
        // Keep the last good snapshot — a failed refresh must not blank a
        // pill that was showing a real balance a moment ago.
        if (live)
          setResult((prev) => ({
            key: tick,
            snap: prev.snap,
            error: e instanceof Error ? e.message : "Couldn't load credits",
          }))
      })
    return () => {
      live = false
    }
  }, [tick])

  // Stay fresh across turns without hammering: billing changes + 30s poll.
  useEffect(() => {
    const onBilling = () => {
      clearCreditsCache()
      setTick((t) => t + 1)
    }
    window.addEventListener("motion:billing-change", onBilling)
    const t = setInterval(() => {
      clearCreditsCache()
      setTick((x) => x + 1)
    }, 30_000)
    return () => {
      window.removeEventListener("motion:billing-change", onBilling)
      clearInterval(t)
    }
  }, [])

  const refresh = useCallback(() => {
    clearCreditsCache()
    setTick((t) => t + 1)
  }, [])

  const loading = result.key !== tick
  return {
    snapshot: result.snap,
    loading,
    // An error is only meaningful once the request has settled.
    error: loading ? null : result.error,
    refresh,
  }
}
