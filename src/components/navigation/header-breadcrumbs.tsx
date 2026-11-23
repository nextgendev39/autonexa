"use client";

import { useTranslations } from "next-intl";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { isNavItemActive, navLabelKey, navigation } from "@/config/navigation";
import { useUserContext } from "@/hooks/use-permission";
import { Link, usePathname } from "@/lib/i18n/navigation";

/**
 * Desktop breadcrumbs derived from the navigation config: "Group › Section › Child".
 * Read-only — it adds no routes and shows only labels for the page the user is already on.
 */
export function HeaderBreadcrumbs() {
  const t = useTranslations();
  const pathname = usePathname();
  const { roles } = useUserContext();

  const group = navigation.find((g) =>
    g.items.some((item) => isNavItemActive(pathname, item.href)),
  );
  const item = group?.items.find((entry) => isNavItemActive(pathname, entry.href));

  if (!item) {
    if (pathname.startsWith("/profile")) {
      return (
        <Breadcrumb aria-label={t("common.breadcrumb")} className="hidden min-w-0 lg:block">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{t("nav.profile")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      );
    }
    return null;
  }

  const rest = pathname.slice(item.href.length).split("/").filter(Boolean);
  const last = rest.at(-1);
  const child = !last
    ? null
    : last === "new"
      ? t("common.new")
      : last === "edit"
        ? t("common.edit")
        : t("common.details");
  const sectionLabel = t(navLabelKey(item, roles) as Parameters<typeof t>[0]);

  return (
    <Breadcrumb aria-label={t("common.breadcrumb")} className="hidden min-w-0 lg:block">
      <BreadcrumbList className="flex-nowrap">
        {group?.labelKey ? (
          <>
            <BreadcrumbItem className="text-subtle-foreground">
              {t(group.labelKey as Parameters<typeof t>[0])}
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        ) : null}
        <BreadcrumbItem className="min-w-0">
          {child ? (
            <BreadcrumbLink render={<Link href={item.href} />} className="truncate">
              {sectionLabel}
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className="truncate">{sectionLabel}</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {child ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{child}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
