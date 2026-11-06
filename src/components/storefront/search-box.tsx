"use client";

import { useRouter } from "next/navigation";
import { CarFrontIcon, SearchIcon, TagIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Suggestion = {
  kind: "make" | "model" | "vehicle";
  label: string;
  make?: string;
  model?: string;
  stockNumber?: string;
};

/**
 * A search field that suggests makes, models and cars as the visitor types. It's a plain GET form
 * underneath, so it works before JavaScript loads and every search has its own address.
 */
export function SearchBox({
  action,
  vehicleBase,
  defaultValue = "",
  hidden = {},
  className,
  size = "default",
  api = "/api/storefront",
  autoFocus = false,
}: {
  /** The listing page on this site. */
  action: string;
  /** Prefix for a car's page: `${vehicleBase}/${stockNumber}`. */
  vehicleBase: string;
  defaultValue?: string;
  /** Other filters to keep when searching. */
  hidden?: Record<string, string>;
  className?: string;
  size?: "default" | "large";
  /** Where suggestions come from: the live site, or the staff app's preview. */
  api?: string;
  autoFocus?: boolean;
}) {
  const t = useTranslations("storefront");
  const router = useRouter();
  const listId = useId();
  const [term, setTerm] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const value = term.trim();
    if (value.length < 1) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${api}/suggest?q=${encodeURIComponent(value)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { data?: { suggestions?: Suggestion[] } };
        setItems(body.data?.suggestions ?? []);
        setActive(-1);
      } catch {
        /* Typing again cancelled it, or the network is down: no suggestions either way. */
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, term]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const hrefFor = (item: Suggestion) => {
    if (item.kind === "vehicle" && item.stockNumber)
      return `${vehicleBase}/${encodeURIComponent(item.stockNumber)}`;
    const params = new URLSearchParams(hidden);
    params.delete("q");
    params.delete("page");
    if (item.make) params.set("make", item.make);
    if (item.model) params.set("model", item.model);
    const search = params.toString();
    return search ? `${action}?${search}` : action;
  };

  // An emptied field shows nothing, whatever the last answer was.
  const showing = open && term.trim().length > 0 && items.length > 0;
  const large = size === "large";

  return (
    <div ref={box} className={cn("relative", className)}>
      <form method="get" action={action} role="search" className="relative">
        {Object.entries(hidden).map(([name, value]) =>
          name === "q" || name === "page" ? null : (
            <input key={name} type="hidden" name={name} value={value} />
          ),
        )}
        <SearchIcon
          className={cn(
            "text-muted-foreground pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2",
            large ? "size-5" : "size-4",
          )}
          aria-hidden
        />
        <input
          type="search"
          name="q"
          autoFocus={autoFocus}
          value={term}
          autoComplete="off"
          placeholder={t("listing.searchHint")}
          aria-label={t("listing.search")}
          role="combobox"
          aria-expanded={showing}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (!showing) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(items.length - 1, index + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(-1, index - 1));
            } else if (event.key === "Enter" && active >= 0) {
              event.preventDefault();
              router.push(hrefFor(items[active]));
              setOpen(false);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className={cn(
            "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 w-full rounded-lg border ps-11 pe-28 outline-none focus-visible:ring-3",
            large ? "h-14 text-base" : "h-11 text-sm",
          )}
        />
        <button
          type="submit"
          className={cn(
            "absolute end-1.5 top-1/2 -translate-y-1/2 rounded-md px-4 font-semibold",
            large ? "h-11 text-sm" : "h-8 text-xs",
          )}
          style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
        >
          {t("listing.search")}
        </button>
      </form>
      {showing ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("listing.suggestions")}
          className="bg-popover text-popover-foreground ring-border absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-auto rounded-lg p-1.5 shadow-lg ring-1"
        >
          {items.map((item, index) => {
            const Icon =
              item.kind === "vehicle" ? CarFrontIcon : item.kind === "make" ? TagIcon : SearchIcon;
            return (
              <li
                key={`${item.kind}-${item.label}-${index}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
              >
                <a
                  href={hrefFor(item)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                    index === active ? "bg-muted" : "hover:bg-muted",
                  )}
                >
                  <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
