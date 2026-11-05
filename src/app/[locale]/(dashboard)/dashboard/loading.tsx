import {
  FeedSkeleton,
  KpiRowSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  SectionCardSkeleton,
  TableSkeleton,
} from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Same rows as the dashboard: KPIs, sales and outcomes, team, stock and activity, attention. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={2} />
      <KpiRowSkeleton className="lg:grid-cols-2 lg:gap-3 xl:grid-cols-4" />
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCardSkeleton className="lg:col-span-2" bodyClassName="h-64" />
        <SectionCardSkeleton>
          <div className="grid gap-4">
            <Skeleton className="mx-auto size-40 rounded-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </SectionCardSkeleton>
      </div>
      <SectionCardSkeleton action>
        <TableSkeleton rows={4} columns={6} lead="avatar" />
      </SectionCardSkeleton>
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCardSkeleton className="lg:col-span-2">
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-20 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </SectionCardSkeleton>
        <SectionCardSkeleton>
          <FeedSkeleton rows={5} />
        </SectionCardSkeleton>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCardSkeleton className="lg:col-span-2" action>
          <FeedSkeleton rows={4} />
        </SectionCardSkeleton>
        <SectionCardSkeleton bodyClassName="h-48" />
      </div>
    </PageSkeleton>
  );
}
