import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BookingDetailClient } from "@/components/bookings/booking-detail-client";
import { ErrorState } from "@/components/feedback/error-state";
import { requirePagePermission } from "@/lib/auth/authorize";
import { getBookingDetail } from "@/lib/bookings/service";
import { maybeRunBookingDeadlineSweep } from "@/lib/notifications/service";

type Props = { params: Promise<{ number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { number } = await params;
  return { title: decodeURIComponent(number) };
}

export default async function BookingPage({ params }: Props) {
  const context = await requirePagePermission("reservation.view");
  const { number } = await params;
  // Apply a deadline that just passed, so the screen shows the current state.
  await maybeRunBookingDeadlineSweep();
  const result = await getBookingDetail(decodeURIComponent(number), context);
  if (result.error) {
    console.error("[bookings] detail failed:", result.error.code, result.error.message);
    return <ErrorState />;
  }
  // Not found also covers bookings the user isn't allowed to see.
  if (!result.data) notFound();
  return <BookingDetailClient booking={result.data} />;
}
