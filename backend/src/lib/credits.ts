import { eq } from "drizzle-orm"
import { BillingClient } from "@slyxup/core"
import type { Db } from "./db"
import { creditLedger, creditWallets, type CreditWallet } from "../db/schema"

export type CreditTier = "free" | "pro" | "studio"

export interface TierConfig {
  /** Monthly grant. null = unlimited (Studio). */
  allowance: number | null
  label: string
}

/**
 * Credit tiers — 1 credit = 1 AI turn. Allowances mirror the landing page
 * (Starter 10 clips/mo, Pro 500/mo, Studio unlimited) so marketing and
 * enforcement can never disagree. Change them here, not in copy.
 */
export const TIERS: Record<CreditTier, TierConfig> = {
  free: { allowance: 10, label: "Starter" },
  pro: { allowance: 500, label: "Pro" },
  studio: { allowance: null, label: "Studio" },
}

/** One full agent turn (inspect→compose→validate→preview) costs this. */
export const CHAT_TURN_COST = 1

/** Re-resolve the platform subscription at most this often per user. */
const PLAN_CACHE_MS = 6 * 60 * 60 * 1000

export function currentPeriodKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
}

/** ISO date of the next monthly reset (first of next month, UTC). */
export function nextResetAt(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return d.toISOString()
}

async function logGrant(
  db: Db,
  userId: string,
  delta: number,
  reason: string,
  refId?: string
): Promise<void> {
  await db.insert(creditLedger).values({
    userId,
    delta,
    reason,
    refId: refId ?? null,
  })
}

/** Get-or-create the wallet. New users start on free with a full grant. */
export async function ensureWallet(db: Db, userId: string): Promise<CreditWallet> {
  const [row] = await db
    .select()
    .from(creditWallets)
    .where(eq(creditWallets.userId, userId))
    .limit(1)
    .all()
  if (row) return row
  const period = currentPeriodKey()
  const allowance = TIERS.free.allowance ?? 0
  const [created] = await db
    .insert(creditWallets)
    .values({
      userId,
      plan: "free",
      balance: allowance,
      spentThisPeriod: 0,
      periodKey: period,
      lifetimeGranted: allowance,
      lifetimeSpent: 0,
    })
    .returning()
  await logGrant(db, userId, allowance, "monthly-refill", `free:${period}`)
  return created
}

/**
 * Monthly refill. Lazy (runs on access, no cron needed): when the stored
 * period is stale the balance resets to the tier allowance. Downgrades
 * take effect the same way — the next access after the month turns over
 * (or a plan change) applies the new tier.
 */
export async function refillIfStale(db: Db, wallet: CreditWallet): Promise<CreditWallet> {
  const period = currentPeriodKey()
  if (wallet.periodKey === period) return wallet
  const allowance = TIERS[wallet.plan].allowance
  const [row] = await db
    .update(creditWallets)
    .set({
      balance: allowance ?? wallet.balance,
      spentThisPeriod: 0,
      periodKey: period,
      lifetimeGranted: wallet.lifetimeGranted + (allowance ?? 0),
      updatedAt: new Date(),
    })
    .where(eq(creditWallets.userId, wallet.userId))
    .returning()
  if (allowance != null) {
    await logGrant(db, wallet.userId, allowance, "monthly-refill", `${wallet.plan}:${period}`)
  }
  return row
}

interface PlanEnv {
  BILLING_PROJECT_ID?: string
  BILLING_PUBLISHABLE_KEY?: string
  /** Optional JSON: {"<platform-plan-id>": "pro" | "studio"} — exact override. */
  BILLING_PLAN_MAP?: string
}

