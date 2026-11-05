import {
  FilterBarSkeleton,
  KpiRowSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
} from "@/components/feedback/skeletons";

/** Header with Invite, user KPIs, status tabs with search, then the people list. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      <KpiRowSkeleton />
      <FilterBarSkeleton tabs={4} />
      <ListSkeleton columns={5} lead="avatar" />
    </PageSkeleton>
  );
}
