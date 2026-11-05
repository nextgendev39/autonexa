"use client";

import { ar, enUS } from "date-fns/locale";

import { Calendar } from "@/components/ui/calendar";

/** Calendar for DateField; split out so react-day-picker loads only when the picker opens. */
export function DateFieldCalendar({
  value,
  onChange,
  locale,
}: {
  value?: Date;
  onChange: (value?: Date) => void;
  locale: string;
}) {
  return (
    <Calendar
      mode="single"
      selected={value}
      onSelect={onChange}
      locale={locale === "ar" ? ar : enUS}
    />
  );
}
