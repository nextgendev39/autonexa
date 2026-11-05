"use client";

import { ChevronDownIcon, XIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Optional leading icon (emoji, lucide node, etc.). */
  icon?: ReactNode;
  /** When set, options are rendered under labeled groups. */
  group?: string;
  /** Optional trailing tag (e.g. a role), shown in the list and on the selected value. */
  badge?: ReactNode;
};

export type SearchableSelectProps = {
  id?: string;
  value?: string | null;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Optional label resolver for option.group keys. */
  groupLabel?: (group: string) => string;
  /** When true, an empty “Any / None” choice is available and the value can be cleared. */
  optional?: boolean;
  /** When false, the search box is hidden. Default true. */
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
};

function OptionIcon({ icon }: { icon?: ReactNode }) {
  if (icon == null) return null;
  if (typeof icon === "string") {
    return (
      <span className="w-5 shrink-0 text-center text-base leading-none" aria-hidden>
        {icon}
      </span>
    );
  }
  return (
    // At least icon-sized; wider artwork such as brand logos keeps its own width.
    <span className="text-muted-foreground flex min-h-4 min-w-4 shrink-0 items-center justify-center [&_svg]:size-4">
      {icon}
    </span>
  );
}

export function SearchableSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  groupLabel,
  optional = false,
  searchable = true,
  disabled = false,
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: SearchableSelectProps) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const emptyLabel = placeholder ?? t("optional");
  const hasValue = Boolean(value);

  const grouped = useMemo(() => {
    const hasGroups = options.some((option) => option.group);
    if (!hasGroups) return [{ key: "", options }];

    const order: string[] = [];
    const map = new Map<string, SearchableSelectOption[]>();
    for (const option of options) {
      const key = option.group ?? "";
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(option);
    }
    return order.map((key) => ({ key, options: map.get(key)! }));
  }, [options]);

  function clearValue(event: React.MouseEvent | React.KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    onValueChange("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            aria-expanded={open}
            className={cn(
              "border-input h-11 w-full justify-between gap-2 px-2.5 font-normal md:h-10",
              !selected && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 text-start">
          {selected ? <OptionIcon icon={selected.icon} /> : null}
          <span className="truncate">{selected?.label ?? emptyLabel}</span>
          {selected?.badge ? <span className="shrink-0">{selected.badge}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          {optional && hasValue ? (
            <span
              role="button"
              tabIndex={-1}
              className="text-muted-foreground hover:text-foreground rounded p-0.5"
              aria-label={t("clear")}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={clearValue}
            >
              <XIcon className="size-3.5" />
            </span>
          ) : null}
          <ChevronDownIcon className="text-muted-foreground size-4 opacity-70" aria-hidden />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-(--anchor-width) min-w-48 p-0">
        <Command>
          {searchable ? <CommandInput placeholder={searchPlaceholder ?? t("search")} /> : null}
          <CommandList>
            <CommandEmpty>{emptyText ?? t("noResults")}</CommandEmpty>
            {optional ? (
              <CommandGroup>
                <CommandItem
                  value={`__empty__ ${emptyLabel}`}
                  data-checked={!hasValue || undefined}
                  onSelect={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                >
                  <span className="text-muted-foreground">{emptyLabel}</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {grouped.map((group) => (
              <CommandGroup
                key={group.key || "default"}
                heading={group.key ? (groupLabel?.(group.key) ?? group.key) : undefined}
              >
                {group.options.map((option) => {
                  const checked = option.value === value;
                  return (
                    <CommandItem
                      key={option.value}
                      value={`${option.label} ${option.value} ${option.group ?? ""}`}
                      data-checked={checked || undefined}
                      onSelect={() => {
                        onValueChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <OptionIcon icon={option.icon} />
                      <span className="truncate">{option.label}</span>
                      {option.badge ? (
                        <span className="ms-auto shrink-0">{option.badge}</span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
