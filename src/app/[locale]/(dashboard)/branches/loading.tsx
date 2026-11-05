import { KpiRowSkeleton, PageHeaderSkeleton, PageSkeleton } from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Header, the summary cards, then branch cards with their carbon header and stats strip. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      <KpiRowSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="bg-card ring-foreground/[0.07] overflow-hidden rounded-xl shadow-xs ring-1"
          >
            <div className="bg-carbon flex items-start gap-3 px-5 pt-5 pb-4">
              <span className="bg-gold size-11 shrink-0 rounded-lg opacity-50" />
              <div className="grid flex-1 gap-2">
                <span className="h-4 w-2/3 rounded bg-white/10" />
                <span className="h-3 w-1/2 rounded bg-white/10" />
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x border-b rtl:divide-x-reverse">
              {Array.from({ length: 3 }, (_, stat) => (
                <div key={stat} className="grid justify-items-center gap-1.5 px-3 py-3">
                  <Skeleton className="h-6 w-8" />
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
            <div className="grid gap-4 p-5">
              <Skeleton className="h-1.5 w-full rounded-full" />
              <Skeleton className="h-3.5 w-3/4" />
              <div className="flex items-center gap-2 border-t pt-4">
                <Skeleton className="size-9" />
                <Skeleton className="size-9" />
                <Skeleton className="ms-auto h-4 w-28" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
