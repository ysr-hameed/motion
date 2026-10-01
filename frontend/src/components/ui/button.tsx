import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // `interactive` supplies the shared transition + press feedback; `focus-ring`
  // the two-tone ring that stays visible on both light and dark surfaces
  // (a single-colour ring disappears against one of them).
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium outline-none interactive focus-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-elev-2 hover:bg-primary/90 hover:shadow-elev-3 active:shadow-elev-1",
        destructive:
          "bg-destructive text-white shadow-elev-2 hover:bg-destructive/90 active:shadow-elev-1",
        outline:
          "border border-input bg-background shadow-elev-1 hover:border-primary/40 hover:bg-muted hover:text-foreground hover:shadow-elev-2",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        /** Hero / primary CTA — gradient fill with a primary glow. */
        glow: "bg-linear-to-b from-primary to-primary/85 text-primary-foreground shadow-glow hover:from-primary hover:to-primary/80 hover:shadow-glow active:shadow-elev-2",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-[13px]",
        lg: "h-11 rounded-xl px-6 text-[15px]",
        icon: "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
