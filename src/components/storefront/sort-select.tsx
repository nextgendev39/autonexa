"use client";

import { ArrowUpDownIcon } from "lucide-react";
import { useRef } from "react";

import { NativeSelect } from "@/components/inventory/native-select";

/** Sorting applies as soon as it changes, and still works as a form without JavaScript. */
export function SortSelect({
  action,
  current,
  hidden,
  options,
  label,
}: {
  action: string;
  current: string;
  hidden: Record<string, string>;
  options: { value: string; label: string }[];
  label: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} method="get" action={action} className="ms-auto flex items-center gap-2">
      {Object.entries(hidden).map(([name, value]) =>
        name === "sort" || name === "page" ? null : (
          <input key={name} type="hidden" name={name} value={value} />
        ),
      )}
      <ArrowUpDownIcon className="text-muted-foreground size-4" aria-hidden />
      <label className="sr-only" htmlFor="listing-sort">
        {label}
      </label>
      <NativeSelect
        id="listing-sort"
        name="sort"
        defaultValue={current}
        onChange={() => form.current?.requestSubmit()}
        className="h-10 min-w-48"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      <noscript>
        <button type="submit">{label}</button>
      </noscript>
    </form>
  );
}
