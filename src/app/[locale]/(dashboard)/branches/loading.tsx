import {
  MetricStripSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TileGridSkeleton,
} from "@/components/feedback/skeletons";

/** Header, the metric strip, then the branch cards. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      <MetricStripSkeleton />
      <TileGridSkeleton count={3} className="gap-5 sm:grid-cols-2 2xl:grid-cols-3" />
    </PageSkeleton>
  );
}
