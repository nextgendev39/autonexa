"use client";

import { useTranslations } from "next-intl";

import { isNavItemActive, navLabelKey, navigation } from "@/config/navigation";
import { useOptionalUserContext } from "@/hooks/use-permission";
import { usePathname } from "@/lib/i18n/navigation";

/**
 * The champagne eyebrow above a page title, derived from the navigation config: the group
 * on a section's own page ("Operations"), the section on its child pages ("Inventory").
 * Renders nothing for routes outside the navigation.
 */
export function PageEyebrow() {
  const t = useTranslations();
  const pathname = usePathname();
  const user = useOptionalUserContext();
  const group = navigation.find((g) =>
    g.items.some((item) => isNavItemActive(pathname, item.href)),
  );
  const item = group?.items.find((entry) => isNavItemActive(pathname, entry.href));
  if (!group || !item) return null;

  const child = pathname.length > item.href.length;
  const key = child || !group.labelKey ? navLabelKey(item, user?.roles ?? []) : group.labelKey;
  return <p className="eyebrow mb-2">{t(key as Parameters<typeof t>[0])}</p>;
}
