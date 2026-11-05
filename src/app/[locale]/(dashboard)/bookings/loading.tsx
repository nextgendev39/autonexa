import {
  BookingFilterBarSkeleton,
  BookingPaginationSkeleton,
  BookingRowsSkeleton,
  BookingSummarySkeleton,
} from "@/components/bookings/booking-list-skeleton";
import { PageHeaderSkeleton, PageSkeleton } from "@/components/feedback/skeletons";

/** Header, four summary tiles, the five tabs with search, then booking cards and the pager. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      <BookingSummarySkeleton />
      <BookingFilterBarSkeleton />
      <BookingRowsSkeleton />
      <BookingPaginationSkeleton />
    </PageSkeleton>
  );
}
