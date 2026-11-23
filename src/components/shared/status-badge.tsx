import { cn } from "@/lib/utils";

/**
 * AutoNexa status pills. Every status maps to one semantic tone so it reads the same on every
 * screen and in both themes:
 *  - available  green  — ready for sale, approved, active, completed, received
 *  - sold       blue   — sold, delivered, purchased, converted
 *  - progress   blue outline — moving through a step (in transit, inspection, sourcing)
 *  - pending    amber  — waiting on someone (booked, pending approval, deposit due)
 *  - rejected   red    — failed, cancelled, rejected, expired
 *  - inactive   grey   — draft, archived, on hold, lost
 */
export const statusTones = {
  available: "border-success/25 bg-success-soft text-success-foreground",
  sold: "border-info/25 bg-info-soft text-info-foreground",
  progress: "border-info/35 bg-card text-info-foreground",
  pending: "border-warning/30 bg-warning-soft text-warning-foreground",
  rejected: "border-destructive/25 bg-danger-soft text-danger-foreground",
  inactive: "border-border bg-muted text-muted-foreground",
  premium: "border-gold/35 bg-gold-soft text-premium-foreground",
} as const;

export type StatusTone = keyof typeof statusTones;

const statusStyles: Record<string, StatusTone> = {
  // Vehicles
  acquired: "progress",
  under_inspection: "progress",
  inspection_failed: "rejected",
  under_repair: "pending",
  ready_for_sale: "available",
  reserved: "pending",
  sold: "sold",
  delivered: "sold",
  returned: "pending",
  archived: "inactive",
  // Acquisitions
  draft: "inactive",
  sourcing: "progress",
  negotiating: "pending",
  pending_approval: "pending",
  approved: "available",
  purchased: "sold",
  documents_pending: "pending",
  received: "available",
  cancelled: "rejected",
  rejected: "rejected",
  // Generic workflow
  assigned: "progress",
  in_progress: "pending",
  submitted: "progress",
  under_review: "pending",
  // Workshop
  scheduled: "progress",
  waiting_for_parts: "pending",
  waiting_for_vendor: "pending",
  quality_check: "progress",
  completed: "available",
  on_hold: "inactive",
  pending: "pending",
  // Pricing
  active: "available",
  discount_approval_required: "pending",
  below_minimum: "rejected",
  // Bookings
  booking_active: "pending",
  booking_converted: "sold",
  booking_cancelled: "inactive",
  booking_expired: "rejected",
  // Other modules
  available: "available",
  workshop: "progress",
  new: "progress",
  contacted: "pending",
  demo_booked: "progress",
  converted: "sold",
  lost: "inactive",
  qualified: "available",
  confirmed: "available",
  inactive: "inactive",
};

export function statusTone(status: string): StatusTone {
  return statusStyles[status] ?? "inactive";
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        statusTones[statusTone(status)],
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}
