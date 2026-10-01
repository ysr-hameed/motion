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
      className={cn("inline-flex items-center gap-2", className)}
    >
      <img
        src="/slyxup-fox.svg"
        alt="SlyxUp"
        width={32}
        height={32}
        className="size-7 shrink-0 object-contain"
      />
      {showText && (
        <span className="flex items-baseline gap-1 text-[15px] font-semibold tracking-[-0.02em]">
          SlyxUp
          <span className="font-normal text-muted-foreground">Motion</span>
        </span>
      )}
    </a>
  )
}
