import {
  MetricStripSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  PanelSkeleton,
  TileGridSkeleton,
} from "@/components/feedback/skeletons";

/** Header, the metric strip, then the customers panel (filter chips, search, cards, pager). */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      <MetricStripSkeleton />
      <PanelSkeleton chips={4} well footer>
        <TileGridSkeleton count={6} className="sm:grid-cols-2 2xl:grid-cols-3" />
      </PanelSkeleton>
    </PageSkeleton>
  );
}
