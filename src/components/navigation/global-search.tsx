"use client";

import { SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { navLabelKey, navigation } from "@/config/navigation";
import { searchGroups } from "@/config/routes";
import { useUserContext } from "@/hooks/use-permission";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { useRouter } from "@/lib/i18n/navigation";

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations();
  const { roles } = useUserContext();
  const router = useRouter();
  const { items, remember } = useRecentSearches();
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  const normalized = query.trim().toLowerCase();
  const pages = navigation
    .flatMap((group) => group.items)
    .map((item) => ({ ...item, labelKey: navLabelKey(item, roles) }))
    .filter((item) => {
      if (!normalized) return false;
      return t(item.labelKey as Parameters<typeof t>[0]).toLowerCase().includes(normalized);
    });

  function go(href: string) {
    if (normalized) remember(normalized);
    onOpenChange(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="text-muted-foreground bg-muted/60 hover:bg-muted h-9 w-9 justify-center border-transparent px-0 shadow-none sm:w-64 sm:justify-start sm:px-3"
        onClick={() => onOpenChange(true)}
      >
        <SearchIcon />
        <span className="hidden truncate sm:inline">{t("search.placeholder")}</span>
        <kbd
          dir="ltr"
          className="bg-background text-muted-foreground ms-auto hidden rounded border px-1.5 py-0.5 font-sans text-[0.65rem] font-medium lg:inline"
        >
          ⌘K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t("search.title")}
        description={t("search.description")}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("search.placeholder")}
            onKeyDown={(event) => {
              if (event.key === "Enter" && normalized) remember(normalized);
            }}
          />
          <CommandList>
            {!normalized && items.length === 0 ? <CommandEmpty>{t("search.empty")}</CommandEmpty> : null}
            {normalized && pages.length === 0 ? <CommandEmpty>{t("search.empty")}</CommandEmpty> : null}
            {!normalized && items.length > 0 ? (
              <CommandGroup heading={t("search.recent")}>
                {items.map((item) => (
                  <CommandItem
                    key={item}
                    value={item}
                    onSelect={() => {
                      setQuery(item);
                      remember(item);
                    }}
                  >
                    {item}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {pages.length > 0 ? (
              <CommandGroup heading={t("search.pages")}>
                {pages.map((item) => (
                  <CommandItem key={item.href} value={item.href} onSelect={() => go(item.href)}>
                    <item.icon />
                    {t(item.labelKey as Parameters<typeof t>[0])}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {normalized
              ? searchGroups.map((group) => (
                  <CommandGroup key={group.id} heading={t(group.labelKey)}>
                    <CommandItem value={`${group.id}-empty`} onSelect={() => go(group.href)}>
                      {t("search.groupEmpty")}
                    </CommandItem>
                  </CommandGroup>
                ))
              : null}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
