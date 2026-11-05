import { limitShare } from "@/lib/platform/format";
import { cn } from "@/lib/utils";

/** Used against a limit. Turns amber near the limit and red at it. */
export function UsageCell({
  used,
  limit,
  usedLabel,
  limitLabel,
  unlimitedLabel,
}: {
  used: number;
  limit: number | null;
  usedLabel: string;
  limitLabel: string;
  unlimitedLabel: string;
}) {
  const share = limitShare(used, limit);
  return (
    <div className="grid min-w-24 gap-1">
      <span className="text-sm tabular-nums">
        {usedLabel}
        <span className="text-muted-foreground"> / {limit === null ? unlimitedLabel : limitLabel}</span>
      </span>
      {share === null ? null : (
        <div className="bg-muted h-1.5 overflow-hidden rounded-full" role="progressbar" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={cn(
              "h-full rounded-full",
              share >= 100 ? "bg-rose-600" : share >= 80 ? "bg-amber-500" : "bg-emerald-600",
            )}
            style={{ width: `${share}%` }}
          />
        </div>
      )}
    </div>
  );
}
