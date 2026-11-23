import { InboxIcon, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * AutoNexa empty state: a soft card-gradient panel with a ringed champagne medallion.
 * `inset` drops the panel for use inside a DataPanel (the panel already provides the surface).
 */
export function EmptyState({
  title,
  description,
  icon: Icon = InboxIcon,
  action,
  className,
  inset = false,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  inset?: boolean;
}) {
  return (
    <div
      className={cn(
        "animate-fade-in flex flex-col items-center justify-center px-6 py-16 text-center",
        !inset && "gradient-card rounded-panel border shadow-sm",
        className,
      )}
    >
      <span className="bg-card ring-border relative mb-5 flex size-16 items-center justify-center rounded-full shadow-sm ring-1">
        <span className="ring-brand/20 absolute inset-1.5 rounded-full ring-1" aria-hidden />
        <Icon className="text-brand size-6" aria-hidden />
      </span>
      <h2 className="font-heading text-base font-semibold tracking-[-0.015em]">{title}</h2>
      {description ? (
        <p className="text-muted-foreground mt-1.5 max-w-sm text-sm text-pretty">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