/** Map a platform plan id to a credit tier (env override wins). */
function tierForPlatformPlan(planId: string, env: PlanEnv): CreditTier {
  try {
    const map = env.BILLING_PLAN_MAP ? (JSON.parse(env.BILLING_PLAN_MAP) as Record<string, string>) : {}
    const hit = map[planId]?.toLowerCase()
    if (hit === "studio" || hit === "pro" || hit === "free") return hit
  } catch {
    /* malformed map — fall through to heuristics */
  }
  const id = planId.toLowerCase()
  if (id.includes("studio") || id.includes("enterprise") || id.includes("team")) return "studio"
  if (id.includes("pro") || id.includes("plus") || id.includes("scale") || id.includes("business")) return "pro"
  // Any other active paid subscription grants Pro rather than Free —
  // under-granting a paying customer is worse than over-granting.
  return "pro"
}

/**
 * Resolve the tier from the platform subscription, using the caller's own
 * session token (no service key needed). Returns null when billing isn't
 * configured or the lookup fails — callers keep the cached tier.
 */
export async function resolveTier(
  env: PlanEnv & { AUTH_API_URL?: string },
  billingProjectId: string | undefined,
  userToken: string | undefined
): Promise<CreditTier | null> {
  const projectId = billingProjectId ?? env.BILLING_PROJECT_ID
  const publishableKey = env.BILLING_PUBLISHABLE_KEY
  if (!projectId || !publishableKey || !userToken) return null
  try {
    const bc = new BillingClient({
      apiUrl: env.AUTH_API_URL ?? "https://auth-slyxup-com.auth-0f4.workers.dev",
      publishableKey,
      getToken: () => userToken,
    })
    const sub = await bc.getSubscription(projectId)
    if (sub && (sub.status === "active" || sub.status === "trialing") && sub.planId) {
      return tierForPlatformPlan(sub.planId, env)
    }
    return "free"
  } catch {
    return null
  }
}

/**
 * Sync the cached tier with the platform (at most every PLAN_CACHE_MS).
 * Upgrade tops up the difference immediately so a just-paid user isn't
 * told to wait; downgrade caps at the new allowance without clawing back
 * more than necessary.
 */
export async function syncPlan(
  db: Db,
  env: PlanEnv & { AUTH_API_URL?: string },
  userId: string,
  userToken: string | undefined,
  wallet: CreditWallet
): Promise<CreditWallet> {
  const fresh =
    wallet.planCheckedAt != null &&
    Date.now() - wallet.planCheckedAt.getTime() < PLAN_CACHE_MS
  if (fresh) return wallet
  const tier = await resolveTier(env, undefined, userToken)
  if (!tier) return wallet
  const now = new Date()
  if (tier === wallet.plan) {
    const [row] = await db
      .update(creditWallets)
      .set({ planCheckedAt: now, updatedAt: now })
      .where(eq(creditWallets.userId, userId))
      .returning()
    return row ?? wallet
  }
  const oldAllowance = TIERS[wallet.plan].allowance
  const newAllowance = TIERS[tier].allowance
  let balance = wallet.balance
  let granted = 0
  if (newAllowance == null) {
    // Upgrade to unlimited: nothing to top up.
  } else if (oldAllowance == null) {
    balance = newAllowance
    granted = newAllowance
  } else if (newAllowance > oldAllowance) {
    balance = wallet.balance + (newAllowance - oldAllowance)
    granted = newAllowance - oldAllowance
  } else {
    balance = Math.min(wallet.balance, newAllowance)
  }
  const [row] = await db
    .update(creditWallets)
    .set({
      plan: tier,
      balance,
      lifetimeGranted: wallet.lifetimeGranted + granted,
      planCheckedAt: now,
      updatedAt: now,
    })
    .where(eq(creditWallets.userId, userId))
    .returning()
  if (granted > 0) {
    await logGrant(db, userId, granted, "plan-change", `${wallet.plan}->${tier}`)
  }
  console.log(JSON.stringify({ msg: "credits-plan", userId, from: wallet.plan, to: tier }))
  return row ?? wallet
}

export interface CreditStatus {
  balance: number
  /** True for Studio — spend() never blocks, balance is informational. */
  unlimited: boolean
  tier: CreditTier
  tierLabel: string
  /** Monthly grant (null = unlimited). */
  allowance: number | null
  spentThisPeriod: number
  periodKey: string
  resetsAt: string
}

