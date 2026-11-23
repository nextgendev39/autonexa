import {
  FeedSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  SectionCardSkeleton,
  TableSkeleton,
} from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Same shape as the dashboard: hero band, then the 8/4 grid. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      <div className="bg-brand-panel grid gap-6 rounded-2xl p-5 sm:p-7 lg:grid-cols-[1.1fr_2fr]">
        <div className="grid gap-4">
          <Skeleton className="h-2.5 w-32 bg-white/10" />
          <Skeleton className="h-12 w-48 bg-white/10" />
          <Skeleton className="h-3.5 w-40 bg-white/10" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="grid gap-3">
              <Skeleton className="h-3 w-24 bg-white/10" />
              <Skeleton className="h-8 w-20 bg-white/10" />
              <Skeleton className="h-3 w-28 bg-white/10" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-12">
        <div className="grid gap-6 xl:col-span-8">
          <SectionCardSkeleton bodyClassName="h-64" />
          <SectionCardSkeleton action>
            <FeedSkeleton rows={3} />
          </SectionCardSkeleton>
          <SectionCardSkeleton>
            <div className="grid gap-5">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-3 w-full rounded-full" />
            </div>
          </SectionCardSkeleton>
          <SectionCardSkeleton action>
            <TableSkeleton rows={4} columns={6} lead="avatar" />
          </SectionCardSkeleton>
        </div>
        <div className="grid gap-6 xl:col-span-4">
          <SectionCardSkeleton>
            <Skeleton className="mx-auto size-40 rounded-full" />
          </SectionCardSkeleton>
          <SectionCardSkeleton>
            <FeedSkeleton rows={5} />
          </SectionCardSkeleton>
          <SectionCardSkeleton bodyClassName="h-40" />
        </div>
      </div>
    </PageSkeleton>
  );
}
