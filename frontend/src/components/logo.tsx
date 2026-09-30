import { navigate } from "@/lib/router"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  showText?: boolean
}

export function Logo({ className, showText = true }: LogoProps) {
  return (
    <a
      href="/"
      onClick={(e) => {
        e.preventDefault()
        navigate("/")
      }}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <img
        src="/slyxup-fox.svg"
        alt="SlyxUp"
        width={32}
        height={32}
        className="size-7 shrink-0 object-contain sm:size-8"
      />
      {showText && (
        <span className="font-display text-[15px] font-bold tracking-tight sm:text-base">
          Motion
        </span>
      )}
    </a>
  )
}