/** Read-only status: ensure + refill, no platform call (cheap enough for pills). */
export async function getStatus(db: Db, userId: string): Promise<CreditStatus> {
  const wallet = await refillIfStale(db, await ensureWallet(db, userId))
  return toStatus(wallet)
}

/** Status with plan sync (used before spend + on the status endpoint). */
export async function getStatusSynced(
  db: Db,
  env: PlanEnv & { AUTH_API_URL?: string },
  userId: string,
  userToken: string | undefined
): Promise<CreditStatus> {
  const wallet = await syncPlan(
    db,
    env,
    userId,
    userToken,
    await refillIfStale(db, await ensureWallet(db, userId))
  )
  return toStatus(wallet)
}

function toStatus(wallet: CreditWallet): CreditStatus {
  const tier = wallet.plan as CreditTier
  const allowance = TIERS[tier].allowance
  return {
    balance: wallet.balance,
    unlimited: allowance == null,
    tier,
    tierLabel: TIERS[tier].label,
    allowance,
    spentThisPeriod: wallet.spentThisPeriod,
    periodKey: wallet.periodKey,
    resetsAt: nextResetAt(),
  }
}

export interface SpendResult {
  ok: boolean
  status: CreditStatus
}

/**
 * Atomic check-and-deduct (balance update + ledger insert in one batch).
 * Smalltalk and failed-to-start runs never reach here, so every spend is
 * real model work. Callers return 402 with the status when !ok.
 */
export async function spend(
  db: Db,
  env: PlanEnv & { AUTH_API_URL?: string },
  userId: string,
  userToken: string | undefined,
  cost: number,
  reason: string,
  refId?: string
): Promise<SpendResult> {
  const wallet = await syncPlan(
    db,
    env,
    userId,
    userToken,
    await refillIfStale(db, await ensureWallet(db, userId))
  )
  const allowance = TIERS[wallet.plan as CreditTier].allowance
  if (allowance == null) {
    await logGrant(db, userId, 0, reason, refId)
    return { ok: true, status: toStatus(wallet) }
  }
  if (wallet.balance < cost) {
    return { ok: false, status: toStatus(wallet) }
  }
  const now = new Date()
  await db.batch([
    db
      .update(creditWallets)
      .set({
        balance: wallet.balance - cost,
        spentThisPeriod: wallet.spentThisPeriod + cost,
        lifetimeSpent: wallet.lifetimeSpent + cost,
        updatedAt: now,
      })
      .where(eq(creditWallets.userId, userId)),
    db.insert(creditLedger).values({
      userId,
      delta: -cost,
      reason,
      refId: refId ?? null,
    }),
  ])
  const status = toStatus({
    ...wallet,
    balance: wallet.balance - cost,
    spentThisPeriod: wallet.spentThisPeriod + cost,
    lifetimeSpent: wallet.lifetimeSpent + cost,
  })
  console.log(JSON.stringify({ msg: "credits-spend", userId, reason, cost, balance: status.balance }))
  return { ok: true, status }
}

/** Refund a turn that never reached the model (e.g. stream setup failed). */
export async function refund(
  db: Db,
  userId: string,
  cost: number,
  reason: string,
  refId?: string
): Promise<void> {
  const wallet = await refillIfStale(db, await ensureWallet(db, userId))
  if (TIERS[wallet.plan as CreditTier].allowance == null) return
  const now = new Date()
  await db.batch([
    db
      .update(creditWallets)
      .set({
        balance: wallet.balance + cost,
        spentThisPeriod: Math.max(0, wallet.spentThisPeriod - cost),
        lifetimeSpent: Math.max(0, wallet.lifetimeSpent - cost),
        updatedAt: now,
      })
      .where(eq(creditWallets.userId, userId)),
    db.insert(creditLedger).values({
      userId,
      delta: cost,
      reason,
      refId: refId ?? null,
    }),
  ])
}
