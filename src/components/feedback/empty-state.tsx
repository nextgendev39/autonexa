import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  icon: Icon = InboxIcon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card animate-rise flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center",
        className,
      )}
    >
      <span className="bg-brand-soft text-brand ring-brand-soft animate-float mb-5 flex size-14 items-center justify-center rounded-2xl ring-4">
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="text-muted-foreground mt-1.5 max-w-sm text-sm text-pretty">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
