import * as React from "react"

import { cn } from "@/lib/utils"

// The outline, fill and focus ring shared by every form control (input, textarea, select).
// The outline (`border-input`, #6779A2) is at least 3:1 against a card and against the page,
// so a field is found by its shape, not by its placeholder. Text is 16px at every width:
// smaller text makes iOS zoom the page when the field is focused.
// Do not pass border-* or h-* classes at the call site — they undo this.
const fieldClasses =
  "w-full rounded-lg border border-input bg-background text-base text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    (<input
      type={type}
      className={cn(
        fieldClasses,
        "flex h-11 px-3 py-1 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input, fieldClasses }
