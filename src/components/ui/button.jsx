import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

// Sizes — there are three heights and nothing else:
//   default  44px  every ordinary button (also the smallest comfortable tap target)
//   lg       52px  THE primary action of a screen or step (Save round, Lock bids, Start session, Log in)
//   sm       36px  inline / secondary uses only, never a primary action; it still takes taps
//                  across 44px (the ::after extends 4px above and below)
//   icon     44x44 an icon-only button — give it an aria-label
// Do not override the height with h-* classes at the call site.
//
// The focus ring is a light ring set off by a navy gap, so it shows on gold buttons too
// (a gold ring on a gold button is invisible). Hover never turns a quiet button gold:
// outline and ghost buttons only darken, which keeps their label readable.
const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90 active:bg-primary/80",
        // A slightly deeper red than the `destructive` token, so the light label on it
        // reaches 4.5:1 (on #E03E3E itself it is 3.9:1).
        destructive:
          "bg-[hsl(0_72%_47%)] text-destructive-foreground shadow-sm hover:bg-[hsl(0_72%_43%)] active:bg-[hsl(0_72%_40%)]",
        outline:
          "border border-input bg-transparent text-foreground hover:bg-secondary active:bg-secondary",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
        ghost: "text-foreground hover:bg-secondary active:bg-secondary",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4",
        lg: "h-[52px] px-6 text-base",
        sm: "h-9 px-3 text-xs after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
        icon: "h-11 w-11 shrink-0 [&_svg]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
