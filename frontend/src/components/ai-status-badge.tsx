import { useAiStatus } from "@/lib/api"
import { cn } from "@/lib/utils"

/**
 * Honest AI connection pill — green when the real director answers,
 * amber when the backend is up but has no key, gray for local mode.
 */
export function AiStatusBadge({ className }: { className?: string }) {
  const { reachable, aiConfigured, model, checking } = useAiStatus()

  const shortModel = model?.split("/").pop() ?? null
  const label = checking
    ? "Checking AI…"
    : reachable && aiConfigured
      ? "AI live"
      : reachable
        ? "AI key missing"
        : "Local mode"
  const title = checking
    ? "Contacting the backend…"
    : reachable && aiConfigured
      ? `AI is connected${shortModel ? ` (${shortModel})` : ""} — your prompts compose real motion.`
      : reachable
        ? "Backend is up but AI_GATEWAY_API_KEY is not set — using local simulation."
        : "Backend unreachable — using local simulation. Start it with pnpm dev."

  return (
    <span
      role="status"
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium text-muted-foreground",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          checking
            ? "animate-pulse bg-muted-foreground"
            : reachable && aiConfigured
              ? "bg-emerald-500"
              : reachable
                ? "bg-amber-500"
                : "bg-muted-foreground/50"
        )}
      />
      {label}
    </span>
  )
}
