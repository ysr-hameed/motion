import { Infinity as InfinityIcon, Zap } from "lucide-react"
import { useCredits } from "@/lib/credits"
import { cn } from "@/lib/utils"

/**
 * Wallet pill: credits left (or ∞ on Studio). Sits next to the status
 * pill in the playground header. Silent while loading or offline — a
 * missing pill beats a broken one.
 */
export function CreditsPill() {
  const { snapshot } = useCredits()

  const c = snapshot?.credits
  if (!c) return null
  const cost = snapshot?.costs.agentTurn ?? 1
  const low =
    !c.unlimited && c.allowance != null && c.balance <= Math.max(cost, Math.ceil(c.allowance * 0.2))
  const title = c.unlimited
    ? `Studio plan — unlimited AI turns`
    : `${c.balance} of ${c.allowance} credits left on ${c.tierLabel} · resets ${new Date(c.resetsAt).toLocaleDateString()} · 1 turn = ${cost} credit`

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-md border bg-card/60 px-2 py-1 text-[11px] font-medium tabular-nums backdrop-blur-sm transition-colors",
        low
          ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "text-muted-foreground"
      )}
      title={title}
      aria-live="polite"
    >
      <Zap className="size-3" aria-hidden />
      {c.unlimited ? (
        <InfinityIcon className="size-3.5" aria-label="Unlimited" />
      ) : (
        <span aria-label={`${c.balance} credits left`}>{c.balance}</span>
      )}
    </span>
  )
}
