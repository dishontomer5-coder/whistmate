import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

// The status chip: You, Leading, Open, Winner, Admin, Claimed, In play, Everyone fell…
// A status is information, not an action, so it is NEVER solid gold (see the rule at the
// top of src/index.css). Variants:
//   default      neutral outline — every ordinary status
//   negative     red outline + red text — a bad outcome the reader must notice
//   selected     gold outline — "the chosen one" (a selection), used sparingly; "You" is
//                an ordinary status and takes the neutral default
//   secondary    a quiet filled chip (counts)
// Sentence case ("Leading", not "LEADING"); do not add uppercase at the call site.
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium leading-tight",
  {
    variants: {
      variant: {
        default: "border-input/70 bg-transparent text-foreground",
        negative: "border-destructive/60 bg-transparent text-negative",
        selected: "border-primary/70 bg-transparent text-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        // Kept for shadcn compatibility: the same neutral outline as default.
        outline: "border-input/70 bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<span className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }
