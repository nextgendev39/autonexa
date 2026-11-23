import { FeedSkeleton, PageHeaderSkeleton, PageSkeleton } from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Header, then the inbox: filter rail on the left, the feed panel on the right. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={2} />
      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="bg-card rounded-panel grid gap-3 border p-4 shadow-sm">
          <Skeleton className="h-2.5 w-16" />
          <div className="flex gap-1.5">
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        </div>
        <div className="bg-card rounded-panel overflow-hidden border p-4 shadow-sm">
          <FeedSkeleton rows={6} />
        </div>
      </div>
    </PageSkeleton>
  );
}
