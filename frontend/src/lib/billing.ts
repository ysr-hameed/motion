import { useCallback, useEffect, useState } from "react"
import { BillingClient, type Invoice, type Plan, type Subscription } from "@slyxup/core"
import { authConfig, getAuthToken } from "./auth"

function projectId(): string {
  return authConfig.projectId.trim()
}

export function isBillingConfigured(): boolean {
  return authConfig.publishableKey.trim().length > 0 && projectId().length > 0
}

let client: BillingClient | null = null

export function getBillingClient(): BillingClient {
  if (!client) {
    client = new BillingClient({
      // Billing is a SEPARATE worker from auth. Only forward an explicit
      // override; otherwise let the SDK apply DEFAULT_BILLING_API_URL.
      // Passing authConfig.apiUrl here pointed every /v1/billing/* call at
      // the auth worker, which has no such routes and answers 404.
      ...(authConfig.billingApiUrl.trim()
        ? { apiUrl: authConfig.billingApiUrl.trim() }
        : {}),
      publishableKey: authConfig.publishableKey,
      getToken: () => getAuthToken() ?? undefined,
    })
  }
  return client
}

export interface BillingSnapshot {
  plans: Plan[]
  subscription: Subscription | null
  invoices: Invoice[]
}

/** Session cache — one platform round-trip per sign-in, refreshed on demand. */
let snapCache: { email: string; snap: BillingSnapshot } | null = null
let planCache: { email: string; name: string } | null = null

export function clearBillingCache() {
  snapCache = null
  planCache = null
  client = null
}

const BILLING_EVENT = "motion:billing-change"

/** Invalidate caches everywhere (post-checkout, cancel/resume). */
export function notifyBillingChanged() {
  clearBillingCache()
  try {
    window.dispatchEvent(new Event(BILLING_EVENT))
  } catch {
    /* noop */
  }
}

async function loadSnapshot(email: string): Promise<BillingSnapshot> {
  if (snapCache && snapCache.email === email) return snapCache.snap
  const bc = getBillingClient()
  const pid = projectId()
  const [plans, subscription, invoices] = await Promise.all([
    bc.listPlans(pid).catch(() => [] as Plan[]),
    bc.getSubscription(pid).catch(() => null),
    bc.listInvoices().catch(() => [] as Invoice[]),
  ])
  const snap = { plans, subscription, invoices }
  snapCache = { email, snap }
  return snap
}

/** Display name of the account's plan — "Free plan" when none/unreachable. */
export async function getPlanName(email: string): Promise<string> {
  if (!isBillingConfigured()) return "Free plan"
  if (planCache && planCache.email === email) return planCache.name
  try {
    const snap = await loadSnapshot(email)
    const sub = snap.subscription
    const name =
      sub && (sub.status === "active" || sub.status === "trialing")
        ? (snap.plans.find((p) => p.id === sub.planId)?.name ?? prettifyPlanId(sub.planId))
        : "Free plan"
    planCache = { email, name }
    return name
  } catch {
    return "Free plan"
  }
}

function prettifyPlanId(id: string): string {
  const s = id.replace(/[_-]+/g, " ").trim()
  return s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : "Custom plan"
}

export function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  } catch {
    return `${amount} ${currency.toUpperCase()}`
  }
}

export interface BillingState extends BillingSnapshot {
  loading: boolean
  error: string | null
  refresh: () => void
  checkout: (planId: string) => Promise<void>
  cancel: () => Promise<void>
  resume: () => Promise<void>
  actionBusy: string | null
}

/**
 * Real platform billing (Paddle): plans, subscription, invoices,
 * checkout, cancel/resume. Errors are friendly one-liners; the page
 * stays usable with the free defaults when billing is unreachable.
 */
export function useBilling(email: string | null): BillingState {
  const [tick, setTick] = useState(0)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  // Tagged with the request that produced it, so `loading` is derived during
  // render instead of being pushed by a synchronous setState in the effect.
  const [result, setResult] = useState<{
    key: string
    snap: BillingSnapshot
    error: string | null
  }>({
    key: "",
    snap: { plans: [], subscription: null, invoices: [] },
    error: null,
  })

  const enabled = !!email && isBillingConfigured()
  const key = enabled ? `${email}:${tick}` : ""

  useEffect(() => {
    if (!email || !isBillingConfigured()) return
    let live = true
    const requestKey = `${email}:${tick}`
    loadSnapshot(email)
      .then((s) => {
        if (live) setResult({ key: requestKey, snap: s, error: null })
      })
      .catch((e) => {
        if (live)
          setResult((prev) => ({
            key: requestKey,
            snap: prev.snap,
            error: e instanceof Error ? e.message : "Couldn't load billing.",
          }))
      })
    return () => {
      live = false
    }
  }, [email, tick])

  const refresh = useCallback(() => {
    if (email) {
      notifyBillingChanged()
      setTick((t) => t + 1)
    }
  }, [email])

  const checkout = useCallback(
    async (planId: string) => {
      setActionBusy(planId)
      try {
        await getBillingClient().checkout(planId, {
          origin: window.location.origin,
          successUrl: `${window.location.origin}/settings?billing=success`,
        })
        // Paddle opens in a new tab; refresh when the buyer returns.
      } finally {
        setActionBusy(null)
      }
    },
    []
  )

  const cancel = useCallback(async () => {
    setActionBusy("cancel")
    try {
      await getBillingClient().cancelSubscription(projectId())
      refresh()
    } finally {
      setActionBusy(null)
    }
  }, [refresh])

  const resume = useCallback(async () => {
    setActionBusy("resume")
    try {
      await getBillingClient().resumeSubscription(projectId())
      refresh()
    } finally {
      setActionBusy(null)
    }
  }, [refresh])

  const loading = enabled && result.key !== key
  return {
    ...result.snap,
    loading,
    error: loading ? null : result.error,
    refresh,
    checkout,
    cancel,
    resume,
    actionBusy,
  }
}

/** Plan display name for headers/sidebars (cached, silent fallback). */
export function usePlan(email: string | null, fallback = "Free plan"): { name: string; loading: boolean } {
  const [name, setName] = useState(fallback)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    const load = () => {
      if (!email) {
        setName(fallback)
        setLoading(false)
        return
      }
      setLoading(true)
      getPlanName(email)
        .then((n) => {
          if (live) {
            setName(n)
            setLoading(false)
          }
        })
        .catch(() => {
          if (live) {
            setName(fallback)
            setLoading(false)
          }
        })
    }
    load()
    window.addEventListener(BILLING_EVENT, load)
    return () => {
      live = false
      window.removeEventListener(BILLING_EVENT, load)
    }
  }, [email, fallback])
  return { name, loading }
}
