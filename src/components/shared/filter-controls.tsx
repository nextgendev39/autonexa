"use client";

import { ChevronDownIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 300;

/** Text input that commits to the URL ~300ms after the user stops typing. */
export function DebouncedFilterInput({
  value,
  onCommit,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "defaultValue"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Input
      {...props}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const trimmed = next.trim();
          if (trimmed === committed.current) return;
          committed.current = trimmed;
          onCommitRef.current(trimmed);
        }, DEBOUNCE_MS);
      }}
    />
  );
}

export function FilterChip({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className={cn(
        "border-border bg-muted/60 text-foreground hover:bg-muted inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
      )}
      aria-label={`${label}: ${value}. Remove filter`}
    >
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="truncate font-medium">{value}</span>
      <XIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
    </button>
  );
}

export function FilterGroup({
  title,
  children,
  dense = false,
  collapsible = false,
  defaultOpen,
  activeCount = 0,
}: {
  title: string;
  children: React.ReactNode;
  /** Single-column layout for filter drawers. */
  dense?: boolean;
  /** Accordion-style section for filter drawers. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Highlights the section when it contributes active filters. */
  activeCount?: number;
}) {
  const initiallyOpen = defaultOpen ?? (collapsible ? activeCount > 0 : true);
  const [open, setOpen] = useState(initiallyOpen || activeCount > 0);

  // Open the section as soon as it gets active filters (during render, not in an effect).
  const [seenActiveCount, setSeenActiveCount] = useState(activeCount);
  if (activeCount !== seenActiveCount) {
    setSeenActiveCount(activeCount);
    if (activeCount > 0) setOpen(true);
  }

  const fields = (
    <div className={cn("grid gap-3", dense ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-4")}>
      {children}
    </div>
  );

  if (!collapsible) {
    return (
      <div className="grid gap-3">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </p>
        {fields}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-background overflow-hidden rounded-xl border transition-colors",
        activeCount > 0 ? "border-foreground/15" : "border-border",
      )}
    >
      <button
        type="button"
        className="hover:bg-muted/50 flex w-full items-center gap-2 px-3.5 py-3 text-start transition-colors"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 flex-1 text-sm font-medium tracking-tight">{title}</span>
        {activeCount > 0 ? (
          <Badge variant="secondary" className="tabular-nums">
            {activeCount}
          </Badge>
        ) : null}
        <ChevronDownIcon
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-border/70 space-y-0 border-t px-3.5 py-3.5">{fields}</div>
      ) : null}
    </div>
  );
}

export function FilterToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
  );
}
