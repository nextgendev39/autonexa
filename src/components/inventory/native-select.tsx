import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Native select styled to match Input. Native pickers are the best mobile
 * experience for long option lists (branches, body types, statuses).
 */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          "border-input h-11 w-full min-w-0 appearance-none rounded-lg border bg-transparent ps-2.5 pe-9 text-base transition-colors outline-none md:h-10 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3",
          "disabled:bg-input/50 disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-3",
          "dark:bg-input/30 dark:[&>option]:bg-popover",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        className="text-muted-foreground pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2"
        aria-hidden
      />
    </div>
  );
}
