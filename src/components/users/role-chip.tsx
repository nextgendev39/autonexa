import { cn } from "@/lib/utils";

/** A role as a neutral bordered pill (roles describe, they don't signal a state). */
export function RoleChip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "border-border bg-card text-foreground/80 inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {label}
    </span>
  );
}
