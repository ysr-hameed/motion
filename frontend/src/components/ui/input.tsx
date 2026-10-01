import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Ring on focus + a small elevation lift, so a focused field is
          // unmistakable without relying on the border colour alone (which
          // is low-contrast on dark surfaces at this size).
          "flex h-11 w-full rounded-full border border-input bg-background px-4 py-2 text-sm transition-all duration-200 [transition-timing-function:var(--ease-out-soft)] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground hover:border-muted-foreground/30 focus-visible:border-primary/60 focus-visible:shadow-elev-2 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
