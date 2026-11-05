import { PageHeaderSkeleton, PageSkeleton, TileGridSkeleton } from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Header, the scope switch and type chips with search, then the document tiles. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-44 rounded-lg" />
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-10 w-full md:h-9 lg:max-w-72" />
      </div>
      <TileGridSkeleton />
    </PageSkeleton>
  );
}
