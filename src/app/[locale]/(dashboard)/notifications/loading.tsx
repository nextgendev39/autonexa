import { PageHeaderSkeleton, PageSkeleton } from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Header with Mark all read / Clear all, the All / Unread filter, then day groups of rows. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={2} />
      <Skeleton className="h-9 w-full rounded-lg md:w-48" />
      {[3, 3].map((rows, group) => (
        <div key={group} className="grid gap-2">
          <Skeleton className="h-3.5 w-20" />
          <div className="bg-card ring-foreground/[0.07] divide-y overflow-hidden rounded-xl shadow-xs ring-1">
            {Array.from({ length: rows }, (_, index) => (
              <div
                key={index}
                className="flex items-start gap-3 py-3.5 ps-4 pe-14 sm:gap-4 sm:ps-5"
              >
                <Skeleton className="size-10 shrink-0 rounded-xl" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </PageSkeleton>
  );
}
