import { BookingRowsSkeleton } from "@/components/bookings/booking-list-skeleton";
import {
  MetricStripSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  PanelSkeleton,
} from "@/components/feedback/skeletons";

/** Header, the metric strip, then the bookings panel (filter chips + search, cards, pager). */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      <MetricStripSkeleton />
      <PanelSkeleton chips={5} well footer>
        <BookingRowsSkeleton />
      </PanelSkeleton>
    </PageSkeleton>
  );
}
