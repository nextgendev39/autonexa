import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-card file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:hover:border-ring focus-visible:ring-ring/25 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-background/40 dark:disabled:bg-input/40 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-9 w-full min-w-0 rounded-lg border px-3 py-1 text-base shadow-xs transition-[color,border-color,box-shadow] duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium hover:border-[color-mix(in_srgb,var(--input),var(--foreground)_14%)] focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm dark:shadow-none",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
