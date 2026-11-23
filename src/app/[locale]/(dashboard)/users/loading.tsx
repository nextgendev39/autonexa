import {
  MetricStripSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  PanelSkeleton,
  TableSkeleton,
} from "@/components/feedback/skeletons";

/** Header, the metric strip, then the people panel (filter chips + search, table). */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      <MetricStripSkeleton />
      <PanelSkeleton chips={4}>
        <TableSkeleton rows={6} columns={5} lead="avatar" bare />
      </PanelSkeleton>
    </PageSkeleton>
  );
}
