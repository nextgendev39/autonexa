import {
  FilterBarSkeleton,
  KpiRowSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

/** Header, the four summary tiles, tabs with search and sort, then customer cards. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      <KpiRowSkeleton />
      <FilterBarSkeleton tabs={5} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {range(6).map((index) => (
          <div
            key={index}
            className="bg-card ring-foreground/[0.07] flex flex-col overflow-hidden rounded-xl shadow-xs ring-1"
          >
            <div className="grid gap-3 p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="size-11 shrink-0 rounded-full" />
                <div className="grid flex-1 gap-1.5">
                  <div className="flex justify-between gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="grid gap-2">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3.5 w-40" />
              </div>
              <Skeleton className="h-7 w-full rounded-lg" />
            </div>
            <div className="bg-muted/30 flex items-center gap-2 border-t px-3 py-2.5">
              <Skeleton className="size-10 rounded-full sm:size-9" />
              <Skeleton className="size-10 rounded-full sm:size-9" />
              <Skeleton className="ms-auto h-10 w-28 sm:h-9" />
            </div>
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
