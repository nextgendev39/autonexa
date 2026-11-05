import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  acquired: "bg-slate-600/12 text-slate-900 dark:bg-slate-300/15 dark:text-slate-100",
  under_inspection: "bg-sky-700/12 text-sky-950 dark:bg-sky-300/15 dark:text-sky-100",
  inspection_failed: "bg-rose-700/12 text-rose-950 dark:bg-rose-300/15 dark:text-rose-100",
  under_repair: "bg-orange-700/12 text-orange-950 dark:bg-orange-300/15 dark:text-orange-100",
  ready_for_sale: "bg-emerald-700/12 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-100",
  reserved: "bg-amber-700/12 text-amber-950 dark:bg-amber-300/15 dark:text-amber-100",
  sold: "bg-violet-700/12 text-violet-950 dark:bg-violet-300/15 dark:text-violet-100",
  delivered: "bg-indigo-700/12 text-indigo-950 dark:bg-indigo-300/15 dark:text-indigo-100",
  returned: "bg-fuchsia-700/12 text-fuchsia-950 dark:bg-fuchsia-300/15 dark:text-fuchsia-100",
  archived: "bg-stone-600/12 text-stone-900 dark:bg-stone-300/15 dark:text-stone-100",
  // Acquisition statuses
  draft: "bg-stone-600/12 text-stone-900 dark:bg-stone-300/15 dark:text-stone-100",
  sourcing: "bg-sky-700/12 text-sky-950 dark:bg-sky-300/15 dark:text-sky-100",
  negotiating: "bg-amber-700/12 text-amber-950 dark:bg-amber-300/15 dark:text-amber-100",
  pending_approval: "bg-orange-700/12 text-orange-950 dark:bg-orange-300/15 dark:text-orange-100",
  approved: "bg-emerald-700/12 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-100",
  purchased: "bg-violet-700/12 text-violet-950 dark:bg-violet-300/15 dark:text-violet-100",
  documents_pending: "bg-indigo-700/12 text-indigo-950 dark:bg-indigo-300/15 dark:text-indigo-100",
  received: "bg-teal-700/12 text-teal-950 dark:bg-teal-300/15 dark:text-teal-100",
  cancelled: "bg-rose-700/12 text-rose-950 dark:bg-rose-300/15 dark:text-rose-100",
  rejected: "bg-rose-700/12 text-rose-950 dark:bg-rose-300/15 dark:text-rose-100",
  // Generic workflow statuses
  assigned: "bg-sky-700/12 text-sky-950 dark:bg-sky-300/15 dark:text-sky-100",
  in_progress: "bg-amber-700/12 text-amber-950 dark:bg-amber-300/15 dark:text-amber-100",
  submitted: "bg-indigo-700/12 text-indigo-950 dark:bg-indigo-300/15 dark:text-indigo-100",
  under_review: "bg-orange-700/12 text-orange-950 dark:bg-orange-300/15 dark:text-orange-100",
  // Workshop order / job statuses
  scheduled: "bg-sky-700/12 text-sky-950 dark:bg-sky-300/15 dark:text-sky-100",
  waiting_for_parts: "bg-amber-700/12 text-amber-950 dark:bg-amber-300/15 dark:text-amber-100",
  waiting_for_vendor: "bg-orange-700/12 text-orange-950 dark:bg-orange-300/15 dark:text-orange-100",
  quality_check: "bg-indigo-700/12 text-indigo-950 dark:bg-indigo-300/15 dark:text-indigo-100",
  completed: "bg-emerald-700/12 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-100",
  on_hold: "bg-stone-600/12 text-stone-900 dark:bg-stone-300/15 dark:text-stone-100",
  pending: "bg-stone-600/12 text-stone-900 dark:bg-stone-300/15 dark:text-stone-100",
  // Pricing statuses
  active: "bg-emerald-700/12 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-100",
  discount_approval_required: "bg-orange-700/12 text-orange-950 dark:bg-orange-300/15 dark:text-orange-100",
  below_minimum: "bg-rose-700/12 text-rose-950 dark:bg-rose-300/15 dark:text-rose-100",
  // Booking statuses
  booking_active: "bg-amber-700/12 text-amber-950 dark:bg-amber-300/15 dark:text-amber-100",
  booking_converted: "bg-violet-700/12 text-violet-950 dark:bg-violet-300/15 dark:text-violet-100",
  booking_cancelled: "bg-stone-600/12 text-stone-900 dark:bg-stone-300/15 dark:text-stone-100",
  booking_expired: "bg-rose-700/12 text-rose-950 dark:bg-rose-300/15 dark:text-rose-100",
  // Legacy / non-vehicle statuses still used by mock dashboard
  available: "bg-emerald-700/12 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-100",
  workshop: "bg-sky-700/12 text-sky-950 dark:bg-sky-300/15 dark:text-sky-100",
  new: "bg-sky-700/12 text-sky-950 dark:bg-sky-300/15 dark:text-sky-100",
  contacted: "bg-amber-700/12 text-amber-950 dark:bg-amber-300/15 dark:text-amber-100",
  qualified: "bg-emerald-700/12 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-100",
  confirmed: "bg-emerald-700/12 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-100",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-current/10 ring-inset",
        statusStyles[status] ?? "bg-muted text-foreground",
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current opacity-70" aria-hidden />
      {label}
    </span>
  );
}
