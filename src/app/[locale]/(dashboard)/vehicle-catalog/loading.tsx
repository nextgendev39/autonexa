import { PageHeaderSkeleton, PageSkeleton } from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Header, the path bar, then the Brands / Models / Years / Variants columns. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="grid gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, column) => (
          <div
            key={column}
            className={`bg-card ring-foreground/[0.07] h-[max(26rem,calc(100svh-19rem))] flex-col overflow-hidden rounded-xl shadow-xs ring-1 ${column === 0 ? "flex" : "hidden lg:flex"}`}
          >
            <div className="grid gap-3 border-b p-3">
              <div className="flex items-center gap-2.5">
                <Skeleton className="size-8 rounded-lg" />
                <div className="grid flex-1 gap-1.5">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              {column === 0 ? <Skeleton className="h-8 w-full" /> : null}
            </div>
            <div className="grid gap-1 p-2">
              {Array.from({ length: column === 0 ? 8 : 0 }, (_, row) => (
                <Skeleton key={row} className="h-10 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
