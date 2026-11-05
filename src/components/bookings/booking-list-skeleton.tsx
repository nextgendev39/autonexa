import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

/** The four summary tiles: a compact row on phones, stacked label / value / hint above. */
export function BookingSummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {range(4).map((index) => (
        <div
          key={index}
          className="bg-card ring-foreground/[0.07] grid min-w-0 gap-1.5 rounded-xl px-3 py-2.5 shadow-xs ring-1 sm:p-4"
        >
          <div className="flex items-center gap-2.5 sm:justify-between sm:gap-2">
            <Skeleton
              className={cn("size-8 shrink-0 rounded-lg sm:hidden", index === 0 && "bg-brand-soft")}
            />
            <div className="grid flex-1 gap-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-12 sm:hidden" />
              <Skeleton className="h-2.5 w-24 sm:hidden" />
            </div>
            <Skeleton
              className={cn(
                "size-8 shrink-0 rounded-lg max-sm:hidden",
                index === 0 && "bg-brand-soft",
              )}
            />
          </div>
          <Skeleton className="h-7 w-16 max-sm:hidden" />
          <Skeleton className="h-3 w-28 max-sm:hidden" />
        </div>
      ))}
    </div>
  );
}

/** Five tabs with their count pills, then search; side by side from xl like the page. */
export function BookingFilterBarSkeleton() {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="bg-muted flex w-full gap-1 overflow-hidden rounded-lg p-0.5 xl:w-fit">
        {range(5).map((index) => (
          <div
            key={index}
            className={cn(
              "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 xl:flex-none",
              index === 0 && "bg-background shadow-xs",
            )}
          >
            <Skeleton className="h-3 w-12 max-sm:w-8" />
            <Skeleton className="h-5 w-6 rounded-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-full lg:h-9 xl:max-w-xs" />
    </div>
  );
}

/**
 * Booking cards. Like the real rows they're sized by the card, not the window: stacked on
 * phones, two columns on medium cards, one line (with a fixed actions column) on wide ones.
 */
export function BookingRowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="grid gap-3" aria-hidden>
      {range(count).map((index) => (
        <li key={index} className="@container">
          <div
            className={cn(
              "bg-card ring-foreground/[0.07] relative grid gap-4 overflow-hidden rounded-xl p-4 ps-5 shadow-xs ring-1",
              "@2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] @2xl:gap-x-6",
              "@[66rem]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.3fr)_12rem] @[66rem]:items-center",
            )}
          >
            <span className="bg-muted absolute inset-y-0 start-0 w-1" />
            {/* Car photo, number, title */}
            <div className="flex min-w-0 items-start gap-3">
              <Skeleton className="size-14 shrink-0 rounded-lg sm:h-16 sm:w-20" />
              <div className="grid min-w-0 flex-1 gap-2">
                <div className="flex items-center justify-between gap-2 @[66rem]:justify-start">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            {/* Customer */}
            <div className="grid content-start gap-2 border-t pt-3 @2xl:border-0 @2xl:pt-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            {/* Payment */}
            <div className="grid content-start gap-2.5 @2xl:border-t @2xl:pt-3 @[66rem]:border-0 @[66rem]:pt-0">
              <Skeleton className="h-6 w-36 rounded-full" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
            {/* Actions */}
            <div className="flex gap-1.5 border-t pt-3 @2xl:border-t @2xl:pt-3 @[66rem]:border-0 @[66rem]:pt-0">
              <Skeleton className="h-10 flex-1 @[66rem]:h-9" />
              <Skeleton className="size-10 shrink-0 @[66rem]:size-9" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The pager under the list. */
export function BookingPaginationSkeleton() {
  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <Skeleton className="h-4 w-40" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-20" />
      </div>
    </div>
  );
}
