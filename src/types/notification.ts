export type AppNotification = {
  id: string;
  type: string;
  /** Stored English text, used when the type has no translated template. */
  title: string;
  message: string;
  entityId: string | null;
  /** Type-specific values for the translated template. */
  data: Record<string, unknown>;
  href: string;
  createdAt: string;
  read: boolean;
};

/** Payload of booking_auto_cancelled and booking_balance_overdue notifications. */
export type BookingPaymentData = {
  bookingNumber?: string;
  vehicleTitle?: string | null;
  stockNumber?: string | null;
  customerName?: string | null;
  salespersonName?: string | null;
  reservedAt?: string;
  /** The deadline that was missed, in minutes. */
  deadlineMinutes?: number;
  /** Older rows: the deadline in whole days. */
  days?: number;
  currency?: string;
  total?: number;
  paid?: number;
  outstanding?: number;
  /** booking_created / booking_cancelled / booking_sold: who acted, and the cancel reason. */
  actorName?: string | null;
  reason?: string | null;
  /** booking_hold_approved / booking_hold_rejected: the Super Admin's note. */
  note?: string | null;
};
