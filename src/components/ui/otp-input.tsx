"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

import { sanitizeOtpInput } from "@/lib/auth/email-verification";
import { cn } from "@/lib/utils";

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Fires once every box is filled. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /** Accessible name for the group, e.g. "Verification code". */
  label: string;
  /** Accessible name per box, receives the 1-based index. */
  digitLabel: (index: number) => string;
  describedBy?: string;
  className?: string;
};

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  invalid,
  autoFocus,
  label,
  digitLabel,
  describedBy,
  className,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? "");

  function focusBox(index: number) {
    const target = refs.current[Math.max(0, Math.min(length - 1, index))];
    target?.focus();
    target?.select();
  }

  function commit(next: string, focusIndex: number) {
    const clean = sanitizeOtpInput(next, length);
    onChange(clean);
    focusBox(focusIndex);
    if (clean.length === length) onComplete?.(clean);
  }

  function handleInput(index: number, raw: string) {
    const typed = sanitizeOtpInput(raw, length);
    if (!typed) return;
    // Typing over a box, or an OS autofill dropping the whole code into one box.
    const before = value.slice(0, index);
    const next = (before + typed).slice(0, length);
    commit(next, Math.min(next.length, length - 1));
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) {
        commit(value.slice(0, index) + value.slice(index + 1), index);
      } else if (index > 0) {
        commit(value.slice(0, index - 1) + value.slice(index), index - 1);
      }
      return;
    }
    // Boxes are always laid out LTR, so arrows map directly to index order.
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = sanitizeOtpInput(event.clipboardData.getData("text"), length);
    if (!pasted) return;
    commit(pasted, Math.min(pasted.length, length - 1));
  }

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      dir="ltr"
      className={cn("flex w-full justify-between gap-2 sm:justify-center sm:gap-3", className)}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={length}
          autoFocus={autoFocus && index === 0}
          disabled={disabled}
          value={digit}
          aria-label={digitLabel(index + 1)}
          aria-invalid={invalid || undefined}
          onChange={(event) => handleInput(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          className={cn(
            "border-input bg-background dark:bg-input/30 h-14 w-11 min-w-0 flex-1 rounded-lg border text-center text-2xl font-semibold tabular-nums shadow-xs transition-[color,box-shadow] outline-none sm:h-14 sm:w-12 sm:flex-none",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          )}
        />
      ))}
    </div>
  );
}
