import { cn } from "@/lib/utils";

/**
 * Count pill beside a filter tab label: gold on the selected tab, a white pill on the others,
 * red when the tab needs attention.
 */
export function TabCount({
  children,
  selected,
  alert = false,
}: {
  children: React.ReactNode;
  selected: boolean;
  alert?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums shadow-xs transition-colors",
        alert
          ? "bg-destructive text-white"
          : selected
            ? "bg-brand text-brand-foreground"
            : "bg-background text-foreground ring-foreground/10 ring-1",
      )}
    >
      {children}
    </span>
  );
}
