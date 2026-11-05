"use client";

import { useState } from "react";

import { appConfig } from "@/config/app";
import { Input } from "@/components/ui/input";

// Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits, plus the Arabic decimal and
// thousands separators, so the field works with Arabic keyboards too.
function toLatin(text: string) {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

/** Keeps digits and a single decimal point (max 2 decimals); commas are visual only. */
function clean(text: string) {
  const [whole, ...rest] = toLatin(text).replace(/[^\d.]/g, "").split(".");
  return rest.length === 0 ? whole : `${whole}.${rest.join("").slice(0, 2)}`;
}

function parse(text: string): number | null {
  if (text === "" || text === ".") return null;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

const display = (value: number | null) =>
  value == null ? "" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);

export function CurrencyInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  describedBy,
  autoFocus,
}: {
  id: string;
  name?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  // The text is kept as typed ("1200.", "0.5"); converting it to a number on every
  // keystroke would swallow the decimal point and make the field feel locked.
  const [text, setText] = useState(() => display(value));
  // Adopt values set from outside (e.g. a "fill full amount" button).
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    if (value !== parse(clean(text))) setText(display(value));
  }

  return (
    <div className="flex" dir="ltr">
      <span className="border-input bg-muted text-muted-foreground inline-flex h-11 items-center rounded-s-lg border border-e-0 px-3 text-sm md:h-10">
        {appConfig.currency}
      </span>
      <Input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        value={text}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="h-11 rounded-s-none text-base tabular-nums md:h-10"
        onFocus={(event) => {
          // Drop the grouping commas while editing so the caret moves predictably.
          const input = event.target;
          setText(clean(input.value));
          requestAnimationFrame(() => input.select());
        }}
        onChange={(event) => {
          const next = clean(event.target.value);
          setText(next);
          const amount = parse(next);
          setSynced(amount);
          onChange(amount);
        }}
        onBlur={() => {
          setText(display(parse(text)));
          onBlur?.();
        }}
      />
    </div>
  );
}
